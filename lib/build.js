var path = require('path');
var fs = require('fs');
var archiver = require('archiver');
var aws = require("aws-sdk");
var glob = require("glob");
var CopyWebpackPlugin = require('copy-webpack-plugin');

var babelify = require("babelify");

var spawn = require('child_process').spawn;
var execsync = require('child_process').execSync;
var through = require('through2');

var async = require("async");
var moment = require("moment");
//var leo = require("leo-sdk");

var configure;

//Build Stuff
var browserify = require('browserify');
var gulp = require("gulp");
var source = require('vinyl-source-stream');
var buffer = require('vinyl-buffer');
var gutil = require('gulp-util');
var uglify = require('gulp-uglify');
var rename = require('gulp-rename');
var ejs = require("gulp-ejs");
var buildConfig = require("./build-config").build;

//webpack
var webpack = require('webpack');
var ExtractTextPlugin = require("extract-text-webpack-plugin");
module.exports = {
	build: function (program, rootDir, opts = {}, callback) {
		opts = Object.assign({
			alias: program.env || 'dev',
			region: program.region || 'us-west-2',
			lambdas: [],
			public: false,
			buildDir: '/tmp/leo'
		}, opts || {});

		process.env.LEO_ENV = opts.alias;
		process.env.LEO_REGION = opts.region;


		let deployAlias = opts.alias.toLowerCase();
		configure = buildConfig(rootDir);
		configure.aws = configure.aws || {};
		let region = configure._meta.region;


		if (program.profile) {
			console.log("Using cli profile", program.profile)
			configure.aws.profile = program.profile;
		}
		if (configure.aws.profile) {
			console.log("Setting profile to", configure.aws.profile);
			var credentials = new aws.SharedIniFileCredentials({
				profile: configure.aws.profile
			});
			aws.config.credentials = credentials;
			process.env.AWS_DEFAULT_PROFILE = configure.aws.profile;
		}
		console.log("Setting region to", region);
		var pkg = require(path.resolve(rootDir, "package.json"));
		//console.log(rootDir, pkg)
		if (!fs.existsSync(opts.buildDir)) {
			fs.mkdirSync(opts.buildDir);
		}

		var config = configure;
		if (config.type == "bot" || config.type == "cron" || config.type == "resource" || config.type == "apigateway") {
			buildLambdaDirectory(rootDir, {
				dir: opts.buildDir,
				basename: rootDir,
				main: pkg.main
			}, function (err, data) {
				err && console.log(err);
				callback(err, data)
			});
		} else if (config.type == "package" || config.type == "microservice") {
			let cloudformation = fs.readFileSync(path.resolve(rootDir, "cloudformation.json"), {
				encoding: "utf-8"
			});

			console.time("Lambda zip files completed");
			console.log("\n\n---------------Building Lambda-------------------\n\n");
			async.mapLimit(opts.lambdas, 5, (lambdaDir, done) => {

				let pkg = require(path.resolve(lambdaDir.file, "package.json"));
				buildLambdaDirectory(lambdaDir.file, {
					dir: opts.buildDir,
					basename: lambdaDir.basename,
					main: pkg.main
				}, (err, data) => {
					done(err, data)
				});
			}, err => {
				err && console.log(err);
				console.log("\n\n---------------Done Building Lambda-------------------\n");
				console.timeEnd("Lambda zip files completed");
				console.time("\nCreated cloudformation");
				let cfPath = path.resolve(rootDir, "cloudformation.json");
				let cf = opts.cloudFormation;
				if (!cf && fs.existsSync(cfPath)) {
					cf = require(cfPath);
				}
				if (cf) {

					fs.writeFileSync(`${opts.buildDir}/cloudformation.json`, JSON.stringify(cf, null, 2));
					fs.writeFileSync(`${opts.buildDir}/cloudformation-${Date.now()}.json`, JSON.stringify(cf, null, 2));
					console.timeEnd("\nCreated cloudformation");
					callback(null, true);
				}

			});
		} else {
			console.log("Unknown config.leo.type, not in (bot, cron, resource, microservice)");
			callback();
		}
	},
	publish: function (rootDir, remoteDir, opts, callback) {
		opts = Object.assign({
			public: false

		}, opts || {});

		console.log("\n\n---------------Publishing files-------------------");
		console.log(`From ${rootDir} to ${remoteDir}`);
		console.time("Published Files");

		let args = ['s3', 'sync', rootDir, `${remoteDir}`];
		if (opts.public) {
			args.push("--grants", "read=uri=http://acs.amazonaws.com/groups/global/AllUsers");
		}
		let upload = spawn('aws', args);
		upload.stdout.on('data', (data) => {});
		upload.stderr.on('data', (data) => {
			console.log(data.toString());
		});
		upload.on('close', (code) => {
			if (code === 0) {
				console.timeEnd("Published Files");
				callback();
			} else {
				console.log("Error Publishing files");
				callback("Error publishing files");
			}
		});
	},
	buildStatic: function (rootDir, configure, newVersion, callback) {
		execsync("npm install", {
			cwd: rootDir
		});
		if (configure.subtype == "react") {
			var jsDir = path.normalize(path.resolve(rootDir, "ui/js/"));

			var viewDir = path.normalize(path.resolve(rootDir, "views"));
			var viewEJSDir = path.normalize(path.resolve(rootDir, "views_ejs"));

			var distDir = path.normalize(path.join(rootDir, `/dist/`));

			if (!fs.existsSync(distDir)) {
				fs.mkdirSync(distDir);
			}

			// TODO: I need
			//  - cloudfront

			let cloudfront = configure.static.cloudfront;
			let name = configure.name.toLowerCase();
			let timezone = configure.ui.timezone;

			var configFile = path.normalize(path.resolve(distDir, "leoConfigure.js"));
			fs.writeFileSync(configFile, "module.exports = " + JSON.stringify({
				type: "ui",
				version: newVersion,
				static: {
					uri: cloudfront + name + "/" + newVersion + "/"
				},
				timezone: timezone
			}));

			glob(jsDir + "/*.js", {
				nodir: true
			}, function (err, files) {
				var entries = {};
				files.map((file) => {
					entries[path.basename(file, ".js")] = [file];
				});

				var extractCSS = new ExtractTextPlugin("css/[name].css");

				var config = [{
					devtool: 'eval-source-map',
					entry: entries,
					output: {
						path: path.join(rootDir, `/dist/`),
						filename: 'js/[name].js',
						publicPath: cloudfront + name + "/" + newVersion + "/" //needed for css to reference the images properly
					},
					node: {
						fs: "empty"
					},
					plugins: [
						new webpack.NormalModuleReplacementPlugin(/leoConfigure\.js/, configFile),
						new CopyWebpackPlugin([{
							from: path.join(rootDir, `/ui/static/`)
						}]),
						new webpack.DefinePlugin({
							'process.env': {
								'NODE_ENV': JSON.stringify('production')
							}
						}),
						extractCSS,
						new webpack.optimize.CommonsChunkPlugin('js/common.js'),
						new webpack.optimize.DedupePlugin(),
						new webpack.optimize.UglifyJsPlugin({
							compressor: {
								screw_ie8: true,
								keep_fnames: true,
								warnings: false
							},
							mangle: {
								screw_ie8: true,
								keep_fnames: true
							}
						}),
						new webpack.optimize.OccurenceOrderPlugin(),
						new webpack.optimize.AggressiveMergingPlugin(),
					],
					module: {
						loaders: [{
							test: /\.jsx?$/,
							exclude: /node_modules/,
							loader: 'babel-loader',
							query: {
								"presets": ["react", "es2015", "stage-0"],
								"plugins": ["transform-decorators-legacy"]
							}
						}, {
							test: /\.(less|css)$/,
							loader: extractCSS.extract("style-loader", "css-loader!less-loader")
						}, {
							test: /\.(jpg|jpeg|gif|png)$/,
							loader: 'url-loader?limit=2000&name=images/[name].[ext]'
						}, {
							test: /\.json?$/,
							loader: 'json'
						}, {
							test: /\.woff(2)?(\?.*)?$/,
							loader: "url-loader?limit=10000&mimetype=application/font-woff&name=images/[name].[ext]"
						}, {
							test: /\.(ttf|eot|svg)(\?.*)?$/,
							loader: "file-loader"
						}]
					},
					debug: true
				}];
				webpack(config, function (err, stats) {
					if (err) {
						console.log(err);
					} else {
						console.log(stats.toString({
							assets: true,
							colors: true,
							version: false,
							hash: false,
							timings: false,
							chunks: false,
							chunkModules: false
						}));
					}

					//compile the views now
					gulp.src([viewEJSDir + '/**/*', "!" + viewEJSDir + '/partials/**'])
						.pipe(ejs({}).on('error', gutil.log))
						.pipe(rename({
							extname: ''
						}))
						.pipe(gulp.dest(viewDir)).on('end', function () {
							callback(null, path.normalize(path.resolve(rootDir, "dist")));
						});
				});
			});
		} else {
			callback(null, path.normalize(path.resolve(rootDir, "static")));
		}
	}
};



