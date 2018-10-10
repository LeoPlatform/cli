#!/usr/bin/env node

const path = require('path');
const program = require('commander');

program
	.version('0.0.1')
	.option("-e, --env [env]", "Environment")
	.option("--build", "Only build")
	.option("--tag [tag]", "Tag name")
	.option("--changeset", "Only build changeset")
	.option("-c --cloudformation", "Only build cloudformation")
	.option("-d, --deploy [env]", "Deploys the published cloudformation")
	.option("-f, --force [force]", "Force bots to publish")
	.option("--filter [filter]", "Filter bots to publish")
	.option("--public [public]", "Publish as public")
	.option("-s --save [save]", "Save the cloudformation.json to the microservice directory")
	.option('-F --force-deploy', 'Automatically deploy without requesting verification of changeset')
	.option("-p --patch [patch]", "Patch from existing environment's deployed cloudformation.")
	.arguments('[directory] [options]')
	.usage('[directory] [options]');

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

	// if using just '-d' then set the deploy to 'dev'
	if (program.env === true || program.deploy === true) {
		delete program.env;
		program.deploy = "dev";
	}

	let env = program.env || program.deploy || "dev";
	program.run = program.run || program.deploy;
	let filter = program.filter;
	let force = program.force;

	process.env.NODE_ENV = process.env.LEO_ENV = env;
	process.env.LEO_REGION = program.region;

	let config = require("./leoCliConfigure.js")(process.env.NODE_ENV);
	let buildConfig = require("./lib/build-config").build;
	let pkgConfig = buildConfig(rootDir);
	console.log("BUILDING ", rootDir);

	if (pkgConfig.type !== "microservice" && pkgConfig._meta.microserviceDir) {
		filter = rootDir.replace(/^.*?[\\/](bots|api)[\\/]/, "");
		force = filter;
		rootDir = pkgConfig._meta.microserviceDir;
		pkgConfig = buildConfig(rootDir);
	}

	let publishConfig = config.publish;
	if (!publishConfig) {
		console.log("YOU HAVE NOT SETUP YOUR LEOPUBLISH");
		process.exit();
	}

	let startingCloudformation = undefined;
	if (program.patch) {
		if (program.patch === true) {
			program.patch = env;
		}
		if (program.patch == undefined) {
			console.log("--patch requires a value or --deploy to be set");
			process.exit();
		}
		let patch = config.deploy[process.env.NODE_ENV];
		if (patch == undefined) {
			console.log(`Environment ${process.env.NODE_ENV} is not configured.  Cannot create patch.`);
			process.exit();
		}
		let deployRegions = patch.region || [];
		let target = config.publish.filter(p => (deployRegions.length == 0 || (p.region && deployRegions.indexOf(p.region) > -1) ||
			(p.leoaws && p.leoaws.region && deployRegions.indexOf(p.leoaws.region) > -1)
		))[0];

		if (target == undefined) {
			console.log(`Cannot determine base cloudformation from ${process.env.NODE_ENV}.  Cannot create patch.`);
			process.exit();
		}

		try {
			startingCloudformation = await require("leo-aws")(target.leoaws).cloudformation.get(patch.stack, {});
		} catch (err) {
			console.log(`Error getting base cloudformation from ${process.env.NODE_ENV}.  Cannot create patch.`);
			console.log(err);
			process.exit();
		}
	}

	let data = await require("./lib/cloud-formation.js").createCloudFormation(rootDir, {
		linkedStacks: config.linkedStacks,
		config: pkgConfig,
		force: force,
		targets: publishConfig,
		filter: filter,
		alias: process.env.NODE_ENV,
		publish: program.run || !program.build,
		tag: program.tag,
		public: program.public || false,
		cloudFormationOnly: program.cloudformation,
		saveCloudFormation: program.save,
		cloudformation: startingCloudformation
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
		let tasks = [];
		let devConfig = config.deploy[process.env.NODE_ENV];
		let deployRegions = devConfig.region || [];
		if (!Array.isArray(deployRegions)) {
			deployRegions = [deployRegions];
		}
		data.filter(p => deployRegions.length == 0 || deployRegions.indexOf(p.region) >= 0).map(publish => {
			if (publish == undefined) {
				console.log(`\n---------------"${process.env.NODE_ENV} ${devConfig.stack} ${publish.region}"---------------`);
				return;
			}

			let url = publish.url + "cloudformation.json";
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
			tasks.length > 0 && console.log("Ran all deployments");
			process.exit();
		}).catch((err) => {
			progressInterval.stop();
			tasks.length > 0 && console.log("Failed on deployments", err);
			process.exit();
		})
	}
})();
