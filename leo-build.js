#!/usr/bin/env node

var path = require('path');
// var fs = require('fs');
var program = require('commander');
var colors = require('colors');
// var archiver = require('archiver');
// var aws = require("aws-sdk");
// var glob = require("glob");
// var CopyWebpackPlugin = require('copy-webpack-plugin');

// var babelify = require("babelify");

// var spawn = require('child_process').spawn;
// var execsync = require('child_process').execSync;
// var through = require('through2');

// var async = require("async");
// var moment = require("moment");
// var leo = require("leo-sdk");

// var configure;

// //Build Stuff
// var browserify = require('browserify');
// var gulp = require("gulp");
// var source = require('vinyl-source-stream');
// var buffer = require('vinyl-buffer');
// var gutil = require('gulp-util');
// var uglify = require('gulp-uglify');
// var rename = require('gulp-rename');
// var ejs = require("gulp-ejs");
// var buildConfig = require("./lib/build-config").build;

// //webpack
// var webpack = require('webpack');
// var ExtractTextPlugin = require("extract-text-webpack-plugin");
var cmds = require("./lib/build.js")
program
	.version('0.0.1')
	.option("-e, --env [env]", "Environment")
	.option("-r, --region [region]", "AWS Region")
	.option("-p, --profile [profile]", "AWS Profile")
	.arguments('<dir> [alias] [region]')
	.usage('<dir> [alias] [region] [options]')
	.action(function (dir, alias, region) {

		var rootDir = path.resolve(process.cwd(), "./" + dir);
		cmds.build(program, rootDir, {
			alias,
			region
		}, (err) => {

		});
		// alias = program.env || alias;
		// region = program.region || region
		// console.log("Build Alias:", alias || "dev");
		// process.env.LEO_ENV = alias || "dev";
		// process.env.LEO_REGION = region;

		// var rootDir = path.resolve(process.cwd(), "./" + dir);
		// configure = buildConfig(rootDir);

		// configure.aws = configure.aws || {};
		// region = configure._meta.region;
		// if (program.profile) {
		// 	console.log("Using cli profile", program.profile)
		// 	configure.aws.profile = program.profile;
		// }
		// if (configure.aws.profile) {
		// 	console.log("Setting profile to", configure.aws.profile);
		// 	var credentials = new aws.SharedIniFileCredentials({
		// 		profile: configure.aws.profile
		// 	});
		// 	aws.config.credentials = credentials;
		// 	process.env.AWS_DEFAULT_PROFILE = configure.aws.profile;
		// }

		// console.log("Setting region to", region);

		// var deployAlias = alias ? alias.toLowerCase() : 'dev';

		// var pkg = require(path.resolve(rootDir, "package.json"));


		// var config = configure;

		// if (config.type == "bot" || config.type == "cron" || config.type == "resource" || config.type == "apigateway") {
		// 	buildLambdaDirectory(rootDir, {}, function (err, data) {
		// 		console.log(err, data);
		// 	});
		// } else if (config.type == "package") {
		// 	let cloudformation = fs.readFileSync(path.resolve(rootDir, "cloudformation.json"), {
		// 		encoding: "utf-8"
		// 	});
		// 	let lambdas = config.lambdas || [];
		// 	let dir = `${config.name}-${moment.now()}`;
		// 	async.mapLimit(lambdas, 5, (lambdaDir, done) => {
		// 		buildLambdaDirectory(path.resolve(rootDir, lambdaDir), {
		// 			dir: dir
		// 		}, (err, data) => {
		// 			//setTimeout(() => done(err, data), 500)
		// 			done(err, data)
		// 		});
		// 	}, err => {
		// 		console.log("All lambda zip files completed", err || undefined);
		// 		console.log("Create cloudformation");
		// 		let cfPath = path.resolve(rootDir, "cloudformation.json");
		// 		if (fs.existsSync(cfPath)) {
		// 			let cf = require(cfPath);
		// 			console.log(config)
		// 			cf.Resources.LEO_VARS = {
		// 				Type: "Custom::LeoVariables",
		// 				Version: "1.0",
		// 				Properties: {
		// 					"ServiceToken": {
		// 						"Fn::Join": [
		// 							"", ["arn:aws:lambda:", {
		// 								"Ref": "AWS::Region"
		// 							}, ":", {
		// 								"Ref": "AWS::AccountId"
		// 							}, ":leo:vars"]
		// 						]
		// 					},
		// 					bucket: leo.configuration.bus.s3,
		// 					version: moment.now().toString()
		// 				}
		// 			};

		// 			fs.writeFileSync(`/tmp/${dir}/cloudformation.js`, JSON.stringify(cf, null, 2));

		// 			//console.log(`Uploading static files ${staticDir} to ${config.staticS3}/${newVersion}`);
		// 			//spawn('aws', ['s3', 'sync', staticDir, `${config.staticS3}/${newVersion}`]);
		// 		}

		// 	});
		// } else {
		// 	console.log("Unknown config.leo.type, not in (bot, cron, resource, microservice)");
		// }
	})
	.parse(process.argv);

