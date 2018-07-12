'use strict';
var AWS = require("aws-sdk");
var configure = require("leo-sdk/leoConfigure.js");
var moment = require("moment");

let path = require("path");
let fs = require("fs");

function createContext() {
	var start = new Date();
	var maxTime = 10000;

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

module.exports = function( /*options*/ ) {
	let testProcess;
	let testProcessJs;
	if (configure && configure._meta && configure._meta.microserviceDir) {
		testProcess = path.resolve(configure && configure._meta && configure._meta.microserviceDir, "test/process.json");
		testProcessJs = path.resolve(configure && configure._meta && configure._meta.microserviceDir, "test/process.json");
	}
	let processConfig = {};
	try {
		if (fs.existsSync(testProcess)) {
			processConfig = require(testProcess) || {};
		} else if (fs.existsSync(testProcessJs)) {
			processConfig = require(testProcessJs) || {};
		}
	} catch (e) {
		processConfig = {};
	}
	let envVars = Object.assign({}, processConfig.env);

	Object.keys(envVars).map(k => {
		let v = envVars[k];
		if (typeof v !== "string") {
			v = JSON.stringify(v);
		}
		process.env[k] = v;
	});

	function getApi(name, opts) {
		if (opts.role && (!AWS.config.credentials.params || AWS.config.credentials.params.RoleArn != opts.role)) {
			console.log("setting role to ", opts.role);
			// AWS.config.credentials = new AWS.TemporaryCredentials({
			// 	RoleArn: opts.role
			// });
			// AWS.config.credentials.get(function (err, data) {
			// 	if (err) {
			// 		console.log("Cannot assume role", err);
			// 		process.exit();
			// 	}
			// });
			//Always want it to reload everything it needs when we change credentials
			// for (var n in require.cache) {
			// 	if (
			// 		(n.match(/leo.core/) && !n.match(/leo.core.node_modules/)) ||
			// 		(n.match(/leo-sdk.core/) && !n.match(/leo-sdk.core.node_modules/)) ||
			// 		!n.match(/node_modules/)
			// 	) {
			// 		delete require.cache[n];
			// 	}
			// }
			// leoTest.mock.authorize(configure.test.request.policies);
			//file = require(name);
		} else {
			//file = require(name);
		}

		return {
			handler: function(event, context, callback) {
				configure.registry.context = createContext();
				require(name).handler(event, context, function(err, data) {
					// leolog.finalize(true, err ? false : true);
					callback(err, data);
				});
			}
		};
	}
	return {
		express: function(name, opts) {
			return function(req, res) {
				const testConfig = require("../leoCliConfigure.js")(process.env.NODE_ENV);
				res.header('Content-Type', 'application/json');
				var url = req.url;
				if (opts.lastPath) {
					var val = req.params[opts.lastPath] = req.params['0'];
					delete req.params['0'];

					url = url.replace(new RegExp(`/${val}$`), "/{" + opts.lastPath + "+}");
				}

				for (var param in req.params) {
					val = encodeURIComponent(req.params[param]);
					url = url.replace(new RegExp(`/${val}(/|$)`), "/{" + param + "}/");
				}


				var user = {};
				if (testConfig.test && testConfig.test.personas) {
					user = testConfig.test.personas[testConfig.test.defaultPersona || 'default'];
				}
				var event = {
					"body": req.body,
					headers: req.headers,
					"httpMethod": req.method,
					pathParameters: req.params,
					queryStringParameters: req.query,
					"stage-variables": {},
					"requestContext": Object.assign({
						"accountId": "",
						"resourceId": "",
						"stage": "DEV",
						"request-id": "",
						identity: {
							"cognitoIdentityPoolId": null,
							"accountId": null,
							"cognitoIdentityId": null,
							"caller": null,
							"apiKey": null,
							"sourceIp": "127.0.0.1",
							"cognitoAuthenticationType": null,
							"cognitoAuthenticationProvider": null,
							"userArn": null,
							"userAgent": "PostmanRuntime/2.4.5",
							"user": null
						},
						"resourcePath": url,
						"httpMethod": req.method,
						"apiId": ""
					}, user)
				};
				var context = createContext();
				configure.registry.context = createContext();
				var callback = function(err, result) {
					if (err) {
						if (!res.finished) {
							if (err.match && err.match(/Access Denied/)) {
								res.status(403);
							} else {
								res.status(500);
							}
							res.send(err);
						}
					} else if (!res.finished) {
						if (result.statusCode) {
							res.status(result.statusCode);
							res.set(result.headers);
							if (result.isBase64Encoded) {
								res.send(new Buffer(result.body, 'base64'));
							} else {
								res.send(result.body);
							}
						} else {
							res.send(JSON.stringify(result));
						}
					}
				};
				return getApi(name, opts).handler(event, context, callback);
			};
		}
	};
};

function stripBOM(content) {
	// Remove byte order marker. This catches EF BB BF (the UTF-8 BOM)
	// because the buffer-to-string conversion in `fs.readFileSync()`
	// translates it to FEFF, the UTF-16 BOM.
	if (content.charCodeAt(0) === 0xFEFF) {
		content = content.slice(1);
	}
	return content;
}
