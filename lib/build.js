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
var showPagesTemplate = require("./showpages.js");

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
			buildDir: '/tmp/leo'
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
		if (config.type == "bot" || config.type == "cron" || config.type == "resource" || config.type == "apigateway") {
			buildLambdaDirectory(rootDir, {
				dir: opts.buildDir,
				basename: rootDir,
				main: pkg.main
			}, function(err, data) {
				err && console.log(err);
				callback(err, data)
			});
		} else if (config.type == "package" || config.type == "microservice") {
			let cloudformation = {};
			if (fs.existsSync(path.resolve(rootDir, "cloudformation.json"))) {
				fs.readFileSync(path.resolve(rootDir, "cloudformation.json"), {
					encoding: "utf-8"
				});
			}

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
	publish: function(rootDir, remoteDir, opts, callback) {
		opts = Object.assign({
			public: false

		}, opts || {});

		console.log(`\n\n---------------${opts.label || "Publishing files"}-------------------`);
		console.log(`From ${rootDir} to ${remoteDir}`);
		console.time("Published Files");

		let args = ['s3', opts.command || 'sync', rootDir, `${remoteDir}`];
		if (process.env.LEO_AWS_PROFILE) {
			args.push("--profile", process.env.LEO_AWS_PROFILE);
		}
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

			// TODO: I need
			//  - cloudfront

			let cloudfront = configure.static.cloudfront;
			let name = configure.name.toLowerCase();
			let timezone = configure.ui.timezone;
			var publicPath = cloudfront + name + "/" + newVersion + "/";

			console.log("Dist Directory:", distDir);
			console.log("View Directory:", viewDir);
			console.log("View EJS Directory:", viewEJSDir);
			console.log("JS Directory:", jsDir);
			console.log("Public Path:", publicPath);

			var configFile = path.normalize(path.resolve(distDir, "leoConfigure.js"));
			fs.writeFileSync(configFile, "module.exports = " + JSON.stringify({
				type: "ui",
				version: newVersion,
				static: {
					uri: publicPath
				},
				timezone: timezone
			}));

			glob(jsDir + "/*.js", {
				nodir: true
			}, function(err, files) {
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
						publicPath: publicPath //needed for css to reference the images properly
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
								"responseParameters": {
									"method.response.header.Content-Type": "'text/html'"
								},
								"responseTemplates": {
									"text/html": "$input.path('$')"
								}
							}
						},
						"requestTemplates": {
							"application/json": "##  See http://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-mapping-template-reference.html\n##  This template will pass through all parameters including path, querystring, header, stage variables, and context through to the integration endpoint via the body/payload\n#set($allParams = $input.params())\n{\n\"body\" : $input.json('$'),\n\"params\" : {\n#foreach($type in $allParams.keySet())\n    #set($params = $allParams.get($type))\n\"$type\" : {\n    #foreach($paramName in $params.keySet())\n    \"$paramName\" : \"$util.urlDecode($util.escapeJavaScript($params.get($paramName)))\"\n        #if($foreach.hasNext),#end\n    #end\n}\n    #if($foreach.hasNext),#end\n#end\n},\n\"stage-variables\" : {\n#foreach($key in $stageVariables.keySet())\n\"$key\" : \"$util.escapeJavaScript($stageVariables.get($key))\"\n    #if($foreach.hasNext),#end\n#end\n},\n\"context\" : {\n    \"account-id\" : \"$context.identity.accountId\",\n    \"api-id\" : \"$context.apiId\",\n    \"api-key\" : \"$context.identity.apiKey\",\n    \"authorizer-principal-id\" : \"$context.authorizer.principalId\",\n    \"caller\" : \"$context.identity.caller\",\n    \"cognito-authentication-provider\" : [\"$context.identity.cognitoAuthenticationProvider\"],\n    \"cognito-authentication-type\" : \"$context.identity.cognitoAuthenticationType\",\n    \"cognito-identity-id\" : \"$context.identity.cognitoIdentityId\",\n    \"cognito-identity-pool-id\" : \"$context.identity.cognitoIdentityPoolId\",\n    \"http-method\" : \"$context.httpMethod\",\n    \"stage\" : \"$context.stage\",\n    \"source-ip\" : \"$context.identity.sourceIp\",\n    \"user\" : \"$context.identity.user\",\n    \"user-agent\" : \"$context.identity.userAgent\",\n    \"user-arn\" : \"$context.identity.userArn\",\n    \"request-id\" : \"$context.requestId\",\n    \"resource-id\" : \"$context.resourceId\",\n    \"resource-path\" : \"$context.resourcePath\"\n    }\n}\n"
						},
						"uri": {
							"Fn::Sub": `arn:aws:apigateway:\${AWS::Region}:lambda:path/2015-03-31/functions/\${ShowPages.Arn}/invocations`
						},
						"passthroughBehavior": "when_no_match",
						"httpMethod": "POST",
						"type": "aws"
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
		this.buildStaticAssets(rootDir, configure, version, {}, (err, staticDir) => {

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
			console.log("Show Pages Template", showPagesFiles)
			var showPagesFile = showPagesTemplate(configure, version, showPagesFiles);
			console.log("append index.js")
			archive.append(showPagesFile, {
				name: "index.js"
			});

			zip.on("close", function() {
				self.publish(staticDir, "s3://" + opts.static.replace(/^s3:\/\//, ""), {
					public: opts.public
				}, err => callback(err, {
					LogicalResourceId: logicalResourceId
				}));
			});
			archive.finalize();
		});
	},
	createMicroserviceApp2: function(rootDir, configure, version, opts, callback) {
		this.buildStaticAssets(rootDir, configure, version, {}, (err, staticDir) => {

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

			//var zip = fs.createWriteStream("/tmp/leobuild.zip");
			archive.pipe(zip);
			var showPagesFiles = [];
			glob(path.resolve(rootDir, "views") + "/**/*", {
				nodir: true
			}, function(err, files) {
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
				console.log("Show Pages Template", showPagesFiles)
				var showPagesFile = showPagesTemplate(configure, version, showPagesFiles);
				console.log("append index.js")
				archive.append(showPagesFile, {
					name: "index.js"
				});

				console.log(`Build App showPages function`);
				zip.on("close", function() {
					console.log("Zip Closed");
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
											"responseParameters": {
												"method.response.header.Content-Type": "'text/html'"
											},
											"responseTemplates": {
												"text/html": "$input.path('$')"
											}
										}
									},
									"requestTemplates": {
										"application/json": "##  See http://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-mapping-template-reference.html\n##  This template will pass through all parameters including path, querystring, header, stage variables, and context through to the integration endpoint via the body/payload\n#set($allParams = $input.params())\n{\n\"body\" : $input.json('$'),\n\"params\" : {\n#foreach($type in $allParams.keySet())\n    #set($params = $allParams.get($type))\n\"$type\" : {\n    #foreach($paramName in $params.keySet())\n    \"$paramName\" : \"$util.urlDecode($util.escapeJavaScript($params.get($paramName)))\"\n        #if($foreach.hasNext),#end\n    #end\n}\n    #if($foreach.hasNext),#end\n#end\n},\n\"stage-variables\" : {\n#foreach($key in $stageVariables.keySet())\n\"$key\" : \"$util.escapeJavaScript($stageVariables.get($key))\"\n    #if($foreach.hasNext),#end\n#end\n},\n\"context\" : {\n    \"account-id\" : \"$context.identity.accountId\",\n    \"api-id\" : \"$context.apiId\",\n    \"api-key\" : \"$context.identity.apiKey\",\n    \"authorizer-principal-id\" : \"$context.authorizer.principalId\",\n    \"caller\" : \"$context.identity.caller\",\n    \"cognito-authentication-provider\" : [\"$context.identity.cognitoAuthenticationProvider\"],\n    \"cognito-authentication-type\" : \"$context.identity.cognitoAuthenticationType\",\n    \"cognito-identity-id\" : \"$context.identity.cognitoIdentityId\",\n    \"cognito-identity-pool-id\" : \"$context.identity.cognitoIdentityPoolId\",\n    \"http-method\" : \"$context.httpMethod\",\n    \"stage\" : \"$context.stage\",\n    \"source-ip\" : \"$context.identity.sourceIp\",\n    \"user\" : \"$context.identity.user\",\n    \"user-agent\" : \"$context.identity.userAgent\",\n    \"user-arn\" : \"$context.identity.userArn\",\n    \"request-id\" : \"$context.requestId\",\n    \"resource-id\" : \"$context.resourceId\",\n    \"resource-path\" : \"$context.resourcePath\"\n    }\n}\n"
									},
									"uri": {
										"Fn::Sub": `arn:aws:apigateway:\${AWS::Region}:lambda:path/2015-03-31/functions/\${ShowPages.Arn}/invocations`
									},
									"passthroughBehavior": "when_no_match",
									"httpMethod": "POST",
									"type": "aws"
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
					callback(null, {
						LogicalResourceId: logicalResourceId,
						swagger: swagger
					});
				});
				archive.finalize();
			});
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

	var b = browserify({
		standalone: 'lambda',
		bare: true,
		entries: [__dirname + "/leowrap.js"],
		browserField: false,
		builtins: false,
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
		//presets: ["es2015"],
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

	b.transform(function(file) {
		if (file.match("leowrap")) {
			return through(function(buf, enc, next) {
				next(null, "");
			}, function(cb) {
				var type = config.type;

				var wrapperFile = __dirname + "/wrappers/" + type + ".js";
				if (!fs.existsSync(wrapperFile)) {
					wrapperFile = __dirname + "/wrappers/base.js";
				}
				var contents = fs.readFileSync(wrapperFile, 'utf-8')
					.replace("____FILE____", path.normalize(path.resolve(rootDir, opts.main || "index.js")).replace(/\\/g, "\\\\"))
					.replace("____PACKAGEJSON____", path.normalize(path.resolve(rootDir, "package.json")).replace(/\\/g, "\\\\"))
					.replace("____HANDLER____", config.handler || "handler");
				this.push(contents);
				cb();
			});
		} else if (file.match("leoConfigure.js")) {
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
				var sdkConfigPath = path.resolve(`${require('os').homedir()}/.leo`, "config.json");
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
								let sdkConfigPath = path.resolve(`${require('os').homedir()}/${dir}`, filename);
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
											delete tmp[p].profile;
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