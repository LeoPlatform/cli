var buildConfig = require("./build-config").build;
process.env.TZ = buildConfig(process.cwd(), {
	configOnly: true
}).timezone;

var staticNumber = Date.now();

var path = require('path');
var glob = require("glob");
var webpack = require('webpack');
var webpackMiddleware = require('webpack-dev-middleware');
var webpackHotMiddleware = require('webpack-hot-middleware');
var fs = require("fs");
var CopyWebpackPlugin = require('copy-webpack-plugin');

var gulp = require("gulp");
var browserify = require('browserify');
var babelify = require('babelify');
var watchify = require('watchify');
var source = require('vinyl-source-stream');
var buffer = require('vinyl-buffer');
var gutil = require('gulp-util');
var rename = require('gulp-rename');
var sourcemaps = require('gulp-sourcemaps');
var ejs = require("gulp-ejs");

const watch = require("node-watch");

const PassThrough = require("stream").PassThrough;

process.on('uncaughtException', function(err) {
	console.error((new Date).toUTCString() + ' uncaughtException:', err.message);
	console.error(err.stack);
});
require('source-map-support').install({
	environment: 'node',
	handleUncaughtExceptions: false
});

module.exports = function(rootDir, config, configure) {
	var viewDir = path.normalize(path.resolve(rootDir, "views"));
	var viewEJSDir = path.normalize(path.resolve(rootDir, "views_ejs"));
	var apiDir = path.normalize(path.resolve(rootDir, "api"));
	var rootDirString = rootDir.replace(/\\/g, "\\\\");
	var cssDir = path.normalize(path.resolve(rootDir, "ui/css/"));
	var imageDir = path.normalize(path.resolve(rootDir, "ui/images/"));
	var fontDir = path.normalize(path.resolve(rootDir, "ui/fonts/"));
	var webpackPoll = config.webpackPoll || null;

	var distDir = path.normalize(path.join(rootDir, `/dist/`));

	if (!fs.existsSync(distDir)) {
		fs.mkdirSync(distDir);
	}
	let testConfig = require("../leoCliConfigure.js")(process.env.NODE_ENV);
	configure.test = Object.assign({
		port: 80
	}, testConfig.test || {}, configure.test || {});
	var configFile = path.normalize(path.resolve(distDir, "leoConfigure.js"));
	configure.ui.type = "ui";

	//Watch and Compile Views
	var compileViews = function() {
		console.log("compiling views");
		return gulp.src([viewEJSDir + '/**/*', "!" + viewEJSDir + '/partials/**'])
			.pipe(ejs({}).on('error', gutil.log))
			.pipe(rename({
				extname: ''
			}))
			.pipe(gulp.dest('./views'));
	};

	gulp.task('views', [], compileViews);
	gulp.watch([viewEJSDir + '/**/*'], ['views']);
	compileViews();

	var express = require('express');
	var bodyParser = require('body-parser');

	var app = express();
	// parse application/x-www-form-urlencoded
	app.use(bodyParser.urlencoded({
		extended: false,
		limit: '10mb'
	}));
	// parse application/json
	app.use(bodyParser.json({
		limit: '10mb'
	}));


	app.use(function(req, res, next) {
		res.header('Access-Control-Allow-Origin', '*');
		res.header('Access-Control-Allow-Methods', 'POST, GET, OPTIONS, PUT, DELETE');
		next();
	});

	app.get("/", function(req, res) {
		res.redirect('/module/');
	});
	glob(rootDir + "/ui/js/*.js", {
		nodir: true
	}, function(err, files) {
		if (files.length > 0) {
			var entries = {};
			files.map((file) => {
				entries[path.basename(file, ".js")] = [
					file,
					'webpack-hot-middleware/client?reload=false'
				];
			});

			let staticDir = path.join(rootDir, `/ui/static/`);
			let staticDirCopyPlugin = undefined;
			if (fs.existsSync(staticDir)) {
				staticDirCopyPlugin = new CopyWebpackPlugin([{
					from: staticDir
				}]);
			}
			var config = [{
				devtool: 'eval-source-map',
				entry: entries,
				mode: "development",
				output: {
					path: path.join(rootDir, `/dist/`),
					filename: 'js/[name].js',
					publicPath: `/module/static/${staticNumber}/`
				},
				node: {
					fs: "empty"
				},
				resolve: {
					extensions: ['.js', '.jsx'],
					modules: ['node_modules', path.resolve(__dirname, "../node_modules")]
				},
				resolveLoader: {
					modules: ['node_modules', path.resolve(__dirname, "../node_modules")]
				},
				plugins: [
					new webpack.NormalModuleReplacementPlugin(/leoConfigure\.js/, configFile),
					staticDirCopyPlugin,
					new webpack.HotModuleReplacementPlugin()
				].filter(p => !!p),
				module: {
					rules: [{
						test: /\.jsx?$/,
						exclude: /(node_modules|bower_components)/,
						use: {
							loader: 'babel-loader',
							options: {
								babelrc: true,
								cacheDirectory: true,
								presets: [
									[path.resolve(__dirname, "../node_modules/babel-preset-env"), {
										"targets": {
											"node": "8.10"
										}
									}]
								]
							}
						}
					}, {
						test: /\.(less|css)$/,
						exclude: /(node_modules|bower_components)/,
						use: [{
							loader: "style-loader"
						}, {
							loader: "css-loader",
						}, {
							loader: "less-loader"
						}]
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

			var compiler = webpack(config);
			var middleware = webpackMiddleware(compiler, {
				publicPath: config[0].output.publicPath,
				contentBase: 'src',
				stats: {
					colors: true,
					hash: false,
					timings: true,
					chunks: false,
					chunkModules: false,
					modules: false
				},
				watchOptions: {
					poll: webpackPoll
				}
			});

			app.use(middleware);
			app.use(webpackHotMiddleware(compiler));
		}
		var wrap = require("./functionWrap")({
			path: `${rootDirString}/api`
		});


		// Config Setup: Match what build.js is doing on deploy
		let uiConfig = {}
		//Are they using leo-config
		if (fs.existsSync(path.resolve(rootDir, "leo_config.js"))) {
			console.log("Got leo-config.js")
			let builder = require(require.resolve("leo-config", {
				paths: [rootDir]
			}));
			let c = builder.bootstrap(path.resolve(rootDir, "leo_config.js"))._leo_prebuilt_ui;
			if (!Object.keys(c).length) {
				c = require(path.resolve(rootDir, "leo_config.js"))._global;
				c = {
					_global: c.ui || {}
				};
			}
			uiConfig = c;
		} else {
			uiConfig = {};
		}
		var resources = process.env.Resources && JSON.parse(process.env.Resources) || {};
		if (resources.CustomFavicon == '') {
			delete resources.CustomFavicon;
		}
		configure.ui = (uiConfig[process.env.NODE_ENV] || uiConfig._global || {});
		configure.ui.version = staticNumber;
		configure.ui.staticAssets = "static/" + staticNumber + "/";
		configure.ui.uri = configure.ui.staticAssets;
		configure.ui.static = {
			uri: configure.ui.staticAssets
		};
		Object.assign(configure.ui, resources);
		configure.ui.basehref = "/module/";
		// End Config setup

		fs.writeFileSync(configFile, "module.exports = " + JSON.stringify(configure.ui));

		let variables = {};
		flattenVariables(configure.ui, variables, '.', "leo.");

		glob(viewDir + "/**", {
			nodir: true
		}, function(err, files) {
			var lookupcache = {};
			files.forEach(function(file) {
				var original = file;
				var p = path.relative(viewDir, path.dirname(file)).replace(/\\/g, '/');
				if (p) {
					p = "/" + p;
				}
				file = path.basename(file);

				if (file === "index.html" || file === "index") { //also allow this one to run on just /module instead of /module/index
					console.log("get", `/module${p}`, `views${p}/${file}`);
					app.get(`/module${p}`, function(req, res) {
						fs.readFile(`${original}`, 'utf8', function(err, data) {
							data = doReplacements(data, variables, configure.ui);
							var replacements = {};
							if (process.env.CustomFavicon) {
								replacements[`<link rel="icon" href="//cdnleo.s3.amazonaws.com/logos/leo_icon.png" type="image/png" />`] = `<link rel="icon" href="${process.env.CustomFavicon}" type="image/png" />`;
								replacements[`<link rel="shortcut icon" href="//cdnleo.s3.amazonaws.com/logos/leo_icon.png" type="image/png" />`] = `<link rel="shortcut icon" href="${process.env.CustomFavicon}" type="image/png" />`;
							}

							for (var key in replacements) {
								var regex = new RegExp(key, "g");
								data = data.replace(regex, replacements[key]);
							}
							res.send(
								data
							);
						});
					});
				}
				console.log("get", `/module${p}/${file}`, `views${p}/${file}`);
				app.get(`/module${p}/${file}`, function(req, res) {
					fs.readFile(`${original}`, 'utf8', function(err, data) {
						data = doReplacements(data, variables, configure.ui);
						var replacements = {};
						if (process.env.CustomFavicon) {
							replacements[`<link rel="icon" href="//cdnleo.s3.amazonaws.com/logos/leo_icon.png" type="image/png" />`] = `<link rel="icon" href="${process.env.CustomFavicon}" type="image/png" />`;
							replacements[`<link rel="shortcut icon" href="//cdnleo.s3.amazonaws.com/logos/leo_icon.png" type="image/png" />`] = `<link rel="shortcut icon" href="${process.env.CustomFavicon}" type="image/png" />`;
						}

						for (var key in replacements) {
							var regex = new RegExp(key, "g");
							data = data.replace(regex, replacements[key]);
						}
						res.send(
							data
						);
					});
				});
			});
			let origRootDir = rootDir;
			glob(path.resolve(rootDir, "api") + "/**/package.json", function(err, files) {
				files.forEach(function(file) {
					var indexFile = path.dirname(file) + "/index.js";
					if (!fs.existsSync(indexFile) || indexFile.match(/api\/.*node_modules/)) return;
					var buildFile = path.normalize(path.dirname(file) + "/.leobuild.js");
					var opts = {};
					if (webpackPoll) {
						opts = {
							poll: true,
							ignoreWatch: ['**/node_modules/**'],
							delay: 100
						};
					}
					let rootDir = path.dirname(file);
					var config = buildConfig(rootDir);
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

					var b = watchify(browserify({
						standalone: 'lambda',
						bare: true,
						basedir: path.dirname(indexFile),
						entries: [pass],
						browserField: false,
						builtins: false,
						paths: [path.resolve(__dirname, "../node_modules")],
						commondir: false,
						detectGlobals: true,
						bundleExternal: false,
						insertGlobalVars: {
							process: function() {
								return;
							}
						},
						cache: {},
						packageCache: {},
						debug: true
					}), opts);
					b.transform(babelify, {
						presets: [
							[path.resolve(__dirname, "../node_modules/babel-preset-env"), {
								"targets": {
									"node": "8.10"
								}
							}]
						],
						sourceMaps: true
					});

					function bundle() {
						console.log("Bundling file", indexFile);
						console.time(`Done building file ${indexFile}`);

						b.bundle()
							.on('error', (err) => {
								console.log(err);
							})
							.pipe(source('.leobuild.js')).pipe(buffer())
							.pipe(sourcemaps.init({
								loadMaps: true
							}))
							.pipe(sourcemaps.write())
							.pipe(require("vinyl-fs").dest(path.dirname(indexFile)))
							.on("end", () => {
								console.timeEnd(`Done building file ${indexFile}`);
								//Clear all cache, in case the node modules have changed in this project
								if (buildFile in require.cache) {
									delete require.cache[buildFile];
								}
								for (var n in require.cache) {
									if (!n.match(/leo-cli/) || n.match(/leoCliConfigure/)) {
										delete require.cache[n];
									}
								}
							});
					}
					b.on("update", bundle);
					watch([path.resolve(origRootDir, "leo_cli_config.js")], {
						recursive: true,
						filter: f => {
							return !/node_modules/.test(f);
						}
					}, (eventType, filename) => {
						bundle();
					});
					bundle();


					var config = buildConfig(path.dirname(file));
					var p = path.relative(apiDir, path.dirname(file)).replace(/\\/g, '/');
					if (p) {
						p = "/" + p;
					}
					if ((config.type === "resource" || config.type === "apigateway")) {
						if (config.type === "apigateway") {
							console.log(`The config type apigateway is deprecated.Please replace with resource before you deploy `);
						}
						if (!Array.isArray(config.uri)) {
							config.uri = [config.uri];
						}
						for (var i = 0; i < config.uri.length; i++) {
							var parts = config.uri[i].split(/:/);
							var method = parts[0].toLowerCase();

							if (method == "any") {
								method = "all";
							}
							var matches;
							var lastPath;
							if (matches = parts[1].match(/\{([^\{]+)\+\}/g)) {
								lastPath = matches.pop().replace(/\{([^\{]+)\+\}/g, '$1');
								parts[1] = parts[1].replace(/\{([^\{]+)\+\}/g, '*?');
							}
							var uri = parts[1].replace(/\{([^\{]+)\}/g, ':$1');
							console.log(method.toUpperCase(), uri, indexFile);
							app[method](`/module${uri}`, wrap.express(buildFile, {
								role: config.role || (configure.aws && configure.aws.role),
								lastPath: lastPath
							}));
						}
					}
				});

				// static file serving
				var st = express.static(path.normalize(path.resolve(rootDir, "dist/")), {
					maxAge: 31557600000
				});
				app.get('/module/static/:version/:file(*)', function(req, res, next) {
					res.header('Cache-Control', "max-age=315360000");
					res.header('Expires', "Tue, 11 May 2021 03:31:51 GMT");
					//remove the /static/versionnumber
					req.url = req.url.replace(/\/module\/static\/[^\/]*\//, '/');
					st(req, res, next);
				});
				app.listen(configure.test.port, function() {
					console.log(`Running microservice(${configure.name}) on port ${configure.test.port} with version number ${staticNumber}`);
				});

			});
		});
	});
};

function flattenVariables(obj, out, separator, prefix) {
	prefix = prefix || "";
	separator = separator || ":";
	Object.keys(obj).forEach((k) => {
		var v = obj[k];
		if (typeof v === "object" && !(Array.isArray(v)) && v !== null) {
			flattenVariables(v, out, separator, prefix + k.toLowerCase() + separator);
		} else {
			out[prefix + k.toLowerCase()] = v;
		}
	});
}

function doReplacements(data, variables, configure) {
	return data.replace(/\$\{(leo[^{}]*?)\}/g, function(match, variable) {
		variable = variable.toLowerCase();
		if (variable == "leo") {
			return JSON.stringify(configure);
		} else {
			return variables[variable];
		}
	});
}
