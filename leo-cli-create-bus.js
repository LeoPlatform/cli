#!/usr/bin/env node

const program = require('commander');
const colors = require('colors');
const aws = require('aws-sdk');
let prompt = require("prompt-sync")();

const waitFor = (ms) => new Promise(r => setTimeout(r, ms));
const asyncForEach = async (array, callback) => {
	for (let index = 0; index < array.length; index++) {
		await callback(array[index], index, array)
	}
};

program
	.version('0.0.1')
	.usage('--profile <profile> --region <region>')
	.option('-p, --profile', 'AWS Profile')
	.option('-r, --region', 'AWS Region')
	.action(async function(profile, region) {
		console.log('profile', profile);
		let credentials = require('./lib/leo-aws')(profile);
		// aws.config.credentials = credentials;
		let cloudformation = new aws.CloudFormation({
			credentials: credentials,
			region: region
		});

		let stacknames = [];
		// get existing stacks
		let stacks = await listStacks(cloudformation, profile, region);

		stacks.StackSummaries.forEach((stack) => {
			stacknames[stack.StackName] = stack.StackStatus;
		});

		let stackPrefix = promptValidate('Stack Prefix', 'Dev', stacknames);
		let newstacks = buildStackParams(stackPrefix);

		await asyncForEach(newstacks, async (stack) => {
			let result = await createStack(cloudformation, stack);

			console.log(result);
			console.log('done building stack', stack.StackName);
		});
	})
	.parse(process.argv);

// make sure region and profile are passed
if (!program.profile || !program.region) {
	program.outputHelp(colors.red);
}

async function listStacks(cloudformation)
{
	return new Promise((resolve, reject) => {
		cloudformation.listStacks({}, (err, data) => {
			if (err) {
				reject(err);
			} else {
				resolve(data);
			}
		});
	});
}

function promptValidate(questionText, defaultVal, stacks)
{
	let promptResponse = prompt(`${questionText} [${defaultVal}]: `);

	// trim the response only if it has length to begin with, otherwise it may error.
	if (promptResponse.length) {
		promptResponse = promptResponse.trim();
	}

	if (promptResponse.length) {
		// make sure that stack doesn't already exist
		if (stacks[promptResponse + 'Bus'] && stacks[promptResponse + 'Bus'] !== 'DELETE_COMPLETE') {
			console.log('Stack prefix already in use. Please use a different prefix.');
			return promptValidate(questionText, defaultVal, stacks);
		}
		return promptResponse;
	} else {
		if (defaultVal.length) {
			return defaultVal;
		} else {
			console.log('You must an input a value to continue');
			return promptValidate(questionText, defaultVal, stacks);
		}
	}
}

function buildStackParams(prefix)
{
	let stacks = [];
	stacks.push({
		StackName: `${prefix}Bus`,
		TemplateURL: 'https://s3-us-west-2.amazonaws.com/leo-cli-publishbucket-1rgojx1iw5yq9/leo-bus/release/cloudformation-latest.json',
		Capabilities: ['CAPABILITY_IAM'],
		OnFailure: "DELETE"
	});
	stacks.push({
		StackName: `${prefix}Auth`,
		TemplateURL: 'https://s3-us-west-2.amazonaws.com/leo-cli-publishbucket-1rgojx1iw5yq9/auth/1.0.3/cloudformation.json',
		Capabilities: ['CAPABILITY_IAM'],
		OnFailure: "DELETE"
	});
	stacks.push({
		StackName: `${prefix}Botmon`,
		TemplateURL: 'https://s3-us-west-2.amazonaws.com/leo-cli-publishbucket-1rgojx1iw5yq9/botmon/release/cloudformation-latest.json',
		Parameters: [
			{
				ParameterKey: 'CognitoId',
				ParameterValue: 'us-west-2:ed5e5de6-8142-417f-83bf-34238b7ddd9d'
			},
			{
				ParameterKey: 'leoauth',
				ParameterValue: `${prefix}Auth`
			},
			{
				ParameterKey: 'leosdk',
				ParameterValue: `${prefix}Bus`
			}
		],
		Capabilities: ['CAPABILITY_IAM'],
		OnFailure: "DELETE"
	});

	return stacks;
}

async function createStack(cloudformation, stack)
{
	return new Promise((resolve, reject) => {
		cloudformation.createStack(stack, async (err, data) => {
			if (err) {
				reject(err);
			}

			resolve(await checkBuildStatus(cloudformation, stack.StackName));
		});
	});
}

