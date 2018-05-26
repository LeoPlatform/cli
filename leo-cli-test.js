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
	.usage('<dir> [options]')
	.action(function(dir) {
		let rootDir = path.resolve(process.cwd(), dir);
		let watchDir = utils.findFirstPackageValue(rootDir, ["microservice"], "__directory");
		var pkg = require(path.resolve(rootDir, "package.json"));

		var reactRunner = require("./lib/react.js");

		var buildConfig = require("./lib/build-config").build;

		if (pkg.config && pkg.config.leo && pkg.config.leo.type == "microservice") {
			let c = buildConfig(rootDir);
			process.env.NODE_ENV = program.env || "dev";
			process.env.LEO_LOCAL = "true";
			reactRunner(rootDir, c, c);
		} else {
			let child = null;

			function run() {
				function f() {
					child = fork(__dirname + "/lib/runner.js", process.argv, {
						cwd: rootDir,
						env: Object.assign({}, process.env, {
							NODE_ENV: program.env || "dev",
							LEO_LOCAL: "true",
							LEO_ENV: program.env || "dev",
							LEO_REGION: program.region,
							LEO_CONFIG: JSON.stringify(buildConfig(rootDir)),
							LEO_PREVENT_RUN_AGAIN: "true"
						}),
						//execArgv: ["--inspect", "--debug-brk"]
					});
					//process.kill(child.pid, 'USR1');
					child.once("exit", () => {
						child = null;
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
					watcher.close();
					process.exit();
				}
			});

			run();
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
	})
	.parse(process.argv);
if (!process.argv.slice(2).length) {
	program.outputHelp(colors.red);
}
