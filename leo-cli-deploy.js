#!/usr/bin/env node

var path = require('path');
var program = require('commander');
var colors = require('colors');
var buildConfig = require("./lib/build-config").build;
var cloudformation = require("./lib/cloud-formation.js");
var fs = require("fs");

program
	.version('0.0.1')
	.option("--region [region]", "Region to run cloudformation")
	.option("--url [url]", "s3 url to cloudformation.json")
	.option("--awsprofile [awsprofile]", "AWS Profile to use")
	.option("--tag [tag]", "Tag for publish directory.  eg. prod")
	.usage('<dir> <stack> [options]')
	.action(function (dir, stack) {
		let rootDir = path.resolve(process.cwd(), dir);
		let configure = buildConfig(rootDir);
		if (configure.type !== "microservice" && configure._meta.microserviceDir) {
			rootDir = configure._meta.microserviceDir;
			configure = buildConfig(rootDir);
		}

		if (program.awsprofile || configure.aws.profile) {
			process.env.LEO_AWS_PROFILE = program.awsprofile || configure.aws.profile;
		}
		program.region = program.region || (configure.regions || [])[0] || "us-west-2";

		program.tag = (program.tag ? (program.tag.match(/^[\/\\]/) ? program.tag : `/${program.tag}`) : "").replace(/\\/g, "/");
		if (stack && typeof stack === "string") {
			cloudformation.getBuckets([program.region], {}, (err, buckets) => {
				const cloudFormationFile = path.resolve(path.resolve(dir, "cloudformation.json"));
				const microservice = JSON.parse(fs.readFileSync(path.resolve(path.resolve(dir, "package.json"))));

				if (!fs.existsSync(cloudFormationFile)) {
					console.log("cloudformation.json file doesn't exist.\nRun the command 'leo-cli publish .'")
					process.exit();
				}
				let version = microservice.version;
				let s3region = program.region == "us-east-1" ? "" : "-" + program.region;
				let bucket = {
					region: program.region,
					url: program.url || `https://s3${s3region}.amazonaws.com/${buckets[0].bucket}/${microservice.name}${program.tag}/${version}/`,
					cloudFormation: JSON.parse(fs.readFileSync(cloudFormationFile))
				};
				let url = bucket.url + "cloudformation.json"
				let updateStart = Date.now();
				console.log(`\n---------------Updating stack "${stack}"---------------`);
				console.log(`url: ${url}`);
				let progress = setInterval(() => {
					process.stdout.write(".")
				}, 2000);
				cloudformation.run(stack, program.region, url, {
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
			});
		} else {
			console.log("parameter 'stack' is required");
		}

	})
	.parse(process.argv);

if (!process.argv.slice(2).length) {
	program.outputHelp(colors.red);
}