async function checkBuildStatus(cloudformation, stackName)
{
	return new Promise(async (resolve, reject) => {
		let stacks = await listStacks(cloudformation);

		stacks.StackSummaries.forEach(async (stack) => {
			if (stack.StackName === stackName) {
				switch (stack.StackStatus) {
					case 'CREATE_IN_PROGRESS':
					case 'DELETE_COMPLETE':
						console.log('Stack Status is:', stack.StackStatus + '. Waiting for stack to be created. Please wait.');
						await countdownTimer(30);
						resolve(await checkBuildStatus(cloudformation, stackName));
					break;

					case 'CREATE_FAILED':
					case 'ROLLBACK_IN_PROGRESS':
					case 'ROLLBACK_COMPLETE':
						reject('Stack creation unsuccessful.');
					break;

					case 'CREATE_COMPLETE':
						resolve(stack.StackStatus);
					break;

					default:
						console.log('status is weird:', stack.StackStatus);
						resolve(stack.StackStatus);
					break;
				}
			}
		});
	});
}

async function countdownTimer(seconds)
{
	return new Promise((resolve, reject) => {
		let myinterval = setInterval(function() {
			process.stdout.clearLine();  // clear current text
			process.stdout.cursorTo(0);  // move cursor to beginning of line
			process.stdout.write((seconds--).toString());

			if (seconds < 0) {
				clearInterval(myinterval);
				process.stdout.clearLine();  // clear current text

				resolve('done');
			}
		}, 1000);
	});
}


// let stackSetname = prompt('stack set name: ').trim();
//
// let accountId = await getAccountId(credentials, region);
// console.log('account', accountId);
//
// let stackSet = await createStackSet(cloudformation, stackSetname);
// console.log('stackset created', stackSet);
//
// let instance = await createStackInstance(cloudformation, {
// 	accountId: accountId,
// 	region: region,
// 	stackSetName: stackSetname
// });
// console.log('instance created', instance);

// let stackSetName = 'testing3';
// let instance = {
// 	OperationId: '9f40df6b-13ed-40a7-ac23-3a902a7027f6'
// };

// await describeStackSetOperation(cloudformation, stackSetName, instance);

// async function describeStackSetOperation(cloudformation, stackSetName, instance)
// {
// 	return new Promise(async (resolve, reject) => {
// 		cloudformation.describeStackSetOperation({
// 			StackSetName: stackSetName,
// 			OperationId: instance.OperationId
// 		}, async (err, data) => {
// 			if (err) {
// 				reject(err);
// 			} else {
// 				let status = data.StackSetOperation.Status;
//
// 				if (status === 'RUNNING') {
// 					console.log('still running. Re-checking in 30 seconds');
// 					await countdownTimer(30);
// 					resolve(await describeStackSetOperation(cloudformation, stackSetName, instance));
// 				} else {
// 					console.log(data);
// 					reject(status);
// 				}
// 			}
// 			console.log(data);
// 		});
// 	})
// }
//
// async function createStackSet(cloudformation, stackSetName)
// {
// 	let stackSet = {
// 		StackSetName: stackSetName,
// 		Capabilities: ['CAPABILITY_IAM'],
// 		TemplateURL: stacksetUrl
// 	};
//
// 	return new Promise((resolve, reject) => {
// 		cloudformation.createStackSet(stackSet, (err, data) => {
// 			if (err) {
// 				reject(err);
// 			} else {
// 				resolve(data);
// 			}
// 		});
// 	});
// }
//
// async function createStackInstance(cloudformation, opts)
// {
// 	opts = Object.assign({
// 		accountId: '',
// 		region: '',
// 		stackSetName: ''
// 	}, opts || {});
//
// 	let params = {
// 		Accounts: [opts.accountId],
// 		Regions: [opts.region],
// 		StackSetName: opts.stackSetName,
// 	};
//
// 	return new Promise((resolve, reject) => {
// 		cloudformation.createStackInstances(params, (err, data) => {
// 			if (err) {
// 				reject(err);
// 			} else {
// 				resolve(data);
// 			}
// 		});
// 	});
// }
//
// async function getAccountId(credentials, region)
// {
// 	let iam = new aws.IAM({
// 		credentials: credentials,
// 		region: region
// 	});
//
// 	return new Promise((resolve, reject) => {
// 		iam.getUser({}, (err, data) => {
// 			if (err) {
// 				reject(err);
// 			} else {
// 				let arn = data.User.Arn;
//
// 				// arn looks like: arn:aws:iam::123456789012:username
// 				let userdata = arn.split(/^arn\:aws\:iam\:\:(\d+)\:.*$/);
//
// 				resolve(userdata[1]);
// 			}
// 		});
// 	})
// }
