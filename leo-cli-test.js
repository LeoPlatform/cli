#!/usr/bin/env node

var path = require('path');
var fs = require('fs');
var program = require('commander');
var colors = require('colors');
var moment = require("moment");
var aws = require("aws-sdk");
let modulejs = require("module");
let runInThisContext = require('vm').runInThisContext;

program
	.version('0.0.1')
	.option("-e, --env [env]", "Environment")
	.option("--region [region]", "Region to run cloudformation")
	.usage('<dir> [options]')
	.action(function (dir) {
		let env = program.env || "dev";
		let rootDir = path.resolve(process.cwd(), dir);
		var buildConfig = require("./lib/build-config").build;

		process.env.LEO_ENV = env;
		process.env.LEO_REGION = program.region;

		let config = buildConfig(rootDir);
		var pkg = require(path.resolve(rootDir, "package.json"));
		var type = config.type;
		const packageName = pkg.name.replace(/[^a-zA-Z0-9]/g, '');
		const ID = pkg.logicalResource || packageName;

		let event = pkg.config && pkg.config.leo && pkg.config.leo.cron && pkg.config.leo.cron.settings || {};
		let eventjson = path.resolve(rootDir, "test/event.json");
		if (fs.existsSync(eventjson)) {
			event = Object.assign(event, require(eventjson));
		}

		var cloudformation = new aws.CloudFormation({
			region: config.aws.region
		});
		var lambda = new aws.Lambda({
			region: config.aws.region
		});


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
		if (fs.existsSync(processjson)) {
			let p = require(processjson);
			p.env && Object.keys(p.env).map(k => {
				let v = p.env[k];
				if (typeof v !== "string") {
					v = JSON.stringify(v);
				}
				process.env[k] = v;
			})
		}


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
		var wrapperFile = __dirname + "/lib/wrappers/" + type + ".js";
		if (!fs.existsSync(wrapperFile)) {
			wrapperFile = __dirname + "/lib/wrappers/base.js";
		}

		var contents = fs.readFileSync(wrapperFile, 'utf-8')
			.replace("____FILE____", path.normalize(path.resolve(rootDir, pkg.main || "index.js")).replace(/\\/g, "\\\\"))
			.replace("____HANDLER____", config.handler || "handler");


		contents = `"use strict";
			var configure = require("leo-sdk").configuration;
			var AWS = require("aws-sdk");
			if (configure.aws.profile && process.env.AWS_DEFAULT_PROFILE != configure.aws.profile) {
				console.log("Setting aws profile to", configure.aws.profile);
				var credentials = new AWS.SharedIniFileCredentials({
					profile: configure.aws.profile
				});
				AWS.config.credentials = credentials;
				process.env.AWS_DEFAULT_PROFILE = configure.aws.profile;
			}\n` + contents.replace(`"use strict";`, "");

		// Compile the module to run
		let r = path.normalize(path.resolve(rootDir, "__leo-cli-test-runner.js")).replace(/\\/g, "\\\\");
		let m = new modulejs(r, module);

		contents = stripBOM(contents).replace(/^\#\!.*/, ''); // remove shebang
		runInThisContext(modulejs.wrap(contents), {
			filename: r
		}).apply(m.exports, [m.exports, require, m, r, path.dirname(r)]);

		let handler = m.exports.handler;

		var runner = {
			event: event => event,
			callback: (err, data, callback) => callback(err, data)
		};
		var runnerFile = __dirname + "/lib/test/" + type + ".js";
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

		handler(runner.event(event), createContext(pkg, config), (err, data) => {
			runner.callback(err, data, (err, data) => {
				data && console.log("\n\n\n--------------------------Results--------------------------\n")
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
			})
		});
	})
	.parse(process.argv);

if (!process.argv.slice(2).length) {
	program.outputHelp(colors.red);
}

function createContext(pkg, config) {
	var start = new Date();
	var maxTime = (config.timeout || 300) * 1000;
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

function stripBOM(content) {
	// Remove byte order marker. This catches EF BB BF (the UTF-8 BOM)
	// because the buffer-to-string conversion in `fs.readFileSync()`
	// translates it to FEFF, the UTF-16 BOM.
	if (content.charCodeAt(0) === 0xFEFF) {
		content = content.slice(1);
	}
	return content;
}