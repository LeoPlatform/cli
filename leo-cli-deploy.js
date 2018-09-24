#!/usr/bin/env node

var path = require('path');
var program = require('commander');
var colors = require('colors');
var buildConfig = require("./lib/build-config").build;
var cloudformation = require("./lib/cloud-formation.js");
var fs = require("fs");

program
	.version('0.0.1')
	.option("-e, --env [env]", "Environment")
	.option("--region [region]", "Region to run cloudformation")
	.option("--url [url]", "s3 url to cloudformation.json")
	.option("--tag [tag]", "Tag for publish directory.  eg. prod")
	.option("--ver [ver]", "Version to deploy.")
	.option("--build [build]", "Build number to deploy from the version.")
	.option('-F --force-deploy', 'Automatically deploy without requesting verification of changeset')
	.usage('[options]');


const progressInterval = {
	interval: undefined,
	start: () => {
		this.interval = setInterval(() => {
			process.stdout.write(".")
		}, 2000);
	},
	stop: () => {
		clearInterval(this.interval);
	}
};

(async function run() {
	program.parse(process.argv);
	let [dir] = program.args;
	let rootDir;
	if (!dir) {
		rootDir = process.cwd();
	} else {
		rootDir = path.resolve(process.cwd(), dir);
	}

	if (program.env === true) {
		program.env = "dev";
	}

	let env = program.env || "dev";

	process.env.NODE_ENV = process.env.LEO_ENV = env;
	process.env.LEO_REGION = program.region;

	let config = require("./leoCliConfigure.js")(process.env.NODE_ENV);
	let buildConfig = require("./lib/build-config").build;
	let pkgConfig = buildConfig(rootDir);

	if (pkgConfig.type !== "microservice" && pkgConfig._meta.microserviceDir) {
		filter = rootDir.replace(/^.*?(bots|api)[\\/]/, "");
		force = filter;
		rootDir = pkgConfig._meta.microserviceDir;
		pkgConfig = buildConfig(rootDir);
	}

	let publishConfig = config.publish;
	if (!publishConfig) {
		console.log("YOU HAVE NOT SETUP YOUR LEOPUBLISH");
		process.exit();
	}


	let tasks = [];
	let devConfig = config.deploy[process.env.NODE_ENV];
	let deployRegions = program.region ? program.region : (devConfig.region || []);
	if (!Array.isArray(deployRegions)) {
		deployRegions = [deployRegions];
	}
	publishConfig.forEach(target => {
		target.leoaws = require("leo-aws")(target.leoaws);
	});
	let buckets = await new Promise((resolve, reject) => {
		require("./lib/cloud-formation.js").getBuckets(publishConfig, {
			ignoreErrors: false,
			name: program.cliStack
		}, (err, data) => {
			if (err) reject(err);
			else resolve(data);
		})
	});


	const microservice = JSON.parse(fs.readFileSync(path.resolve(path.resolve(rootDir, "package.json"))));
	let version = program.ver || microservice.version || "latest";

	let cfFilename = "cloudformation.json";
	if (version == "latest") {
		cfFilename = `cloudformation-${version}.json`;
		version = null;
	} else if (program.build) {
		cfFilename = `cloudformation-${program.build}.json`;
	}

	version = version ? (version + "/") : "";
	let tag = (program.tag ? (program.tag.match(/^[/\\]/) ? program.tag : `/${program.tag}`) : "").replace(/\\/g, "/");
	let data = buckets.map(bucket => {
		let s3region = bucket.region == "us-east-1" ? "" : "-" + bucket.region;
		return {
			region: bucket.region,
			url: program.url || `https://s3${s3region}.amazonaws.com/${bucket.bucket}/${microservice.name}${tag}/${version}`,
			target: bucket.target
		}
	}).filter(p => deployRegions.length == 0 || deployRegions.indexOf(p.region) >= 0);

	data.map(publish => {
		if (publish == undefined) {
			console.log(`\n---------------"${process.env.NODE_ENV} ${devConfig.stack} ${publish.region}"---------------`);
			return;
		}

		let url = publish.url + cfFilename;
		console.time("Update Complete");
		console.log(`\n---------------Creating Stack ChangeSet "${process.env.NODE_ENV} ${devConfig.stack} ${publish.region}"---------------`);
		console.log(`url: ${url}`);
		progressInterval.start();

		let Parameters = [].concat(Object.keys(devConfig.parameters || {}).map(key => {
			let value = devConfig.parameters[key];
			let noEcho = false;
			if (typeof value.NoEcho !== 'undefined') {
				noEcho = value.NoEcho;
				value = value.value;
			}
			return {
				ParameterKey: key,
				ParameterValue: value,
				NoEcho: noEcho
			}
		}));
		if (pkgConfig.no_env_param !== true) {
			Parameters.push({
				ParameterKey: 'Environment',
				ParameterValue: process.env.NODE_ENV
			});
		}

		tasks.push(publish.target.leoaws.cloudformation.runChangeSet(
			devConfig.stack, url, {
				Parameters: Parameters
			}, {
				forceDeploy: program.forceDeploy,
				progressInterval: progressInterval
			}
		).then(() => {
			console.log("");
			console.timeEnd("Update Complete", publish.region);
		}).catch(err => {
			console.log(` Update Error: ${publish.region}`, err);
		}));
	});
	Promise.all(tasks).then(() => {
		progressInterval.stop();
		tasks.length > 1 && console.log("Ran all deployments");
		process.exit();
	}).catch((err) => {
		progressInterval.stop();
		tasks.length > 1 && console.log("Failed on deployments", err);
		process.exit();
	})
})();
