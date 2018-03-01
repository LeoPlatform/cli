#!/usr/bin/env node

var path = require('path');
var program = require('commander');
var colors = require('colors');
var buildConfig = require("./lib/build-config").build;
var cloudformation = require("./lib/cloud-formation.js");
var createCloudFormation = cloudformation.createCloudFormation;
var aws = require("aws-sdk");

program
	.version('0.0.1')
	.option("-e, --env [env]", "Environment")
	.option("--build", "Only build")
	.option("--public", "Make published version public")
	.option("--run [stack]", "Run the published cloudformation")
	.option("--deploy [stack]", "Deploys the published cloudformation")
	.option("--patch [stack]", "Stack to get original cloudformation")
	.option("--region [region]", "Region to run cloudformation")
	.option("--force [force]", "Force bots to publish")
	.option("--filter [filter]", "Filter bots to publish")
	.option("--awsprofile [awsprofile]", "AWS Profile to use")
	.option("--tag [tag]", "Tag for publish directory.  eg. prod")
	.usage('<dir> [options]')
	.action(function (dir) {
		let env = program.env || "dev";
		// console.log(env)
		let rootDir = path.resolve(process.cwd(), dir);
		program.run = program.run || program.deploy;

		let configure = buildConfig(rootDir);

		let filter = program.filter;
		let force = program.force;
		if (configure.type !== "microservice" && configure._meta.microserviceDir) {
			filter = rootDir.replace(/^.*?(bots|api)[\\/]/, "")
			force = filter;
			rootDir = configure._meta.microserviceDir;
			configure = buildConfig(rootDir);
		}

		if (program.awsprofile || configure.aws.profile) {
			process.env.LEO_AWS_PROFILE = program.awsprofile || configure.aws.profile;
		}
		// if (configure.aws.profile) {
		// 	console.log("Setting aws profile to", process.env.LEO_AWS_PROFILE);
		// 	var credentials = require("./lib/leo-aws")(process.env.LEO_AWS_PROFILE);
		// 	aws.config.credentials = credentials;
		// 	process.env.AWS_DEFAULT_PROFILE = process.env.LEO_AWS_PROFILE;
		// }

		program.region = program.region || (configure.regions || [])[0] || "us-west-2";

		process.env.LEO_ENV = env;
		process.env.LEO_REGION = program.region;

		let start = Promise.resolve();

		if (program.patch) {
			if (program.run) {
				program.run = program.patch;
			}

			// Get current CloudFormation for patch
			start = cloudformation.get(program.patch, program.region).then(data => {
				return undefined;
			});
		}

		let regions = Array.from(new Set([].concat(program.region).concat(configure.regions))).filter(a => !!a);
		start.then(cf => createCloudFormation(configure._meta.microserviceDir, {
			config: configure,
			filter: filter,
			publish: program.run || !program.build,
			force: force,
			regions: regions.length && regions, // program.region ? [].concat(program.region) : configure.regions,
			public: program.public,
			cloudformation: cf,
			overrideCloudFormationFile: !cf && !program.build,
			alias: process.env.LEO_ENV,
			region: process.env.LEO_REGION,
			tag: program.tag
		}).then((data) => {

			if (program.run || !program.build) {
				console.log("\n---------------Publish Complete---------------");
			} else {
				console.log("\n---------------Build Complete---------------");
			}
			if (program.run && typeof program.run === "string") {
				let bucket = data.filter(d => d.region == program.region)[0];
				let url = bucket.url + "cloudformation.json"
				let updateStart = Date.now();
				console.log(`\n---------------Updating stack "${program.run}"---------------`);
				console.log(`url: ${url}`);
				let progress = setInterval(() => {
					process.stdout.write(".")
				}, 2000);
				cloudformation.run(program.run, program.region, url, {
					Parameters: Object.keys(bucket.cloudFormation.Parameters || {}).map(key => {
						return {
							ParameterKey: key,
							UsePreviousValue: true,
							NoEcho: bucket.cloudFormation.Parameters[key].NoEcho
						}
					})
				}).then(data => {
					clearInterval(progress);
					console.log(` Update Complete ${Date.now() - updateStart}`);
				}).catch(err => {
					clearInterval(progress);
					console.log(" Update Error:", err);
				});
			}
		})).catch(err => {
			console.log(err);
		});
	})
	.parse(process.argv);

if (!process.argv.slice(2).length) {
	program.outputHelp(colors.red);
}