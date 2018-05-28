var path = require('path');
var fs = require('fs');
var commander = require('commander');
var colors = require('colors');
var moment = require("moment");
let modulejs = require("module");
let runInThisContext = require('vm').runInThisContext;

module.exports = function(argv, callback) {
	let program = new commander.Command();
	program
		.version('0.0.1')
		.option("-e, --env [env]", "Environment")
		.option("-t, --test [test]", "Environment")
		.option("--region [region]", "Region to run cloudformation")
		.usage('<dir> <test> [options]')
		.action(async function(dir, testName) {
			let env = program.env || "dev";
			let rootDir = path.resolve(process.cwd(), dir);

			var buildConfig = require("./build-config").build;

			process.env.NODE_ENV = process.env.LEO_ENV = env;
			process.env.LEO_REGION = program.region;

			let config = buildConfig(rootDir);
			var pkg = require(path.resolve(rootDir, "package.json"));
			var type = config.type;
			const packageName = pkg.name.replace(/[^a-zA-Z0-9]/g, '');
			const ID = pkg.logicalResource || packageName;

			let event = pkg.config && pkg.config.leo && pkg.config.leo.cron && pkg.config.leo.cron.settings || {};

			let eventFileName = "event";
			if (testName && typeof testName == "string") {
				eventFileName = testName;
			}

			//Load Bootstrap
			let bootstrapjs = path.resolve(rootDir, `test/_bootstrap.js`);
			if (fs.existsSync(bootstrapjs)) {
				let subExports = {};
				let mthingy = {
					exports: subExports
				};
				let newRequire = function(file) {
					try {
						file = require.resolve(file, {
							paths: [path.resolve(rootDir, `test/`)]
						});
					} catch (e) {

					};
					return require(file);
				};
				newRequire.__proto__ = require.__proto__;
				runInThisContext(modulejs.wrap(fs.readFileSync(bootstrapjs)))(subExports, newRequire, mthingy, bootstrapjs, path.dirname(bootstrapjs));

				if (typeof mthingy.exports == "function") {
					await mthingy.exports(eventFileName);
					console.log("DONE HERE");
				}
			}



			//Load Event
			let eventjson = path.resolve(rootDir, `test/${eventFileName}.json`);
			let eventjs = path.resolve(rootDir, `test/${eventFileName}.js`);

			if (fs.existsSync(eventjson)) {
				event = Object.assign(event, require(eventjson));
			} else if (fs.existsSync(eventjs)) {
				let subExports = {};
				let mthingy = {
					exports: subExports
				};
				let newRequire = function(file) {
					try {
						file = require.resolve(file, {
							paths: [path.resolve(rootDir, `test/`)]
						});
					} catch (e) {

					};
					return require(file);
				};
				newRequire.__proto__ = require.__proto__;

				runInThisContext(modulejs.wrap(fs.readFileSync(eventjs)))(subExports, newRequire, mthingy, eventjs, path.dirname(eventjs));
				if (typeof mthingy.exports == "function") {
					event = await mthingy.exports();
				} else {
					Object.assign(event, mthingy.exports);
				}
			} else if (testName && typeof testName == "string") {
				console.log(`Test Event "${testName}" did not exist.  Please create in test/${testName}.js`);
				process.exit();
			}


			// var cloudformation = new aws.CloudFormation({
			// 	region: config.aws.region
			// });
			// var lambda = new aws.Lambda({
			// 	region: config.aws.region
			// });


			// cloudformation.describeStackResources({
			// 	StackName: "BotmonTest",
			// 	LogicalResourceId: ID
			// }, (err, data) => {
			// 	console.log(err, data.StackResources)
			// 	lambda.getFunctionConfiguration({
			// 		FunctionName: data.StackResources[0].PhysicalResourceId
			// 	}, (err, data) => {
			// 		event.id = data.FunctionName
			// 		let p = data.Environment && data.Environment.Variables || {};
			// 		Object.keys(p).map(k => {
			// 			let v = p[k];
			// 			if (typeof v !== "string") {
			// 				v = JSON.stringify(v);
			// 			}
			// 			process.env[k] = v;
			// 		})
			// 		console.log(err, data)
			// 		console.log(event)

			// 	})
			// });

			// return;

			// Load process info
			let processjson = path.resolve(rootDir, "test/process.json");
			let processjs = path.resolve(rootDir, "test/process.js");
			let p;
			if (fs.existsSync(processjson)) {
				p = require(processjson);
			} else if (fs.existsSync(processjs)) {
				p = require(processjs);
			}
			// Cloud Formation Cache Vars Path in the System Directory
			let cfCacheVarsPath = `${config._meta.systemDir}/cloudformation-cache-${env}.json`;
			let cfCacheVars = {};
			if (fs.existsSync(cfCacheVarsPath)) {
				cfCacheVars = require(cfCacheVarsPath);
			}
			// Cloud Formation Cache Vars Path in the Global .leo Directory
			let globalCFCacheVarsPath = path.resolve(require("os").homedir(), `.leo/cloudformation-cache-${env}.json`);
			if (fs.existsSync(globalCFCacheVarsPath)) {
				cfCacheVars = Object.assign({}, require(globalCFCacheVarsPath), cfCacheVars);
			}
			let envVars = Object.assign({}, config.env, p && p.env);
			Object.keys(envVars).map(k => {
				let v = envVars[k];
				if (typeof v !== "string") {
					v = JSON.stringify(v);
				}
				let p = v.match(/\${(.*?)}/g);
				if (p) {
					v = v.replace(/\${(.*?)}/g, function(a, b) {
						if (!(b in cfCacheVars)) {
							console.log("Add " + b + " to the " + cfCacheVarsPath + " file");
							process.exit();
						}
						return cfCacheVars[b];
					});
				}
				process.env[k] = v;
			});

			if (config.aliases) {
				let defaultAlias = Object.keys(config.aliases).map(k => config.aliases[k]).filter(a => a.default) || {};



				//let out = {};

				// function flattenVariables(obj, out, separator, prefix) {
				// 	prefix = prefix || "";
				// 	separator = separator || ":";
				// 	Object.keys(obj).forEach((k) => {
				// 		var v = obj[k];
				// 		if (typeof v === "object" && !(Array.isArray(v)) && v !== null) {
				// 			flattenVariables(v, out, separator, prefix + k.toLowerCase() + separator);
				// 		} else {
				// 			out[prefix + k.toLowerCase()] = v;
				// 		}
				// 	});
				// }
				// flattenVariables(config.aliases, out, ".")
				// config.variables = Object.assign(config.variables, out);


			}

			//console.log(JSON.stringify(config, null, 2));

			// setup handler
			var wrapperFile = __dirname + "/wrappers/" + type + ".js";
			if (!fs.existsSync(wrapperFile)) {
				wrapperFile = __dirname + "/wrappers/base.js";
			}
			// Object.keys(require.cache).map(k => {
			// 	delete require.cache[k]
			// });
			var contents = fs.readFileSync(wrapperFile, 'utf-8')
				.replace("____FILE____", path.normalize(path.resolve(rootDir, pkg.main || "index.js")).replace(/\\/g, "\\\\"))
				.replace("____PACKAGEJSON____", path.normalize(path.resolve(rootDir, "package.json")).replace(/\\/g, "\\\\"))
				.replace("____HANDLER____", config.handler || "handler");

			// Compile the module to run
			let r = path.normalize(path.resolve(rootDir, "__leo-cli-test-runner.js")).replace(/\\/g, "\\\\");
			let m = new modulejs(r, module);

			contents = stripBOM(contents).replace(/^\#\!.*/, ''); // remove shebang
			let newRequire = function(file) {
				try {
					file = require.resolve(file, {
						paths: [path.resolve(rootDir, `test/`)]
					});
				} catch (e) {

				};
				return require(file);
			};
			newRequire.__proto__ = require.__proto__;



			runInThisContext(modulejs.wrap(contents), {
				filename: r
			}).apply(m.exports, [m.exports, newRequire, m, r, path.dirname(r)]);

			let handler = m.exports.handler;

			var runner = {
				event: event => event,
				callback: (err, data, callback) => callback(err, data)
			};
			var runnerFile = __dirname + "/test/" + type + ".js";
			if (fs.existsSync(runnerFile)) {
				runner = require(runnerFile);
			}

			if (type === "bot" || type === "cron" && !event.botId) {
				event.botId = event.id || (pkg.config && pkg.config.leo && pkg.config.leo.cron && pkg.config.leo.cron.id) || (pkg.config && pkg.config.leo && pkg.config.leo.name) || pkg.name;
			}

			// TODO: This isn't just cron types but any bot invoked by leo
			if (type === "cron" || type === "bot" || type === "raw") {
				// TODO: build payload
			}

			let theEvent = runner.event(event);
			callback(null, {
				event: theEvent,
				runner,
				handler,
				config,
				rootDir
			});
			// handler(theEvent, createContext(pkg, config), (err, data) => {
			// 	runner.callback(err, data, (err, data) => {
			// 		data && console.log("\n\n\n--------------------------Results--------------------------\n")
			// 		let results = data;
			// 		if (err) {
			// 			console.log("Error:", err)
			// 		} else {
			// 			if (typeof data === "object") {
			// 				data = JSON.stringify(data, null, 2);
			// 			}
			// 			if (data !== undefined) {
			// 				console.log(data);
			// 			}
			// 		}
			// 		if (fs.existsSync(path.resolve(rootDir, "test/postprocess.js"))) {
			// 			require(path.resolve(rootDir, "test/postprocess.js"))(theEvent, err, results)
			// 		}
			// 		callback();
			// 	});
			// });
		})
		.parse(argv);

	if (!argv.slice(2).length) {
		program.outputHelp(colors.red);
	}

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
}