if (!process.argv.slice(2).length) {
	program.outputHelp(colors.red);
}


// function buildLambdaDirectory(rootDir, config, callback) {
// 	var folder = config.dir ? `tmp/${config.dir}` : "tmp";
// 	if (!fs.existsSync(`/${folder}`)) {
// 		fs.mkdirSync(`/${folder}`);
// 	}
// 	var config = buildConfig(rootDir);
// 	console.log("Run build on", rootDir)
// 	execsync("npm install", {
// 		cwd: rootDir
// 	});
// 	console.log(`Zipping Lambda Function ${config.name}`);
// 	var archive = archiver('zip');
// 	var zipFilename = `/${folder}/${config.name}.zip`;
// 	var indexFilename = `${config.name}-index-${moment.now()}.js`;
// 	var zip = fs.createWriteStream(zipFilename);
// 	archive.pipe(zip);

// 	var b = browserify({
// 		standalone: 'lambda',
// 		bare: true,
// 		entries: [__dirname + "/lib/leowrap.js"],
// 		browserField: false,
// 		builtins: false,
// 		commondir: false,
// 		detectGlobals: true,
// 		insertGlobalVars: {
// 			process: function () {
// 				return;
// 			}
// 		},
// 		debug: true
// 	});
// 	b.transform(babelify, {
// 		presets: ["es2015"],
// 		sourceMaps: false
// 	});
// 	b.external("aws-sdk");

// 	if (config.build && config.build.include) {
// 		for (var i = 0; i < config.build.include.length; i++) {
// 			var inc = config.build.include[i];
// 			var src = inc.src || inc;
// 			var dest = inc.dest || "node_modules/";

// 			src = path.resolve(rootDir, src);
// 			b.external(path.basename(src));

// 			if (fs.lstatSync(src).isDirectory()) {
// 				execsync("npm install", {
// 					cwd: src
// 				});
// 			}
// 			archive.directory(path.normalize(src), path.join(dest, path.basename(src)));

// 		}
// 	}
// 	b.transform(function (file) {
// 		if (file.match("leowrap")) {
// 			return through(function (buf, enc, next) {
// 				next(null, "");
// 			}, function (cb) {
// 				var type = config.type;
// 				if (config.cron && typeof config.cron == "object" && config.cron.autoType !== false) {
// 					type = "cron";
// 				}
// 				var wrapperFile = __dirname + "/lib/wrappers/" + type + ".js";
// 				if (!fs.existsSync(wrapperFile)) {
// 					wrapperFile = __dirname + "/lib/wrappers/base.js";
// 				}
// 				var contents = fs.readFileSync(wrapperFile, 'utf-8')
// 					.replace("____FILE____", path.normalize(path.resolve(rootDir, "index.js")).replace(/\\/g, "\\\\"));
// 				this.push(contents);
// 				cb();
// 			});
// 		} else if (file.match("leoConfigure.js")) {
// 			return through(function (buf, enc, next) {
// 				next(null, "");
// 			}, function (cb) {
// 				this.push("module.exports = " + JSON.stringify(config));
// 				cb();
// 			});
// 		} else if (file.match("leo-sdk-config.js")) {

// 			return through(function (buf, enc, next) {
// 				next(null, "");
// 			}, function (cb) {
// 				var sdkConfigData = "{}";
// 				var sdkConfigPath = path.resolve(`${require('os').homedir()}/.leo`, "config.json")
// 				if (fs.existsSync(sdkConfigPath)) {
// 					sdkConfigData = JSON.parse(fs.readFileSync(sdkConfigPath) || sdkConfigData);
// 				}
// 				// Can't Change aws profile in lambda so remove the profile key
// 				Object.keys(sdkConfigData).map(k => delete sdkConfigData[k].profile);
// 				this.push("module.exports = " + JSON.stringify(sdkConfigData));
// 				cb();
// 			});
// 		} else {
// 			return through();
// 		}
// 	}, {
// 		global: true
// 	});
// 	b.bundle().pipe(source(indexFilename)).pipe(buffer())
// 		.pipe(gulp.dest(`/${folder}/`)).on("end", () => {
// 			console.log("done building");
// 			archive.file(`/${folder}/${indexFilename}`, {
// 				name: "index.js"
// 			});
// 			if (config.files) {
// 				for (var file in config.files) {
// 					archive.file(config.files[file], {
// 						name: file
// 					});
// 				}
// 			}
// 			zip.on("close", function () {
// 				console.log("Created zip");
// 				fs.unlinkSync(`/${folder}/${indexFilename}`);
// 				callback(null, {
// 					config: config,
// 					path: zipFilename
// 				});
// 			});
// 			archive.finalize();
// 		});
// }