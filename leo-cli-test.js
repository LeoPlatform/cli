#!/usr/bin/env node

var path = require('path');
var program = require('commander');
var colors = require('colors');

const utils = require("./lib/utils.js");

const watch = require("node-watch");
const fork = require("child_process").fork;

program
	.version('0.0.1')
	.option("-e, --env [env]", "Environment")
	.option("--region [region]", "Region to run cloudformation")
	.option("-w --watch [watch]", "Watch files for changes")
	.option("-i --inspect-brk [port]", "Debug")
	.option("--inspect [port]", "Debug")
	.usage('<dir> [options]')
	.action(function(dir) {
		let debugCmd = (program.inspectBrk || program.inspect);
		if (debugCmd) {
			debugCmd = [`--inspect${program.inspectBrk?'-brk' : ''}=${(debugCmd === true) ? "9229" : debugCmd}`];
		}
		let rootDir = path.resolve(process.cwd(), dir);
		let watchDir = utils.findFirstPackageValue(rootDir, ["microservice"], "__directory");
		var pkg = require(path.resolve(rootDir, "package.json"));

		var reactRunner = require("./lib/react.js");

		var buildConfig = require("./lib/build-config").build;

		let c = buildConfig(rootDir);
		if (pkg.config && pkg.config.leo && pkg.config.leo.type == "microservice") {
			process.env.leo_config_bootstrap_path = path.resolve(c._meta.microserviceDir, "leo_config.js");
			process.env.NODE_ENV = program.env || "dev";
			process.env.LEO_LOCAL = "true";
			reactRunner(rootDir, c, c);
		} else {
			let child = null;

			let envVariables = {
				NODE_ENV: program.env || "dev",
				LEO_LOCAL: "true",
				LEO_ENV: program.env || "dev",
				LEO_REGION: program.region,
				LEO_CONFIG: JSON.stringify(c),
				LEO_PREVENT_RUN_AGAIN: "true",
				leo_config_bootstrap_path: path.resolve(c._meta.microserviceDir, "leo_config.js"),
				LEO_RUNNER_EXIT_ON_COMPLETE: (program.watch && !debugCmd) ? "false" : "true" // Don't exit if we are watching an on the same process
			};

			function runInSameProcess() {
				Object.keys(require.cache).map(k => {
					delete require.cache[k]
				});
				Object.entries(envVariables).map(([key, value]) => process.env[key] = value);
				require(__dirname + "/lib/runner.js");
			}

			function runInChildProcess() {
				function f() {
					child = fork(__dirname + "/lib/runner.js", process.argv, {
						cwd: rootDir,
						env: Object.assign({}, process.env, envVariables),
						execArgv: debugCmd || []
					});
					child.once("exit", () => {
						child = null;
						if (!program.watch) {
							watcher && watcher.close();
							watcher = null;
							process.exit();
						}
					});
				}
				if (child) {
					child.once("exit", f);
					child.kill();
				} else {
					f();
				}
			}
			process.on('SIGINT', () => {
				if (child) {
					console.log("closing child process.  Ctrl-c again to cancel test");
					child.kill();
				} else {
					watcher && watcher.close();
					watcher = null;
					process.exit();
				}
			});

			let run = debugCmd ? runInChildProcess : runInSameProcess;
			run();
			if (program.watch) {
				let watchDirs = (watchDir ? [watchDir] : []).concat(pkg.config.test ? pkg.config.test.watch : []);
				var watcher = watch(watchDirs, {
					recursive: true,
					filter: (f) => {
						return !/node_modules/.test(f)
					}
				}, (eventType, filename) => {
					console.log("new file");
					run();
				});
			}
		}
	})
	.parse(process.argv);
if (!process.argv.slice(2).length) {
	program.outputHelp(colors.red);
}
