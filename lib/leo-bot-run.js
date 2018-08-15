let path = require('path');
let fs = require('fs');
let commander = require('commander');
let colors = require('colors');
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

			let buildConfig = require("./build-config").build;

			process.env.NODE_ENV = process.env.LEO_ENV = env;
			process.env.LEO_REGION = program.region;

			let config = buildConfig(rootDir);
			let pkg = require(path.resolve(rootDir, "package.json"));
			let type = config.type;

			let event = pkg.config && pkg.config.leo && pkg.config.leo.cron && pkg.config.leo.cron.settings || {};

			let eventFileName = "event";
			if (testName && typeof testName === "string") {
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
						// console.log(e);
					}
					return require(file);
				};
				newRequire.__proto__ = require.__proto__;
				runInThisContext(modulejs.wrap(fs.readFileSync(bootstrapjs)))(subExports, newRequire, mthingy, bootstrapjs, path.dirname(bootstrapjs));

				if (typeof mthingy.exports === "function") {
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
						// console.log(e);
					}
					return require(file);
				};
				newRequire.__proto__ = require.__proto__;

				runInThisContext(modulejs.wrap(fs.readFileSync(eventjs)))(subExports, newRequire, mthingy, eventjs, path.dirname(eventjs));
				if (typeof mthingy.exports === "function") {
					event = await mthingy.exports();
				} else {
					Object.assign(event, mthingy.exports);
				}
			} else if (testName && typeof testName === "string") {
				console.log(`Test Event "${testName}" did not exist.  Please create in test/${testName}.js`);
				process.exit();
			}

			// Load process info
			let p;
			let processjson = path.resolve(rootDir, "test/process.json");
			let processjs = path.resolve(rootDir, "test/process.js");
			if (fs.existsSync(processjson)) {
				p = require(processjson);
			} else if (fs.existsSync(processjs)) {
				p = require(processjs);
			}

			let envVars = Object.assign({}, config.env, p && p.env);
			Object.keys(envVars).map(k => {
				let v = envVars[k];
				if (typeof v !== "string") {
					v = JSON.stringify(v);
				}
				process.env[k] = v;
			});

			let handler;
			if (config.useWrappers) {
				// setup handler
				let wrapperFile = __dirname + "/wrappers/" + type + ".js";
				if (!fs.existsSync(wrapperFile)) {
					wrapperFile = __dirname + "/wrappers/base.js";
				}
				// Object.keys(require.cache).map(k => {
				// 	delete require.cache[k]
				// });
				let contents = fs.readFileSync(wrapperFile, 'utf-8')
					.replace("____FILE____", path.normalize(path.resolve(rootDir, pkg.main || "index.js")).replace(/\\/g, "\\\\"))
					.replace("____PACKAGEJSON____", path.normalize(path.resolve(rootDir, "package.json")).replace(/\\/g, "\\\\"))
					.replace("____HANDLER____", config.handler || "handler");

				// Compile the module to run
				let r = path.normalize(path.resolve(rootDir, "__leo-cli-test-runner.js")).replace(/\\/g, "\\\\");
				let m = new modulejs(r, module);

				contents = stripBOM(contents).replace(/^#!.*/, ''); // remove shebang
				let newRequire = function(file) {
					try {
						file = require.resolve(file, {
							paths: [path.resolve(rootDir, `test/`)]
						});
					} catch (e) {
						//console.log(e);
					}
					return require(file);
				};
				newRequire.__proto__ = require.__proto__;



				runInThisContext(modulejs.wrap(contents), {
					filename: r
				}).apply(m.exports, [m.exports, newRequire, m, r, path.dirname(r)]);
				handler = m.exports.handler;
			} else {
				handler = require(path.resolve(rootDir, pkg.main || "index.js"))[config.handler || "handler"];

			}

			let runner = {
				event: event => event,
				callback: (err, data, callback) => callback(err, data)
			};
			let runnerFile = __dirname + "/test/" + type + ".js";
			if (fs.existsSync(runnerFile)) {
				runner = require(runnerFile);
			}

			if ((type === "bot" || type === "cron") && !event.botId) {
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
		})
		.parse(argv);

	if (!argv.slice(2).length) {
		program.outputHelp(colors.red);
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
};
