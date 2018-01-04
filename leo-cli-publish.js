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
	.option("--patch [stack]", "Stack to get original cloudformation")
	.option("--region [region]", "Region to run cloudformation")
	.option("--force [bots]", "Force bots to publish")
	.option("--filter [bots]", "Filter bots to publish")
	.usage('<dir> [options]')
	.action(function (dir) {
		let env = program.env || "dev";
		// console.log(env)
		let rootDir = path.resolve(process.cwd(), dir);

		let configure = buildConfig(rootDir);

		let filter = program.filter;
		let force = program.force;
		if (configure.type !== "microservice" && configure._meta.microserviceDir) {
			filter = rootDir.replace(/^.*?(bots|api)[\\/]/, "")
			force = filter;
			rootDir = configure._meta.microserviceDir;
			configure = buildConfig(rootDir);
		}

		if (configure.aws.profile) {
			console.log("Setting aws profile to", configure.aws.profile);
			var credentials = new aws.SharedIniFileCredentials({
				profile: configure.aws.profile
			});
			aws.config.credentials = credentials;
			process.env.AWS_DEFAULT_PROFILE = configure.aws.profile;
		}

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

		start.then(cf => createCloudFormation(configure._meta.microserviceDir, {
			config: configure,
			filter: filter,
			publish: program.run || !program.build,
			force: force,
			regions: program.region ? [].concat(program.region) : configure.regions,
			public: program.public,
			cloudformation: cf,
			overrideCloudFormationFile: !cf,
			alias: process.env.LEO_ENV,
			region: process.env.LEO_REGION
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
							UsePreviousValue: true
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