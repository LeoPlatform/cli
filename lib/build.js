var path = require('path');
var fs = require('fs');
var archiver = require('archiver');
var aws = require("aws-sdk");
var glob = require("glob");
var CopyWebpackPlugin = require('copy-webpack-plugin');

var babelify = require("babelify");

var spawn = require('child_process').spawn;
var spawnSync = require('child_process').spawnSync;
var execsync = require('child_process').execSync;
var through = require('through2');
const PassThrough = require("stream").PassThrough;


var async = require("async");
var moment = require("moment");

let utils = {
	findParentFiles: function(dir, filename) {
		var paths = [];
		do {
			paths.push(dir);

			var lastDir = dir;
			dir = path.resolve(dir, "../");
		} while (dir != lastDir);

		var matches = [];
		paths.forEach(function(dir) {
			var file = path.resolve(dir, filename);
			if (fs.existsSync(file)) {

				matches.push(file);
			}
		});
		return matches;
	}
};
var configure;

//Build Stuff
var browserify = require('browserify');
var gulp = require("gulp");
var source = require('vinyl-source-stream');
var buffer = require('vinyl-buffer');
var gutil = require('gulp-util');
var rename = require('gulp-rename');
var ejs = require("gulp-ejs");
var buildConfig = require("./build-config").build;
var showPagesTemplate = fs.readFileSync(path.resolve(__dirname, "../templates/showpages.js"), 'utf-8');

