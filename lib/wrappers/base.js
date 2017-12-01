"use strict";

process.resources = process.env.Resources && JSON.parse(process.env.Resources) || {};
var config = require("leo-sdk/leoConfigure");
process.env.TZ = config.timezone;
require('source-map-support').install({
	environment: 'node',
	handleUncaughtExceptions: false
});

var file = require("____FILE____");
var handler = "____HANDLER____";

function empty(obj) {
	for (let k in obj) {
		delete obj[k];
	}
}

module.exports = {
	handler: function (event, context, callback) {
		context.resources = process.resources;
		for (let x of process.listeners('uncaughtException')) { //remove lambdas default listener
			process.removeListener('uncaughtException', x);
		}
		process.on('uncaughtException', function (err) {
			console.error((new Date).toUTCString() + ' uncaughtException:', err.message);
			console.error(err.stack);
			callback(null, {
				statusCode: 500,
				'Content-Type': 'application/json',
				body: JSON.stringify("Application Error")
			});
		});
		//clear out the registry
		empty(config.registry);
		config.registry.context = context;
		if (!config.registry.id) { //If they didn't specify it in their config, then let's get it from the function name
			config.registry.id = process.env.AWS_LAMBDA_FUNCTION_NAME;
		}

		file[handler](event, context, callback);
	}
};