#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const program = require('commander');
const colors = require('colors');
const utils = require('./lib/utils');

program
	.version('0.0.2')
	.arguments('<type> <subtype> [dir] ')
	.usage('<type> [subtype] <dir> [options]')
	.action(async function(type, subtype, dir) {

		let pkgname = null;
		let declaredType = type = type.toLowerCase();

		let parentType = utils.findFirstPackageValue(process.cwd(), [], "type");
		let parentName = utils.findFirstPackageValue(process.cwd(), [], "name");
		if (!parentName) {
			parentName = '';
		}

		let roots = {
			bot: path.normalize("bots/"),
			checksum: path.normalize("bots/"),
			load: path.normalize("bots/"),
			enrich: path.normalize("bots/"),
			offload: path.normalize("bots/"),
			resource: path.normalize("api/"),
		};
		let templatePath = null;

		let dirs = fs.readdirSync(path.resolve(__dirname, "./templates"));

		if (dirs.indexOf(type) === -1) {
			let paths = require('module')._nodeModulePaths(process.cwd());
			let modulePathExits = false;
			for (let key in paths) {
				let p = path.resolve(paths[key], `${type}/templates/${subtype}`);
				modulePathExits = modulePathExits || fs.existsSync(path.resolve(paths[key], `${type}`));
				if (fs.existsSync(p)) {
					templatePath = p
					break;
				}
			}
			if (dir && subtype && !templatePath) {
				if (!modulePathExits) {
					console.log(`Missing module '${type}'.  Run 'npm install ${type}' to install the module`);
				} else {
					console.log(`Unable to find template '${subtype}' in module '${type}/templates'`);
				}
				process.exit(1);
			} else if (!templatePath) {
				dir = subtype;
				subtype = undefined;
				console.log(`Unable to find template '${type}'`);
				process.exit(1);
			}
		} else {
			dir = subtype;
			subtype = undefined;
		}
		let prefix = "./";

		if (roots[type] && path.resolve(dir).indexOf(roots[type]) === -1) {
			prefix = roots[type] || "";
		}

		if (!fs.existsSync(prefix)) {
			fs.mkdirSync(prefix);
		}

		if (!fs.existsSync(prefix + dir)) {
			let sUtils = Object.assign({
				createLeoConfig: require("./lib/createLeoConfig.js"),
				createLeoEnvironments: require('./lib/createLeoEnvironments.js'),
				raw: function(value) {
					if (typeof value === "object") {
						return `_raw:${JSON.stringify(value)}`
					}
					return `_raw:${value}:raw_`;
				},
				storeFile: function(filename, template) {
					let file = `'use strict';\nmodule.exports = ${JSON.stringify(template, null, 2)}`;
					file = file.replace(/"_raw:(.*):raw_"/gm, "$1")
						.replace(/\\n/g, "\n")
						.replace(/\\t/g, "\t")
						.replace(/^(\s*)"([^ -]*)":/gm, "$1$2:");
					fs.writeFileSync(path.resolve(prefix + dir, filename), file);
				},
				npmInstall: function(cwd) {
					if (!cwd) {
						cwd = path.resolve(prefix + dir);
					} else {
						cwd = path.resolve(cwd);
					}
					console.log(`------ Running NPM Install on "${cwd}" ------`);
					require('child_process').execSync("npm install", {
						cwd: cwd
					});
				},
				name: dir.replace(/[^a-zA-Z0-9]+/g, '_')
			}, utils);

			let setupFile = path.resolve(__dirname, 'templates/', type, 'setup.js');
			let setup = {
				inquire: () => {},
				process: () => {}
			};

			if (fs.existsSync(setupFile)) {
				setup = require(setupFile);
			}
			let setupContext = await setup.inquire(sUtils);

			switch (type) {
				case 'quickstart':
				case 'microservice':
				case 'react':
				case 'system':
					utils.copyDirectorySync(__dirname + "/templates/" + type, prefix + dir, {
						'____DIRPATH____': parentName + "-" + dir.replace(/\s+/g, '_'),
						'____DIRNAME____': dir.replace(/[^a-zA-Z0-9]+/g, '_')
					}, [
						/setup\.js$/,
						/node_modules/
					]);
					break;

				case 'checksum':
				case 'domainobject': // coming soon
				case 'elasticsearch': // coming soon
					if (parentType != "microservice" && parentType != "system") {
						console.log(`Type ${type} must be within a system or microservice package`);
						process.exit(1);
					}

					// setup variables needed to copy files
					setupContext.type = type;
					setupContext.prefix = prefix;
					setupContext.dir = dir;
					setupContext.parentName = parentName;
					setupContext.declaredType = declaredType;

					await setup.process(sUtils, setupContext);
					break;

				default:
					if (parentType != "microservice" && parentType != "system") {
						console.log(`Type ${type} must be within a system or microservice package`);
						process.exit(1);
					}
					templatePath = templatePath || `${__dirname}/templates/${type}`;
					utils.copyDirectorySync(templatePath, prefix + dir, {
						'____DIRPATH____': parentName + "-" + dir.replace(/[^a-zA-Z0-9]+/g, '_'),
						'____DIRNAME____': dir.replace(/[^a-zA-Z0-9]+/g, '_'),
						'____BOTNAME____': parentName + "-" + dir.replace(/[^a-zA-Z0-9]+/g, '_'),
						'____BOTTYPE____': declaredType
					}, [
						/setup\.js$/,
						/node_modules/
					]);
					break;
			}
			await setup.process(sUtils, setupContext);

			sUtils.npmInstall();

			console.log(`OK: Finished creating '${dir}'`);
			process.exit();
		} else {
			console.log("Directory already exists");
		}
	})
	.parse(process.argv);

if (!process.argv.slice(2).length) {
	program.outputHelp(colors.red);
}