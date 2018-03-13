'use strict';
var AWS = require("aws-sdk");
var configure = require("leo-sdk/leoConfigure.js");
var moment = require("moment");

let request = require("leo-auth/lib/request");

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
	function getApi(name, opts) {
		let file;
		if (opts.role && (!AWS.config.credentials.params || AWS.config.credentials.params.RoleArn != opts.role)) {
			// console.log("setting role to ", opts.role);
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
			file = require(name);
		} else {
			file = require(name);
		}
		return {
			handler: function(event, context, callback) {
				configure.registry.context = createContext();
				file.handler(event, context, function(err, data) {
					// leolog.finalize(true, err ? false : true);
					callback(err, data);
				});
			}
		};
	}
	return {
		express: function(name, opts) {
			return function(req, res) {
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
				if (configure.test.user) {
					user = configure.test.users[configure.test.user];
					delete user.auth;
				} else {
					user = configure.test.users.default;
				}

				var event = {
					"body": req.body,
					headers: req.headers,
					"params": {
						"path": req.params,
						"querystring": req.query
					},
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
						"httpMethod": "GET",
						"apiId": ""
					}, user)
				};

				var context = createContext();
				event.requestContext.identity.sourceIp = event.requestContext.sourceIp || event.requestContext['source-ip'] || event.requestContext.SourceIp || event.requestContext.identity['source-ip'] || event.requestContext.identity.SourceIp || event.requestContext.identity.sourceIp;
				event.requestContext.identity['source-ip'] = event.requestContext.identity.SourceIp = event.requestContext.identity.sourceIp;
				configure.registry.context = createContext();
				var callback = function(err, result) {
					if (err) {
						res.status(500);
						if (err.match && err.match(/Access Denied/)) {
							res.status(403);
						} else {
							res.status(500);
						}
						res.send(err);
					} else {
						res.send(JSON.stringify(result));
					}
				};

				console.log(opts, name);
				if (configure.auth.loadUser) {
					return request.getUser(event.requestContext, (err, user) => {
						context.leouser = user;
						return getApi(name, opts).handler(event, context, callback);
					});
				} else {
					return getApi(name, opts).handler(event, context, callback);
				}
			};
		}
	};
};
