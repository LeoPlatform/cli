const fs = require('fs');
const path = require('path');
const moment = require("moment");
const PassThrough = require("stream").PassThrough;

//need to remove from argv if this is a fork
let argv = process.send ? process.argv.slice(2) : process.argv;
let utils = require("./utils.js");



//let's figure out what fixtures they may have
let overrideStreams = {};
let fixtureDir = path.resolve(process.cwd(), "fixtures");
if (fs.existsSync(fixtureDir)) {
	fs.readdirSync(fixtureDir).forEach(file => {
		overrideStreams[path.basename(file).replace("queue_", "").replace(".js", "").toLowerCase()] = require(path.resolve(fixtureDir, file));
	});
}
let overrideStreamKeys = Object.keys(overrideStreams);
if (overrideStreamKeys.length) {
	let dirs = utils.findParentFiles(process.cwd(), "node_modules");

	if (dirs.find(d => fs.existsSync(path.resolve(d, "leo-sdk")))) {
		global.isOverride = function(ls) {
			// console.log("I GOT VISITED");
			let original = ls.fromLeo;
			ls.fromLeo = function(id, outQueue, opts) {
				opts = Object.assign({}, opts || {});
				if (overrideStreamKeys.indexOf(outQueue.toLowerCase()) !== -1) {
					let pass = new PassThrough({
						highWaterMark: opts.buffer,
						objectMode: true
					});
					overrideStreams[outQueue.toLowerCase()].forEach(event => {
						pass.write({
							payload: event
						});
					});
					pass.end();
					return pass;
				} else {
					return original.apply(arguments);
				}
			}
		};
	}
}


global.preventRunAgain = process.env.LEO_PREVENT_RUN_AGAIN === "true";
require("./leo-bot-run.js")(argv, (err, module) => {
	let doCall = () => {
		console.time("leo_handler_timer");
		module.handler(module.event, createContext({}, module.config), (err, data) => {
			module.runner.callback(err, data, (err, data) => {
				err = err || (data instanceof Error ? data : undefined);
				console.timeEnd("leo_handler_timer");
				data && console.log("\n\n\n--------------------------Results--------------------------\n");
				let results = data;
				if (err) {
					console.log("Error:", err)
				} else {
					if (typeof data === "object") {
						data = JSON.stringify(data, null, 2);
					}
					if (data !== undefined) {
						console.log(data);
					}
				}
				if (fs.existsSync(path.resolve(module.rootDir, "test/postprocess.js"))) {
					require(path.resolve(module.rootDir, "test/postprocess.js"))(module.event, err, results)
				}
				if (global.preventRunAgain && global.cron_run_again) {
					console.log("Local Run Again Flag Set:", moment.now());
					process.nextTick(doCall);
				} else if (process.env.LEO_RUNNER_EXIT_ON_COMPLETE != "false") {
					process.exit();
				}
			});
		});
	};

	doCall();

});



function createContext(pkg, config) {
	let start = new Date();
	let maxTime = (config.timeout || 5256000) * 1000;
	return {
		awsRequestId: "requestid-local" + moment.now().toString(),
		getRemainingTimeInMillis: function() {
			let timeSpent = new Date() - start;
			if (timeSpent < maxTime) {
				return maxTime - timeSpent;
			} else {
				return 0;
			}
		}
	};
}
