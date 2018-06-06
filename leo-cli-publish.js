#!/usr/bin/env node

var path = require('path');
var program = require('commander');
var colors = require('colors');

program
	.version('0.0.1')
	.option("-e, --env [env]", "Environment")
	.option("--build", "Only build")
	.option("--deploy [stack]", "Deploys the published cloudformation")
	.option("--force [force]", "Force bots to publish")
	.option("--filter [filter]", "Filter bots to publish")
	.option("--public [public]", "Publish as public")
	.arguments('[directory] [options]')
	.usage('[directory] [options]');

(async function run() {
	program.parse(process.argv);
	let [dir] = program.args;
	let rootDir;
	if (!dir) {
		rootDir = process.cwd();
	} else {
		rootDir = path.resolve(process.cwd(), dir);
	}

	let env = program.env || "dev";
	program.run = program.run || program.deploy;
	let filter = program.filter;
	let force = program.force;

	process.env.NODE_ENV = process.env.LEO_ENV = env;
	process.env.LEO_REGION = program.region;

	let config = require("leo-config/lib/build").dynamicBuild(rootDir);
	var buildConfig = require("./lib/build-config").build;
	let pkgConfig = buildConfig(rootDir);
	console.log("BUILDING ", rootDir);

	if (pkgConfig.type !== "microservice" && pkgConfig._meta.microserviceDir) {
		filter = rootDir.replace(/^.*?(bots|api)[\\/]/, "");
		force = filter;
		rootDir = pkgConfig._meta.microserviceDir;
		pkgConfig = buildConfig(rootDir);
		config = require("leo-config/lib/build").dynamicBuild(rootDir);
	}
	if (!config.leopublish) {
		console.log("YOU HAVE NOT SETUP YOUR LEOPUBLISH");
		process.exit();
	}
	let publishConfig = await config.leopublish;
	let data = await require("./lib/cloud-formation.js").createCloudFormation(rootDir, {
		config: pkgConfig,
		force: force,
		targets: Object.keys(publishConfig).map(r => publishConfig[r]),
		filter: filter,
		alias: process.env.NODE_ENV,
		publish: program.run || !program.build,
		tag: program.tag,
		public: program.public || false
	});

	if (program.run || !program.build) {
		console.log("\n---------------Publish Complete---------------");
		data.forEach(publish => {
			console.log(publish.url + "cloudformation.json")
		});
	} else {
		console.log("\n---------------Build Complete---------------");
	}

	if (program.run && typeof program.run === "string") {
		data.forEach(publish => {
			let url = publish.url + "cloudformation.json"
			console.time("Update Complete");
			console.log(`\n---------------Updating stack "${publish.target.stack} ${publish.region}"---------------`);
			console.log(`url: ${url}`);
			let progress = setInterval(() => {
				process.stdout.write(".")
			}, 2000);
			publish.target.leoaws.cloudformation.run(publish.target.stack, url, {
				Parameters: Object.keys(publish.cloudFormation.Parameters || {}).map(key => {
					return {
						ParameterKey: key,
						UsePreviousValue: true,
						NoEcho: publish.cloudFormation.Parameters[key].NoEcho
					}
				})
			}).then(data => {
				clearInterval(progress);
				console.timeEnd("Update Complete");
			}).catch(err => {
				clearInterval(progress);
				console.log(" Update Error:", err);
			});
		});
	}
})();