//webpack
var webpack = require('webpack');
var ExtractTextPlugin = require("extract-text-webpack-plugin");
module.exports = {
	build: function(program, rootDir, opts = {}, callback) {
		opts = Object.assign({
			alias: program.env || 'dev',
			region: program.region || 'us-west-2',
			lambdas: [],
			public: false,
			buildDir: '/tmp/leo',
			cloudFormationOnly: false
		}, opts || {});

		process.env.LEO_ENV = opts.alias;
		process.env.LEO_REGION = opts.region;

		//console.log(opts.alias, opts.region)


		let deployAlias = opts.alias.toLowerCase();
		configure = buildConfig(rootDir);
		configure.aws = configure.aws || {};
		let region = configure._meta.region;

		if (program.profile) {
			console.log("Using cli profile", program.profile)
			configure.aws.profile = program.profile;
		}
		if (configure.aws.profile) {
			console.log("Setting aws profile to", configure.aws.profile);
			var credentials = require("./leo-aws")(configure.aws.profile);
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
		if (config.type === "bot" || config.type === "cron" || config.type === "resource" || config.type === "apigateway") {
			buildLambdaDirectory(rootDir, {
				dir: opts.buildDir,
				basename: rootDir,
				main: pkg.main
			}, function(err, data) {
				err && console.log(err);
				callback(err, data)
			});
		} else if (config.type === "package" || config.type === "microservice") {
			if (fs.existsSync(path.resolve(rootDir, "cloudformation.json"))) {
				fs.readFileSync(path.resolve(rootDir, "cloudformation.json"), {
					encoding: "utf-8"
				});
			}

			if (!opts.cloudFormationOnly) {
				console.time("Lambda zip files completed");
				console.log("\n\n---------------Building Lambda-------------------\n\n");
				async.mapLimit(opts.lambdas, 5, (lambdaDir, done) => {
					let pkg = require(path.resolve(lambdaDir.file, "package.json"));
					buildLambdaDirectory(lambdaDir.file, {
						dir: opts.buildDir,
						basename: lambdaDir.basename,
						main: pkg.main,
						microserviceDir: rootDir
					}, (err, data) => {
						done(err, data)
					});
				}, err => {
					err && console.log(err);
					console.log("\n\n---------------Done Building Lambda-------------------\n");
					console.timeEnd("Lambda zip files completed");
					writeCloudFormation(rootDir, opts, program, config, callback);
				});
			} else {
				writeCloudFormation(rootDir, opts, program, config, callback);
			}
		} else {
			console.log("Unknown config.leo.type, not in (bot, cron, resource, microservice) ", rootDir);
			callback();
		}
	},
	publish: function(rootDir, remoteDir, opts, callback) {
		opts = Object.assign({
			public: false,
			profile: null
		}, opts || {});
		if (opts.cloudFormationOnly) {
			return callback();
		}

		console.log(`\n\n---------------${opts.label || "Publishing files"}-------------------`);
		console.log(`From ${rootDir} to ${remoteDir}`);
		console.time("Published Files");

		let args = ['s3', opts.command || 'sync', rootDir, `${remoteDir}`];
		if (opts.public) {
			args.push("--grants", "read=uri=http://acs.amazonaws.com/groups/global/AllUsers");
		}
		//why isn't this using leo-aws

		aws.config.credentials = require("./leo-aws")(opts.profile);
		aws.config.credentials.get(c => {
			let env = {
				AWS_ACCESS_KEY_ID: aws.config.credentials.accessKeyId,
				AWS_SECRET_ACCESS_KEY: aws.config.credentials.secretAccessKey,
			};
			if (aws.config.credentials.sessionToken) {
				env.AWS_SESSION_TOKEN = aws.config.credentials.sessionToken;
			}

			let upload = spawn('aws', args, {
				env: Object.assign({}, process.env, env)
			});
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
		});

	},
	buildStaticAssets: function(rootDir, configure, newVersion, opts, callback) {
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

			let name = configure.name.toLowerCase();
			let timezone = configure.ui.timezone;
			var publicPath = "/" + name + "/" + newVersion + "/";

			console.log("Dist Directory:", distDir);
			console.log("View Directory:", viewDir);
			console.log("View EJS Directory:", viewEJSDir);
			console.log("JS Directory:", jsDir);
			console.log("Public Path:", publicPath);

			glob(jsDir + "/*.js", {
				nodir: true
			}, function(err, files) {
				var entries = {};
				files.map((file) => {
					entries[path.basename(file, ".js")] = [file];
				});

				var config = [{
					devtool: 'eval-source-map',
					entry: entries,
					output: {
						path: path.join(rootDir, `/dist/`),
						filename: 'js/[name].js',
						chunkFilename: 'js/[name].js',
						publicPath: publicPath //needed for css to reference the images properly
					},
					mode: "production",
					node: {
						fs: "empty"
					},
					resolve: {
						modules: ['node_modules', path.resolve(__dirname, "../node_modules")]
					},
					resolveLoader: {
						modules: ['node_modules', path.resolve(__dirname, "../node_modules")]
					},
					optimization: {
						minimize: true,
						splitChunks: {
							cacheGroups: {
								common: {
									test: /node_modules/,
									name: "common",
									chunks: "initial",
									enforce: true
								}
							}
						}
					},
					plugins: [
						new CopyWebpackPlugin([{
							from: path.join(rootDir, `/ui/static/`)
						}]),
						new webpack.DefinePlugin({
							'process.env': {
								'NODE_ENV': JSON.stringify('production')
							}
						}),
						new ExtractTextPlugin("css/[name].css")
					],
					module: {
						rules: [{
							test: /\.jsx?$/,
							exclude: /(node_modules|bower_components)/,
							use: {
								loader: 'babel-loader',
								options: {
									cacheDirectory: true,
								}
							}
						}, {
							test: /\.(less|css)$/,
							exclude: /(node_modules|bower_components)/,
							use: ExtractTextPlugin.extract({
								fallback: "style-loader",
								use: "css-loader!less-loader"
							})
						}, {
							test: /\.(jpg|jpeg|gif|png)$/,
							exclude: /(node_modules|bower_components)/,
							use: {
								loader: 'url-loader?limit=2000&name=images/[name].[ext]'
							}
						}, {
							test: /\.json?$/,
							exclude: /(node_modules|bower_components)/,
							use: {
								loader: 'json-loader'
							}
						}, {
							test: /\.woff(2)?(\?.*)?$/,
							exclude: /(node_modules|bower_components)/,
							use: {
								loader: "url-loader?limit=10000&mimetype=application/font-woff&name=images/[name].[ext]"
							}
						}, {
							test: /\.(ttf|eot|svg)(\?.*)?$/,
							exclude: /(node_modules|bower_components)/,
							use: {
								loader: "file-loader"
							}
						}]
					}
				}];
				webpack(config, function(err, stats) {
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
						.pipe(gulp.dest(viewDir)).on('end', function() {
							callback(null, path.normalize(path.resolve(rootDir, "dist")));
						});
				});
			});
		} else {
			callback(null, path.normalize(path.resolve(rootDir, "static")));
		}
	},
	createMicroserviceApp: function(rootDir, configure, version, opts) {
		//let's look for all views that need to be added
		var viewDir = path.normalize(path.resolve(rootDir, "views"));

		var logicalResourceId = opts.LogicalResourceId || "ShowPages";
		var showPagesFiles = [];
		let files = glob.sync(path.resolve(rootDir, "views") + "/**/*", {
			nodir: true
		});
		console.log("Views", files)
		files.forEach(function(file) {
			var f = path.basename(file);

			var p = path.relative(viewDir, path.dirname(file)).replace(/\\/g, '/');
			if (p) {
				p = p + "/";
			} else {
				p = "";
			}

			showPagesFiles.push(p + f);
			if (f.match(/^index/)) {
				showPagesFiles.push(p + "_base");
			}
		});
		let swagger = {
			paths: {}
		};
		showPagesFiles.forEach(function(file) {
			var snippet = {
				"get": {
					"consumes": [
						"application/json"
					],
					"produces": [
						"text/html"
					],
					"responses": {
						"200": {
							"description": "200 response",
							"headers": {
								"Content-Type": {
									"type": "string"
								}
							}
						}
					},
					"x-amazon-apigateway-integration": {
						"responses": {
							"default": {
								"statusCode": "200",
							}
						},
						"uri": {
							"Fn::Sub": `arn:aws:apigateway:\${AWS::Region}:lambda:path/2015-03-31/functions/\${ShowPages.Arn}/invocations`
						},
						"passthroughBehavior": "when_no_match",
						"httpMethod": "POST",
						"contentHandling": "CONVERT_TO_TEXT",
						"type": "aws_proxy"
					}
				}
			};
			if (file.match(/_base$/)) {
				var dir = path.dirname(file);
				if (dir == ".") {
					dir = "";
				}
				swagger.paths['/' + dir] = snippet;
			} else {
				swagger.paths['/' + file] = snippet;
			}
		});
		return {
			LogicalResourceId: logicalResourceId,
			swagger: swagger,
			files: files,
			version: version
		};
	},
	buildMicroserviceApp: function(rootDir, configure, version, opts, callback) {
		let self = this;
		if (opts.cloudFormationOnly) {
			return callback();
		}
		this.buildStaticAssets(rootDir, configure, version, {
			cloudfront: opts.cloudfront
		}, (err, staticDir) => {

			if (err) {
				return callback(err);
			}

			//let's look for all views that need to be added
			var viewDir = path.normalize(path.resolve(rootDir, "views"));

			var archive = archiver('zip');
			var logicalResourceId = "ShowPages";
			var basename = `${logicalResourceId}_${version}.zip`;
			var zipFilename = `${opts.dir}/${basename}`;
			var zip = fs.createWriteStream(zipFilename);
			archive.pipe(zip);
			var showPagesFiles = [];
			var files = opts.files;
			files.forEach(function(file) {
				var f = path.basename(file);

				var p = path.relative(viewDir, path.dirname(file)).replace(/\\/g, '/');
				if (p) {
					p = p + "/";
				} else {
					p = "";
				}

				showPagesFiles.push(p + f);
				archive.file(file, {
					name: "pages/" + p + f
				});
				if (f.match(/^index/)) {
					showPagesFiles.push(p + "_base");
					archive.file(file, {
						name: "pages/" + p + "_base"
					});
				}
			});
			console.log("Show Pages Template", showPagesFiles);
			//Are they using leo-config
			if (fs.existsSync(path.resolve(rootDir, "leo_config.js"))) {
				let builder = require(require.resolve("leo-config", {
					paths: [rootDir]
				}));
				let c = builder.bootstrap(path.resolve(rootDir, "leo_config.js"))._leo_prebuilt_ui;

				for (let env in c) {
					c[env].version = version;
					c[env].staticAssets = c[env].staticAssets.replace(/\/$/, '') + "/" + version + "/";
				}
				showPagesTemplate = showPagesTemplate.replace(/__CONFIG__/, JSON.stringify(c));
			} else {
				showPagesTemplate = showPagesTemplate.replace(/__CONFIG__/, JSON.stringify({}));
			}
			showPagesTemplate = showPagesTemplate.replace(/__PAGES__/, JSON.stringify(showPagesFiles));

			archive.append(showPagesTemplate, {
				name: "index.js"
			});

			zip.on("close", function() {
				self.publish(staticDir, "s3://" + opts.static.replace(/^s3:\/\//, ""), {
					public: opts.public,
					profile: opts.profile
				}, err => callback(err, {
					LogicalResourceId: logicalResourceId
				}));
			});
			archive.finalize();
		});
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



	let pass;


	var type = config.type;
	if (config.useWrappers) {
		pass = new PassThrough();
		var wrapperFile = __dirname + "/wrappers/" + type + ".js";
		if (!fs.existsSync(wrapperFile)) {
			wrapperFile = __dirname + "/wrappers/base.js";
		}
		var contents = fs.readFileSync(wrapperFile, 'utf-8')
			.replace("____FILE____", path.normalize(path.resolve(rootDir, opts.main || "index.js")).replace(/\\/g, "\\\\"))
			.replace("____PACKAGEJSON____", path.normalize(path.resolve(rootDir, "package.json")).replace(/\\/g, "\\\\"))
			.replace("____HANDLER____", config.handler || "handler");
		pass.write(contents);
		pass.end();
	} else {
		pass = path.resolve(rootDir, opts.main || "index.js");
	}

	var b = browserify({
		standalone: 'lambda',
		bare: true,
		basedir: rootDir,
		entries: [pass],
		browserField: false,
		builtins: false,
		paths: [path.resolve(__dirname, "../node_modules")],
		commondir: false,
		detectGlobals: true,
		insertGlobalVars: {
			process: function() {
				return;
			}
		},
		debug: true
	});
	b.transform(babelify, {
		presets: [
			[path.resolve(__dirname, "../node_modules/babel-preset-env"), {
				"targets": {
					"node": "8.10"
				}
			}]
		],
		sourceMaps: false
	});
	b.external("aws-sdk");

	let processModuleBuild = function(rootDir, build) {
		if (build && build.include) {
			for (var i = 0; i < build.include.length; i++) {
				var inc = build.include[i];
				var src = inc.src || inc;
				var dest = inc.dest || "node_modules/";

				let origSrc = src;
				src = path.resolve(rootDir, src);
				if (!fs.existsSync(src)) {
					let origRoot = rootDir;
					let paths = require('module')._nodeModulePaths(rootDir);
					let found = false;
					for (var key in paths) {
						src = path.resolve(paths[key], origSrc);
						if (fs.existsSync(src)) {
							rootDir = paths[key];
							found = true;
							break;
						}
					}
					if (!found) {
						throw new Error(`Unable to find source file '${origSrc}'`)
					}
				}

				b.external(path.basename(src));
				console.log("Adding External", src)
				if (fs.lstatSync(src).isDirectory()) {
					execsync("npm install --only=prod", {
						cwd: src
					});
				}
				archive.directory(path.normalize(src), path.join(dest, path.basename(src)));
			}
		}
	}
	if (config.build) {
		processModuleBuild(rootDir, config.build);
	}

	let loadedModules = {};
	b.transform(function(file) {
		// Find any modules that have leo build commands
		let m = file.match(/.*?[\/\\]node_modules[\/\\](.*?)[\/\\]/);
		if (m && !(m[1] in loadedModules)) {
			loadedModules[m[1]] = true;
			let pkgPath = path.resolve(path.dirname(file), "package.json");
			if (fs.existsSync(pkgPath)) {
				let pkgData = require(pkgPath);
				processModuleBuild(path.dirname(file), pkgData && pkgData.config && pkgData.config.leo && pkgData.config.leo.build);
			}
		}

		if (file.match("leoConfigure.js")) {
			return through(function(buf, enc, next) {
				next(null, "");
			}, function(cb) {
				this.push("module.exports = " + JSON.stringify(config));
				cb();
			});
		} else if (file.match("leo-sdk-config.js")) {
			return through(function(buf, enc, next) {
				next(null, "");
			}, function(cb) {
				var sdkConfigData = {};
				let matches = utils.findParentFiles(process.cwd(), "leo_config.json");
				let sdkConfigPath;
				if (matches.length) {
					sdkConfigPath = matches[0];
				} else {
					sdkConfigPath = path.resolve(`${require('os').homedir()}/.leo`, "config.json");
				}
				//var sdkConfigPath = path.resolve(`${require('os').homedir()}/.leo`, "config.json");
				if (fs.existsSync(sdkConfigPath) && !config.excludeProfiles) {
					sdkConfigData = JSON.parse(fs.readFileSync(sdkConfigPath) || sdkConfigData);

					if (config.profiles) {
						let profiles = config.profiles;
						let tmp = {};
						config.profiles.map((p => {
							tmp[p] = sdkConfigData[p];
							// Can't Change aws profile in lambda so remove the profile key
							if (tmp[p] && tmp[p].profile) {
								delete tmp[p].profile;
							}
						}))
						sdkConfigData = tmp;
						sdkConfigData.default = sdkConfigData.default || sdkConfigData[config.defaultProfile] || sdkConfigData[config.profiles[0]];
					} else {
						Object.keys(sdkConfigData).map(k => delete sdkConfigData[k].profile);
						sdkConfigData.default = sdkConfigData.default || sdkConfigData[Object.keys(sdkConfigData)[0]];
					}
				}
				this.push(`module.exports = ${JSON.stringify(sdkConfigData)};`)
				cb();
			});
		} else if (file.match(/leo-config[/\\]index\.js$/)) {
			return through(function(buf, enc, next) {
				next(null, "");
			}, function(cb) {
				let configPath = path.resolve(config._meta.microserviceDir, './leo_config.js').replace(/\\/g, "/");
				if (fs.existsSync(configPath)) {
					this.push(fs.readFileSync(file) + `
						module.exports.bootstrap(require("${configPath}"));
					`);
				} else {
					this.push(fs.readFileSync(file))
				}
				cb();
			});
		} else {
			// Match any sdks
			let parts = path.basename(file).match(/(.*?)(?:-(.*?))?-config\.js$/)
			if (parts) {
				return through(function(buff, enc, next) {
					next(null, "");
				}, function(cb) {
					let dirs = [".leo"];
					let filenames = [];
					if (parts[2]) {
						if (parts[1] !== "leo") {
							dirs.unshift(`.${parts[1]}`);
						}
						filenames.push(`${parts[1]}-${parts[2]}.json`);
						filenames.push(`${parts[1]}-${parts[2]}-config.json`);
						filenames.push(`${parts[2]}.json`);
						filenames.push(`${parts[2]}-config.json`);
					} else {
						filenames.push(`${parts[1]}.json`);
						filenames.push(`${parts[1]}-config.json`);
					}
					//console.log(dirs);
					//console.log(filenames);

					var sdkConfigData;

					configloop:
						for (let i in dirs) {
							let dir = dirs[i]
							for (let j in filenames) {
								let filename = filenames[j];
								let matches = utils.findParentFiles(process.cwd(), filename);
								let sdkConfigPath;
								if (matches.length) {
									sdkConfigPath = matches[0];
								} else {
									sdkConfigPath = path.resolve(`${require('os').homedir()}/${dir}`, filename);
								}
								//console.log(sdkConfigPath)
								if (fs.existsSync(sdkConfigPath) && !config.excludeProfiles) {
									sdkConfigData = JSON.parse(fs.readFileSync(sdkConfigPath) || sdkConfigData);
									//console.log(config.profiles)
									if (config.profiles) {
										let profiles = config.profiles;
										let tmp = {};
										config.profiles.map((p => {
											tmp[p] = sdkConfigData[p];
											// Can't Change aws profile in lambda so remove the profile key
											if (tmp[p] && tmp[p].profile) {
												delete tmp[p].profile;
											}
										}))
										sdkConfigData = tmp;
										sdkConfigData.default = sdkConfigData.default || sdkConfigData[config.defaultProfile] || sdkConfigData[config.profiles[0]];
									}
									sdkConfigData.default = sdkConfigData.default || sdkConfigData[Object.keys(sdkConfigData)[0]];
									break configloop;
								}
							};
						};

					if (sdkConfigData) {
						this.push(`module.exports = ${JSON.stringify(sdkConfigData)};`)
					} else {
						// Didn't match a config so just pass through
						this.push(fs.readFileSync(file));
					}
					cb();
				});
			}

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
			zip.on("close", function() {
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

/**
 * Write Cloud Formation file
 * @param rootDir
 * @param opts
 * @param program
 * @param config
 * @param callback
 */
function writeCloudFormation(rootDir, opts, program, config, callback) {
	console.time("\nCreated cloudformation");
	let cfPath = path.resolve(rootDir, "cloudformation.json");
	let cf = opts.cloudFormation;
	if (!cf && fs.existsSync(cfPath)) {
		cf = require(cfPath);
	}

	if (cf) {
		// if -s or --save flag, write the cloudformation to our microservice directory
		if (program.saveCloudFormation && config._meta && config._meta.microserviceDir) {
			fs.writeFileSync(`${config._meta.microserviceDir}/cloudformation.json`, JSON.stringify(cf, null, 2));
		}

		fs.writeFileSync(`${opts.buildDir}/cloudformation.json`, JSON.stringify(cf, null, 2));
		fs.writeFileSync(`${opts.buildDir}/cloudformation-${Date.now()}.json`, JSON.stringify(cf, null, 2));
		console.timeEnd("\nCreated cloudformation");
		callback(null, true);
	} else {
		callback('Unable to create cloudformation.json');
	}
}
