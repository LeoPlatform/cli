/* Set by container */
process.env.AWS_DEFAULT_REGION = process.env.AWS_REGION = process.env.AWS_REGION || "us-west-2";
// process.env.LEO_EVENT = JSON.stringify({
// 	"__cron": {
// 		"id": "quickstart3-sampleload",
// 		"name": "devquickstart3-Quickstart3Sampleload-1ULM9A12WT08J",
// 		"ts": Date.now(),
// 		"force": true,
// 		"iid": "0"
// 	},
// 	"botId": "quickstart3-sampleload"
// });

// VPC Setup

/*  Code  */
let spawnSync = require('child_process').spawnSync;
let http = require("http");
let https = require("https");
let zlib = require("zlib");
let fs = require("fs");
let path = require("path");
let aws = require("aws-sdk");

handler();
async function handler() {
	let event = await buildEvent();
	process.env.AWS_LAMBDA_FUNCTION_NAME = process.env.AWS_LAMBDA_FUNCTION_NAME || event.__cron.name;
	let FunctionName = process.env.AWS_LAMBDA_FUNCTION_NAME;


	let lambda = new aws.Lambda({
		region: process.env.AWS_REGION
	});

	var sts = new aws.STS({
		region: process.env.AWS_REGION
	});

	lambda.getFunction({
		FunctionName: FunctionName
	}, (err, functionData) => {
		if (err) {
			console.log(`Cannot fund function: ${FunctionName}`, err);
			process.exit();
		}
		functionData.Configuration.Timeout *= 10;

		//console.log(JSON.stringify(functionData, null, 2))

		// Assume the lambda's role
		let role = functionData.Configuration.Role;
		aws.config.credentials = new aws.TemporaryCredentials({
			RoleArn: role
		});
		aws.config.credentials.get(function(err, roleData) {
			if (err) {
				console.log("Cannot assume role", err);
				process.exit();
			}

			// Set all Environment for the lambda.  should this be done on container invoke?
			Object.keys(functionData.Configuration.Environment.Variables).map(key => {
				process.env[key] = functionData.Configuration.Environment.Variables[key];
			});

			importModule(functionData.Code.Location, {
				main: `${functionData.Configuration.Handler.split(".")[0]}.js`,
				handler: functionData.Configuration.Handler.split(".")[1],
				lastModified: functionData.Configuration.LastModified,
				Configuration: functionData.Configuration
			}, (err, data) => {
				if (err) {
					console.log(err);
					return callback(err);
				}
				let context = createContext(data.Configuration || {});
				let handler = data.module[data.handler || "handler"];
				handler(event, context, (err, data) => {
					console.log("All Done", err, data);
					process.exit();
				});
			});

		});
	});
	let importModule = function(url, data, callback) {
		data = Object.assign({
			main: "index.js",
			index: "handler"
		}, data);
		let zipPath = path.resolve("", `/tmp/run_${FunctionName}.zip`);
		let indexPath = path.resolve("", `/tmp/run_${FunctionName}/${data.main}`);
		let folder = path.resolve("", `/tmp/run_${FunctionName}`)
		let stats;
		if (fs.existsSync(zipPath) && fs.existsSync(indexPath)) {
			stats = fs.statSync(zipPath);
		}

		console.log("Downloading", url)
		https.get(url, (res) => {
			res.pipe(fs.createWriteStream(zipPath)).on("finish", () => {
				console.log("Done Downloading")
				let o = spawnSync("unzip", ["-o", zipPath, "-d", folder]);
				console.log(o.stdout.toString());
				console.error(o.stderr.toString());
				console.log("Done Extracting")
				data.module = require(indexPath);
				callback(null, data);
			})
		}).on("error", (err) => {
			console.log("Error Downloading", err);
			callback(err);
		});
	}
}

async function buildEvent() {
	if (!process.env.LEO_EVENT && (!process.env.AWS_LAMBDA_FUNCTION_NAME || !process.env.BOT) && (!process.env.LEO_CRON && !process.env.AWS_LAMBDA_FUNCTION_NAME && !process.env.BOT)) {
		console.log("(LEO_CRON and Bot) or (AWS_LAMBDA_FUNCTION_NAME and BOT) or LEO_EVENT are required as environment variables")
		process.exit();
	}

	let event = process.env.LEO_EVENT && JSON.parse(process.env.LEO_EVENT);
	if (event) {
		return event;
	}

	var docClient = new aws.DynamoDB.DocumentClient({
		region: process.env.AWS_REGION,
		maxRetries: 2,
		convertEmptyValues: true,
		httpOptions: {
			connectTimeout: 2000,
			timeout: 5000,
			agent: new https.Agent({
				ciphers: 'ALL',
			})
		}
	});

	let id = process.env.BOT;
	let lambdaName = process.env.AWS_LAMBDA_FUNCTION_NAME;
	let entry;
	if (!id) {
		// Scan table for lambda name;
		entry = await new Promise((resolve, reject) => docClient.scan({
			Key: {
				id: id
			},
			TableName: process.env.LEO_CRON,
			FilterExpression: "lambdaName = :value",
			ExpressionAttributeValues: {
				":value": lambdaName
			}
		}, (err, data) => {
			if (err) reject(err);
			else resolve(data.Items[0]);
		}))
		id = entry.id;
	}
	if (!lambdaName) {
		// Lookup lambda name
		entry = await new Promise((resolve, reject) => docClient.get({
			Key: {
				id: id
			},
			TableName: process.env.LEO_CRON
		}, (err, data) => {
			if (err) reject(err);
			else resolve(data.Item);
		}));
		lambdaName = entry.lambdaName;
	}

	return Object.assign({}, entry.lambda && entry.lambda.settings && entry.lambda.settings[0] || {}, {
		__cron: {
			id: id,
			name: lambdaName,
			ts: Date.now(),
			iid: "0",
			force: true
		},
		botId: id
	});
}

function createContext(config) {
	var start = new Date();
	var maxTime = config.Timeout ? config.Timeout * 1000 : (10 * 365 * 24 * 60 * 60 * 1000); // Default is 10 years
	return {
		awsRequestId: "requestid-local" + Date.now().toString(),
		getRemainingTimeInMillis: function() {
			var timeSpent = new Date() - start;
			if (timeSpent < maxTime) {
				return maxTime - timeSpent;
			} else {
				return 0;
			}
		}
	};
}
