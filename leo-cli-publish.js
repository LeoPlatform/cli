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
	.arguments('[directory] [options]')
	.usage('[directory] [options]');

if (!process.argv.slice(2).length) {
	program.outputHelp(colors.red);
} else {
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
		if (!config.leopublish || !config.leopublish.regions) {
			console.log("YOU HAVE NOT SETUP YOUR LEOPUBLISH");
			process.exit();
		}
		let publishConfig = config.leopublish;



		//@TODO....I don't quite get how to do this yet
		//WHERE SHOULD I GET THE BASE cloudformatoin from???????????
		// let cloudformation = config.leopublish.leoaws.cloudformation;
		let cf = {};
		// if (publishConfig.stack) {
		// 	cf = await cloudformation.get(config.leopublish.stack).catch(err => {
		// 		if (err.message.match(/^Stack.*does not exist/)) {
		// 			return {};
		// 		} else {
		// 			throw err;
		// 		}
		// 	});
		// }

		let data = await require("./lib/cloud-formation.js").createCloudFormation(rootDir, {
			config: pkgConfig,
			filter: filter,
			publish: program.run || !program.build,
			force: force,
			regions: publishConfig.regions,
			public: program.public,
			cloudformation: cf,
			overrideCloudFormationFile: !cf && !program.build,
			alias: process.env.LEO_ENV,
			region: process.env.LEO_REGION,
			tag: program.tag
		});
		if (program.run || !program.build) {
			console.log("\n---------------Publish Complete---------------");
			console.log(data.filter(d => d.region == program.region)[0].url + "cloudformation.json");
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
	})();
}
