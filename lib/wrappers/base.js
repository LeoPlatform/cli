"use strict";

process.resources = process.env.Resources && JSON.parse(process.env.Resources) || {};
var config = require("leo-sdk/leoConfigure");
process.env.TZ = config.timezone;
const refUtil = require("leo-sdk/lib/reference.js");

var leosdk = require("leo-sdk");
var kms = require("leo-sdk/lib/kms")(leosdk.configuration);
var async = require("async");
require('source-map-support').install({
	environment: 'node',
	handleUncaughtExceptions: false
});

const handler = "____HANDLER____";
const pkg = require("____PACKAGEJSON____");
const botId = pkg.name;
const settings = pkg.config && pkg.config.leo && pkg.config.leo.cron && pkg.config.leo.cron.settings || {};


let decrypted = false;
let botHandler = function(event, context, callback) {
	let tasks = [];
	Object.keys(process.env).forEach(function(key) {
		if (!decrypted && process.env[key] != undefined && (key.toLowerCase().indexOf('kms') !== -1 || process.env[key].match(/^KMS:/)) && !key.match(/^npm_/)) {
			tasks.push(function(done) {
				kms.decryptString(process.env[key].replace(/^KMS:/, ""), function(err, value) {
					if (err) {
						return done(err);
					}
					process.env[key] = value;
					done();
				});
			});
		}
	});

	async.parallelLimit(tasks, 20, function(err, results) {
		if (err) {
			return callback(err);
		}
		decrypted = true;
		require("____FILE____")[handler](event, context, callback);
	});
};


function empty(obj) {
	for (let k in obj) {
		delete obj[k];
	}
}

module.exports = {
	handler: function(event, context, callback) {
		context.callbackWaitsForEmptyEventLoop = false;
		context.resources = process.resources;
		context.botId = botId;
		context.getCheckpoint = function(queue, defaultIfNull, callback) {
			queue = refUtil.ref(queue);
			let c = event.start || (
				event.__cron &&
				event.__cron.checkpoints &&
				event.__cron.checkpoints.read &&
				(
					(event.__cron.checkpoints.read[queue] && event.__cron.checkpoints.read[queue].checkpoint) ||
					(event.__cron.checkpoints.read[queue.id] && event.__cron.checkpoints.read[queue.id].checkpoint))
			) || defaultIfNull;
			if (callback) callback(null, c);
			return c;
		};
		context.settings = settings;

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
		//clear out the registry
		empty(config.registry);
		leosdk.configuration.registry = config.registry;
		config.registry.context = context;
		if (!config.registry.id) { //If they didn't specify it in their config, then let's get it from the function name
			config.registry.id = process.env.AWS_LAMBDA_FUNCTION_NAME;
		}

		botHandler(event, context, callback);
	}
};