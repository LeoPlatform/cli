#!/usr/bin/env node

var path = require('path');
var program = require('commander');
var colors = require('colors');


program
	.version('0.0.1')
	.option("-e, --env [env]", "Environment")
	.option("--build", "Only build")
	.option("-cs --changeset", "Only build changeset")
	.option("-c --cloudformation", "Only build cloudformation")
	.option("-d, --deploy [env]", "Deploys the published cloudformation")
	.option("-f, --force [force]", "Force bots to publish")
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

	let env = program.env || program.deploy || "dev";
	program.run = program.run || program.deploy;
	let filter = program.filter;
	let force = program.force;

	process.env.NODE_ENV = process.env.LEO_ENV = env;
	process.env.LEO_REGION = program.region;

	let config = require("./leoCliConfigure.js")(process.env.NODE_ENV);
	var buildConfig = require("./lib/build-config").build;
	let pkgConfig = buildConfig(rootDir);
	console.log("BUILDING ", rootDir);

	if (pkgConfig.type !== "microservice" && pkgConfig._meta.microserviceDir) {
		filter = rootDir.replace(/^.*?(bots|api)[\\/]/, "");
		force = filter;
		rootDir = pkgConfig._meta.microserviceDir;
		pkgConfig = buildConfig(rootDir);
	}

	if (!config.publish) {
		console.log("YOU HAVE NOT SETUP YOUR LEOPUBLISH");
		process.exit();
	}
	let publishConfig = await config.publish;
	let data = await require("./lib/cloud-formation.js").createCloudFormation(rootDir, {
		config: pkgConfig,
		force: force,
		targets: await config.publish(process.env.NODE_ENV),
		filter: filter,
		alias: process.env.NODE_ENV,
		publish: program.run || !program.build,
		tag: program.tag,
		public: program.public || false,
		cloudFormationOnly: program.cloudformation
	});

	if (program.run || !program.build) {
		console.log("\n---------------Publish Complete---------------");
		data.forEach(publish => {
			console.log(publish.url + "cloudformation.json")
		});
	} else {
		console.log("\n---------------Build Complete---------------");
	}

	if (program.run) {
		data.forEach((publish) => {
			let url = publish.url + "cloudformation.json"
			console.time("Update Complete");
			console.log(`\n---------------Creating Stack ChangeSet "${process.env.NODE_ENV} ${publish.target.stack} ${publish.region}"---------------`);
			console.log(`url: ${url}`);
			let progress = setInterval(() => {
				process.stdout.write(".")
			}, 2000);

			let Parameters = Object.keys(publish.cloudFormation.Parameters || {}).map(key => {
				return {
					ParameterKey: key,
					UsePreviousValue: key !== "Environment" ? true : false,
					ParameterValue: key === "Environment" ? process.env.NODE_ENV : undefined,
					NoEcho: publish.cloudFormation.Parameters[key].NoEcho
				}
			});

			publish.target.leoaws.cloudformation.runChangeSet(publish.target.stack, url, {
				Parameters: Parameters
			}).then(data => {
				clearInterval(progress);
				console.log("");
				console.timeEnd("Update Complete");
				process.exit();
			}).catch(err => {
				clearInterval(progress);
				console.log(" Update Error:", err);
				process.exit();
			});
		});
	}
})();
