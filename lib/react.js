var buildConfig = require("./build-config").build;
process.env.TZ = buildConfig(process.cwd(), {
	configOnly: true
}).timezone;

var staticNumber = Date.now();

var path = require('path');
var glob = require("glob");
var express = require('express');
var webpack = require('webpack');
var webpackMiddleware = require('webpack-dev-middleware');
var webpackHotMiddleware = require('webpack-hot-middleware');
var fs = require("fs");
var HtmlWebpackPlugin = require('html-webpack-plugin');
var ExtractTextPlugin = require("extract-text-webpack-plugin");
var CopyWebpackPlugin = require('copy-webpack-plugin');

var gulp = require("gulp");
var browserify = require('browserify');
var babelify = require('babelify');
var watchify = require('watchify');
var uglify = require('gulp-uglify');
var source = require('vinyl-source-stream');
var buffer = require('vinyl-buffer');
var gutil = require('gulp-util');
var rename = require('gulp-rename');
var sourcemaps = require('gulp-sourcemaps');
var concat = require('gulp-concat');
var replace = require('gulp-replace');
var ejs = require("gulp-ejs");

var chokidar = require("chokidar");

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
	configure.static = Object.assign({

	}, configure.static || {});
	configure.test = Object.assign({
		port: 80
	}, configure.test || {});
	configure.micro = Object.assign({
		version: 1231
	}, configure.micro || {});
	configure.ui.static.uri = "static/" + staticNumber + "/";
	var configFile = path.normalize(path.resolve(distDir, "leoConfigure.js"));
	configure.ui.type = "ui";
	fs.writeFileSync(configFile, "module.exports = " + JSON.stringify(configure.ui));

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
		var entries = {};
		files.map((file) => {
			entries[path.basename(file, ".js")] = [
				file,
				'webpack-hot-middleware/client?reload=false'
			];
		});
		console.log(entries);
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
				modules: ['node_modules', path.resolve(__dirname, "../node_modules")]
			},
			resolveLoader: {
				modules: ['node_modules', path.resolve(__dirname, "../node_modules")]
			},
			plugins: [
				new webpack.NormalModuleReplacementPlugin(/leoConfigure\.js/, configFile),
				new CopyWebpackPlugin([{
					from: path.join(rootDir, `/ui/static/`)
				}]),
				new webpack.HotModuleReplacementPlugin()
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
		var wrap = require("./functionWrap")({
			path: `${rootDirString}/api`
		});

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
				configure.static.uri = "static/" + staticNumber + "/";
				configure.custom_css = process.env.CustomCSS || "";
				configure.custom_js = process.env.CustomJS || "";
				configure.baseHref = "/module/";
                let r = process.env.Resources && JSON.parse(process.env.Resources) || {};
                configure.aws = Object.assign({}, configure.aws, {cognito_id:r.CognitoId, region:r.Region, cognito_region: r.CognitoRegion || r.Region});
                configure.ENV = {
                    Resources: r
                };
				if (file === "index.html" || file === "index") {
					console.log("get", `/module${p}`, `views${p}/${file}`);
					app.get(`/module${p}`, function(req, res) {
						fs.readFile(`${original}`, 'utf8', function(err, data) {
							data = doReplacements(data, configure, lookupcache);
							data.replace(/__STATIC_URI__\/?/g, `static/${staticNumber}/`)
								.replace(/__COGNITO_ID__\/?/g, configure.aws.cognito_id)
								.replace(/__CLOUD_FRONT_URI__\/?/g, configure.static.cloudfront)
								.replace(/__BASE_HREF__/g, "/module/")
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
						data = doReplacements(data, configure, lookupcache);
						data.replace(/__STATIC_URI__\/?/g, `static/${staticNumber}/`)
							.replace(/__COGNITO_ID__\/?/g, configure.aws.cognito_id)
							.replace(/__CLOUD_FRONT_URI__\/?/g, configure.static.cloudfront)
							.replace(/__BASE_HREF__/g, "/module/")
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
			glob(path.resolve(rootDir, "api") + "/**/package.json", function(err, files) {
				files.forEach(function(file) {
					var indexFile = path.dirname(file) + "/index.js";
					if (!fs.existsSync(indexFile)) return;
					var buildFile = path.normalize(path.dirname(file) + "/build.js");
					var opts = {};
					if (webpackPoll) {
						opts = {
							poll: true,
							ignoreWatch: ['**/node_modules/**'],
							delay: 100
						};
					}
					var b = watchify(browserify({
						standalone: 'lambda',
						bare: true,
						entries: [indexFile],
						browserField: false,
						builtins: false,
						commondir: false,
						detectGlobals: true,
						bundleExternal: false,
						insertGlobalVars: false,
						cache: {},
						packageCache: {},
						debug: true
					}), opts);
					b.transform(babelify, {
						sourceMaps: true
					});

					function bundle() {
						console.log("Bundling file", indexFile);
						b.bundle()
							.pipe(source('build.js')).pipe(buffer())
							.pipe(sourcemaps.init({
								loadMaps: true
							}))
							.pipe(uglify())
							.pipe(sourcemaps.write({
								includeContent: false,
								sourceRoot: path.normalize(rootDir)
							}))
							.pipe(gulp.dest(path.dirname(indexFile)))
							.on('error', (err) => {
								console.log(err);
							})
							.on("end", () => {
								console.log("Done building file", indexFile);
								if (buildFile in require.cache) {
									delete require.cache[buildFile];
								}
							});
					}
					b.on("update", bundle);
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
					console.log(`Running microservice(${config.name}) on port ${configure.test.port} with version number ${staticNumber}`);
				});

			});
		});
	});
};

function doReplacements(data, configure, lookupcache) {
	lookupcache = lookupcache || {};
	var groups = getRegexGroups(data, "\\${leo\.(.*?)}", "g");
	for (var g in groups) {
		var group = groups[g];
		var v = lookupcache[group[1]];
		if (!v) {
			v = unpath(group[1], configure);
			lookupcache[group[1]] = v;
			console.log(`Getting config value config.leo.${group[1]} = ${v}`);
		}
		data = data.replace(group[0], v);
	}
	return data;
}

function unpath(path, obj) {
	return path.split('.').reduce((o, i) => o[i], obj);
}

function getRegexGroups(text, regex, flags) {
	var e = [],
		f = null,
		g = null,
		h = null;
	var a = new RegExp(regex, flags);
	var c = text;
	for (; !f && (g = a.exec(c));) {
		if (a.global && h === a.lastIndex) {
			f = "infinite";
			break;
		}
		if (g.end = (h = g.index + g[0].length) - 1, g.input = null, e.push(g), !a.global)
			break;
	}
	return e;
}