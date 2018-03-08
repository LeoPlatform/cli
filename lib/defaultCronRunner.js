let leo = require("leo-sdk");
let aws = require("aws-sdk");
let fs = require("fs");
let path = require("path");

let http = require("http");
let https = require("https");
let zlib = require("zlib");
const glob = require("glob");
let botRunner = require("./leo-bot-run.js");
var cp = require("child_process");
let spawnSync = require('child_process').spawnSync;
let spawn = require('child_process').spawn;
let execSync = require('child_process').execSync;
let moment = require("moment");

let lambda = new aws.Lambda({
	region: leo.configuration.region,
	credentials: leo.configuration.credentials
});
let s3 = new aws.S3({
	region: leo.configuration.region,
	credentials: leo.configuration.credentials
});

let cache;
let processcwd = process.cwd();
exports.handler = function (event, context, callback) {
	console.log("Bot:", event.__cron.id);
	let setup = (c) => {
		c(null, cache);
	};

	let importModule = function (url, data, callback) {
		data = Object.assign({
			main: "index.js",
			index: "handler"
		}, data);
		let zipPath = path.resolve("", `/tmp/run_${event.__cron.id}.zip`);
		let indexPath = path.resolve("", `/tmp/run_${event.__cron.id}/${data.main}`);
		let folder = path.resolve("", `/tmp/run_${event.__cron.id}`)
		let stats;
		if (fs.existsSync(zipPath) && fs.existsSync(indexPath)) {
			stats = fs.statSync(zipPath);
		}
		if (stats && data.lastModified && moment(stats.mtime) >= moment(data.lastModified)) {
			//console.log("From file cache", data);
			data.module = require(indexPath);
			return callback(null, data)
		}

		console.log("Downloading", url, zipPath)
		https.get(url, (res) => {
			res.pipe(fs.createWriteStream(zipPath)).on("finish", () => {
				console.log("Done Downloading")
				let o = spawnSync("unzip", ["-o", zipPath, "-d", folder]);
				console.log(o.stdout.toString());
				console.error(o.stderr.toString());
				console.log("Done Extracting")
				data.module = require(indexPath);
				callback(null, data);
			})
		}).on("error", (err) => {
			console.log("Error Downloading", err);
			callback(err);
		});
	}

	if (fs.existsSync(path.resolve(processcwd, "package.json"))) {
		setup = (callback) => {
			getPackageJson(processcwd, (err, lookup) => {
				let data = {};
				if (event.__cron.id in lookup) {
					data = lookup[event.__cron.id];
				} else {
					data = {
						file: path.resolve(processcwd, "package.json"),
						package: require(path.resolve(processcwd, "package.json"))
					}
				}

				let pkgStats = fs.statSync(data.file);
				let handlerStats = fs.statSync(path.resolve(path.dirname(data.file), data.package.main));
				let latest = Math.max(pkgStats && pkgStats.mtime || 0, handlerStats && handlerStats.mtime || 0)
				if (cache && latest && cache.LastModified && moment(latest) <= moment(cache.LastModified)) {
					return callback(null, cache);
				}

				let cmd = (data.package.scripts && data.package.scripts.run) || (data.package.scripts && data.package.scripts.test) || "leo-cli run .";
				let args = parseArgsStringToArgv(cmd);

				process.chdir(path.dirname(data.file));
				botRunner(args, (err, module) => {
					callback(err, {
						LastModified: latest,
						Configuration: {
							Timeout: module.config && module.config.timeout
						},
						module: {
							handler: function (event, context, callback) {
								event = Object.assign({}, module.event, event);
								return module.handler(module.runner.event(event), context, callback);
							}
						}
					})
				});
				// } else {
				// 	let file = path.resolve("", "package.json");
				// 	let pkg = require(file);
				// 	let pkgStats = fs.statSync(file);
				// 	let handlerStats = fs.statSync(path.resolve(path.dirname(file), pkg.main));
				// 	let latest = Math.max(pkgStats && pkgStats.mtime || 0, handlerStats && handlerStats.mtime || 0)
				// 	if (cache && latest && cache.LastModified && moment(latest) <= moment(cache.LastModified)) {
				// 		return callback(null, cache);
				// 	}

				// 	callback(null, {
				// 		LastModified: latest,
				// 		Configuration: {
				// 			Timeout: pkg.config && pkg.config.leo && pkg.config.leo.timeout
				// 		},
				// 		handler: pkg.config && pkg.config.leo && pkg.config.leo.handler,
				// 		module: require(path.resolve("", pkg.main))
				// 	});
				// }
			});
		}
	} else if (fs.existsSync(path.resolve("", "index.js"))) {
		setup = (callback) => {
			callback(null, {
				handler: "handler",
				module: require(path.resolve("", "index.js"))
			})
		}
	} else if (event.__cron.lambdaName && event.__cron.lambdaName != "Leo_core_custom_lambda_bot") {
		setup = (callback) => {
			console.log("Getting Lambda Settings");
			lambda.getFunction({
				FunctionName: event.__cron.lambdaName
			}, (err, data) => {
				if (err) {
					return callback(err);
				}
				importModule(data.Code.Location, {
					main: `${data.Configuration.Handler.split(".")[0]}.js`,
					handler: data.Configuration.Handler.split(".")[1],
					lastModified: data.Configuration.LastModified
				}, callback);
			});
		}
	} else if (event.__cron.code) {
		let code = event.__cron.code;
		if (typeof event.__cron.code == "string") {
			code = {
				url: event.__cron.code,
				main: "index.js",
				handler: "handler"
			}
		}
		let parts = code.url
		if (code.url) {
			let parts = code.url.match(/^(?:https?:\/\/s3(?:-(.*?))?\.amazonaws.com\/)(.*?)\/(.*)/);
			if (parts) {
				code.Region = parts[1] || "us-east-1";
				code.Bucket = parts[2];
				code.Key = parts[3];
			}
		}
		if (code.Bucket) {
			let s3 = new aws.S3({
				region: code.Region,
				credentials: leo.configuration.credentials
			})
			code.url = s3.getSignedUrl("getObject", {
				Bucket: code.Bucket,
				Key: code.Key,
				Expires: 900
			});
			setup = (callback) => {
				console.log("Getting S3 file Settings");
				s3.headObject({
					Bucket: code.Bucket,
					Key: code.Key,
				}, (err, head) => {
					if (err) {
						return callback(err);
					}
					importModule(code.url, {
						main: code.main || "index.js",
						handler: code.handler || "handler",
						lastModified: head.LastModified
					}, callback);
				});
			}
		} else if (code.url) {
			setup = (callback) => {
				importModule(code.url, {
					main: code.main || "index.js",
					handler: code.handler || "handler",
					lastModified: code.lastModified
				}, callback);
			}
		} else if (code.file) {
			setup = (callback) => {
				callback(null, {
					handler: code.handler || "handler",
					module: require(path.resolve("", code.file))
				});
			}
		} else {
			setup = (c) => { c("Unknown code location"); }
		}
	} else {
		setup = (c) => { c("Unknown code location"); }
	}

	setup((err, data) => {
		if (err) {
			console.log(err);
			return callback(err);
		}
		cache = data;
		console.log(data)
		let context = createContext(data.Configuration || {});
		cache.module[data.handler || "handler"](event, context, callback);
	});
}

