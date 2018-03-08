"use strict";

process.resources = process.env.Resources && JSON.parse(process.env.Resources) || {};
var config = require("leo-sdk/leoConfigure");
process.env.TZ = config.timezone;
require('source-map-support').install({
	environment: 'node',
	handleUncaughtExceptions: false
});

const path = require("path");
const filePath = "____FILE____";
const handler = "____HANDLER____";
const pkg = require(path.resolve(path.dirname(filePath), "package.json"));
const botId = pkg.name;
const settings = pkg.config && pkg.config.leo && pkg.config.leo.cron && pkg.config.leo.cron.settings || {};


function empty(obj) {
	for (let k in obj) {
		delete obj[k];
	}
}

var getUser = function(event, context, callback) {
	callback();
};

module.exports = {
	handler: function(event, context, callback) {
		context.resources = process.resources;
		context.botId = botId;
		context.settings = settings;

		//clear out the registry
		empty(config.registry);
		config.registry.user = null;

		for (let x of process.listeners('uncaughtException')) { //remove lambdas default listener
			process.removeListener('uncaughtException', x);
		}
		process.on('uncaughtException', function(err) {
			console.error((new Date).toUTCString() + ' uncaughtException:', err.message);
			console.error(err.stack);
			callback(null, {
				statusCode: 500,
				'Content-Type': 'application/json',
				body: JSON.stringify("Application Error")
			});
		});

		event.requestContext.identity.SourceIp = event.requestContext.identity['source-ip'] = event.requestContext.identity.sourceIp;
		config.registry.context = context;
		if (!config.registry.id) { //If they didn't specify it in their config, then let's get it from the function name
			config.registry.id = process.env.AWS_LAMBDA_FUNCTION_NAME;
		}

		if (event.requestContext) { //new lambda proxy method
			if (event.isBase64Encoded) {
				event.body = JSON.parse(new Buffer(event.body, 'base64'));
			} else if (event.body && typeof event.body !== "object") {
				event.body = JSON.parse(event.body);
			}
			event.params = {
				path: event.pathParameters || {},
				querystring: event.queryStringParameters || {}
			};
			Object.keys(event.params.path).map((key) => {
				event.params.path[key] = decodeURIComponent(event.params.path[key]);
			});
		}

		getUser(event, context, (err) => {
			require(filePath)[handler](event, context, function(err, data) {
				if (data && typeof data === "object" && "statusCode" in data) {
					if (config.cors && !("Access-Control-Allow-Origin" in data.headers)) {
						data.headers["Access-Control-Allow-Origin"] = config.cors;
					}
					callback(null, data);
				} else if (err === "Access Denied") {
					callback(null, {
						statusCode: 403,
						headers: {
							'Content-Type': config.ErrorContentType || 'text/html',
							"Access-Control-Allow-Origin": config.cors ? config.cors : undefined
						},
						body: err.toString()
					});
				} else if (err) {
					callback(null, {
						statusCode: 500,
						headers: {
							'Content-Type': config.ErrorContentType || 'text/html',
							"Access-Control-Allow-Origin": config.cors ? config.cors : undefined
						},
						body: err.toString()
					});
				} else {
					callback(null, {
						statusCode: 200,
						headers: {
							'Content-Type': config.ContentType || 'application/json',
							"Access-Control-Allow-Origin": config.cors ? config.cors : undefined
						},
						body: JSON.stringify(data)
					});
				}
			});
		});
	}
};