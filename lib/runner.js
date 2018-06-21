var fs = require('fs');
var path = require('path');
var moment = require("moment");
const PassThrough = require("stream").PassThrough;

//need to remove from argv because this is a fork
let argv = process.argv.slice(2);
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

	for (var i = 0; i < dirs.length; i++) {
		if (fs.existsSync(path.resolve(dirs[i], "leo-sdk"))) {
			global.isOverride = function(ls) {
				// console.log("I GOT VISITED");
				let original = ls.fromLeo;
				ls.fromLeo = function(id, outQueue, opts) {
					opts = Object.assign({}, opts || {});
					if (overrideStreamKeys.indexOf(outQueue.toLowerCase()) !== -1) {
						var pass = new PassThrough({
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
			break;
		}
	}
}


global.preventRunAgain = process.env.LEO_PREVENT_RUN_AGAIN == "true";
require("./leo-bot-run.js")(argv, (err, module) => {
	let doCall = () => {
		console.time("leo_handler_timer");
		module.handler(module.event, createContext({}, module.config), (err, data) => {
			module.runner.callback(err, data, (err, data) => {
				err = err || (data instanceof Error ? data : undefined)
				console.timeEnd("leo_handler_timer");
				data && console.log("\n\n\n--------------------------Results--------------------------\n")
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
				}
			});
		});
	}

	doCall();

});



function createContext(pkg, config) {
	var start = new Date();
	var maxTime = (config.timeout || 5256000) * 1000;
	return {
		awsRequestId: "requestid-local" + moment.now().toString(),
		getRemainingTimeInMillis: function() {
			var timeSpent = new Date() - start;
			if (timeSpent < maxTime) {
				return maxTime - timeSpent;
			} else {
				return 0;
			}
		}
	};
}

function stripBOM(content) {
	// Remove byte order marker. This catches EF BB BF (the UTF-8 BOM)
	// because the buffer-to-string conversion in `fs.readFileSync()`
	// translates it to FEFF, the UTF-16 BOM.
	if (content.charCodeAt(0) === 0xFEFF) {
		content = content.slice(1);
	}
	return content;
}