if (process.send) {
	var settings;
	process.on("message", (msg) => {
		if (msg.action === "start") {
			settings = msg.cron;
			exports.handler(settings, {}, function (err, data) {
				process.send({ action: "complete", err: err, data: data });
			});
		} else if (msg.action == "update") {
			//settings.__tail.update(msg.cron);
		}
	});
}


function createContext(config) {
	var start = new Date();
	var maxTime = config.Timeout ? config.Timeout * 1000 : moment.duration({ years: 10 }).asMilliseconds();// (config.Timeout || 300) * 1000;
	return {
		awsRequestId: "requestid-local" + moment.now().toString(),
		getRemainingTimeInMillis: function () {
			var timeSpent = new Date() - start;
			if (timeSpent < maxTime) {
				return maxTime - timeSpent;
			} else {
				return 0;
			}
		}
	};
}


let packagelookups;
function getPackageJson(dir, callback) {
	if (packagelookups) {
		return callback(null, packagelookups);
	}
	let p = path.resolve(path.resolve(dir, "*(bots|api)/{,!(node_modules)/**/}/*/package.json"));
	glob(p, {
		nodir: true
	}, function (err, files) {
		let lookup = {};
		files = files.filter(f => !f.match(/\/node_modules\//)).map(f => {
			let pkg = require(f);
			let id = (pkg.config && pkg.config.leo && (pkg.config.leo.cron && pkg.config.leo.cron.id || pkg.config.leo.id)) || pkg.name;
			lookup[id] = { file: f, package: pkg };
		});
		//packagelookups = lookup;
		callback(null, lookup);
	});
}

function parseArgsStringToArgv(value, env, file) {
	// ([^\s'"]+(['"])([^\2]*?)\2) Match `text"quotes text"`

	// [^\s'"] or Match if not a space ' or "

	// (['"])([^\4]*?)\4 or Match "quoted text" without quotes
	// `\2` and `\4` are a backreference to the quote style (' or ") captured
	var myRegexp = /([^\s'"]+(['"])([^\2]*?)\2)|[^\s'"]+|(['"])([^\4]*?)\4/gi;
	var myString = value;
	var myArray = [
	];
	if (env) {
		myArray.push(env);
	}
	if (file) {
		myArray.push(file);
	}
	var match;
	do {
		// Each call to exec returns the next regex match as an array
		match = myRegexp.exec(myString);
		if (match !== null) {
			// Index 1 in the array is the captured group if it exists
			// Index 0 is the matched text, which we use if no captured group exists
			myArray.push(match[1] || match[5] || match[0]);
		}
	} while (match !== null);

	return myArray;
}