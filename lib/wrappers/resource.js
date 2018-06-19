"use strict";
require('source-map-support').install({
	environment: 'node',
	handleUncaughtExceptions: false
});


const handler = "____HANDLER____";
const pkg = require("____PACKAGEJSON____");
const botId = pkg.name;



let config = {};
if (pkg.config && pkg.config.leo) {
	config = pkg.config.leo;
}

function empty(obj) {
	for (let k in obj) {
		delete obj[k];
	}
}

var getUser = function(event, context, callback) {
	callback();
};

let botHandler = async function(event, context, callback) {
	try {
		await require("____FILE____")[handler](event, context, callback);
	} catch (err) {
		callback(err);
	}
};


module.exports = {
	handler: function(event, context, callback) {
		context.callbackWaitsForEmptyEventLoop = false;
		context.botId = botId;
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
		if (event.requestContext) { //new lambda proxy method
			if (event.isBase64Encoded) {
				event.body = new Buffer(event.body, 'base64');
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
			botHandler(event, context, function(err, data) {
				if (data && typeof data === "object" && "statusCode" in data) {
					if (config.cors && !("Access-Control-Allow-Origin" in data.headers)) {
						data.headers["Access-Control-Allow-Origin"] = config.cors;
					}
					callback(null, data);
				} else if (err === "Access Denied" || err === "Error: Access Denied") {
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