function buildLambdaDirectory(rootDir, opts, callback) {
	var config = buildConfig(rootDir);

	console.log("Run build on", rootDir)
	execsync("npm install", {
		cwd: rootDir
	});
	console.time(`Zipped Lambda Function ${opts.basename}`);
	var archive = archiver('zip');
	var zipFilename = `${opts.dir}/${opts.basename}`;
	var indexFilename = `${config.name}-index-${moment.now()}.js`;
	var zip = fs.createWriteStream(zipFilename);
	archive.pipe(zip);

	var b = browserify({
		standalone: 'lambda',
		bare: true,
		entries: [__dirname + "/leowrap.js"],
		browserField: false,
		builtins: false,
		commondir: false,
		detectGlobals: true,
		insertGlobalVars: {
			process: function () {
				return;
			}
		},
		debug: true
	});
	b.transform(babelify, {
		presets: ["es2015"],
		sourceMaps: false
	});
	b.external("aws-sdk");

	if (config.build && config.build.include) {
		for (var i = 0; i < config.build.include.length; i++) {
			var inc = config.build.include[i];
			var src = inc.src || inc;
			var dest = inc.dest || "node_modules/";

			src = path.resolve(rootDir, src);
			b.external(path.basename(src));

			if (fs.lstatSync(src).isDirectory()) {
				execsync("npm install", {
					cwd: src
				});
			}
			archive.directory(path.normalize(src), path.join(dest, path.basename(src)));

		}
	}
	b.transform(function (file) {
		if (file.match("leowrap")) {
			return through(function (buf, enc, next) {
				next(null, "");
			}, function (cb) {
				var type = config.type;

				var wrapperFile = __dirname + "/wrappers/" + type + ".js";
				if (!fs.existsSync(wrapperFile)) {
					wrapperFile = __dirname + "/wrappers/base.js";
				}
				var contents = fs.readFileSync(wrapperFile, 'utf-8')
					.replace("____FILE____", path.normalize(path.resolve(rootDir, opts.main || "index.js")).replace(/\\/g, "\\\\"))
					.replace("____HANDLER____", config.handler || "handler");
				this.push(contents);
				cb();
			});
		} else if (file.match("leoConfigure.js")) {
			return through(function (buf, enc, next) {
				next(null, "");
			}, function (cb) {
				this.push("module.exports = " + JSON.stringify(config));
				cb();
			});
		} else if (file.match("leo-sdk-config.js")) {
			return through(function (buf, enc, next) {
				next(null, "");
			}, function (cb) {
				var sdkConfigData = {};
				var sdkConfigPath = path.resolve(`${require('os').homedir()}/.leo`, "config.json")
				if (fs.existsSync(sdkConfigPath) && !config.excludeProfiles) {
					sdkConfigData = JSON.parse(fs.readFileSync(sdkConfigPath) || sdkConfigData);

					if (config.profiles) {
						let profiles = config.profiles;
						let tmp = {};
						config.profiles.map((p => {
							tmp[p] = sdkConfigData[p];
							// Can't Change aws profile in lambda so remove the profile key
							delete tmp[p].profile;
						}))
						sdkConfigData = tmp;
						sdkConfigData.default = sdkConfigData.default || sdkConfigData[config.defaultProfile] || sdkConfigData[config.profiles[0]];
					}
				}

				//Object.keys(sdkConfigData).map(k => delete sdkConfigData[k].profile);
				this.push(`module.exports = ${JSON.stringify(sdkConfigData)};`)
				cb();
			});
		} else {
			return through();
		}
	}, {
		global: true
	});
	b.bundle().pipe(source(indexFilename)).pipe(buffer())
		.pipe(gulp.dest(`${opts.dir}/`)).on("end", () => {
			archive.file(`${opts.dir}/${indexFilename}`, {
				name: "index.js"
			});
			if (config.files) {
				for (var file in config.files) {
					archive.file(config.files[file], {
						name: file
					});
				}
			}
			zip.on("close", function () {
				fs.unlinkSync(`${opts.dir}/${indexFilename}`);
				console.timeEnd(`Zipped Lambda Function ${opts.basename}`);
				callback(null, {
					config: config,
					path: zipFilename
				});
			});
			archive.finalize();
		});
}