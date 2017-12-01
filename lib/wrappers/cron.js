"use strict";

process.resources = process.env.Resources && JSON.parse(process.env.Resources) || {};
var config = require("leo-sdk/leoConfigure");
process.__config = config;
var fill = require("leo-sdk/lib/build-config").fillWithTableReferences;
process.env.TZ = config.timezone;
require('source-map-support').install({
	environment: 'node',
	handleUncaughtExceptions: false
});

var moment = require("moment");
var file = require("____FILE____");
var handler = "____HANDLER____";

var leosdk = require("leo-sdk");
var cron = leosdk.bot;
var dynamodb = leosdk.aws.dynamodb;

for (let x of process.listeners('uncaughtException')) { //remove lambdas default listener
	process.removeListener('uncaughtException', x);
}
var theCallback;
var theContext;
var __theEvent;
var __startTime = moment.now();
process.on('uncaughtException', function (err) {
	console.log(err);
	console.log(`[LEOCRON]:end:${config.name}:${theContext.awsRequestId}`);
	if (__theEvent.__cron) {
		cron.reportComplete(__theEvent.__cron, theContext.awsRequestId, "error", {
			msg: err.message,
			stack: err.stack
		}, {}, function () {
			console.log("Cron Lock removed");
		});
	} else {
		cron.removeLock(config.name, theContext.awsRequestId, function () {
			console.log("Lock removed");
		});
	}
	console.error((new Date).toUTCString() + ' uncaughtException:', err.message);
	console.error(err.stack);
	theCallback("Application Error");
});

function empty(obj) {
	for (let k in obj) {
		delete obj[k];
	}
}

module.exports = {
	handler: function (event, context, callback) {
		let debug = process.env.debug === "true";
		context.resources = process.resources;
		if (event.requestContext) { //new lambda proxy method
			if (event.isBase64Encoded) {
				event.body = JSON.parse(new Buffer(event.body, 'base64'));
			} else {
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

		theCallback = callback;
		//clear out the registry
		empty(config.registry);
		config.registry.context = context;
		config.registry.__cron = event.__cron;
		config.registry.cron_run_again = false;
		if (event.__cron && event.__cron.id) { //If it is in cron, use that regardless
			config.registry.id = event.__cron.id;
		} else if (!config.registry.id) { //If they didn't specify it in their config, then let's get it from the function name
			config.registry.id = process.env.AWS_LAMBDA_FUNCTION_NAME;
		}
		debug && console.log("Registry", JSON.stringify(config.registry, null, 2));
		theContext = context;
		__theEvent = event;
		if (event.__cron) {
			var cronkey = event.__cron.id + ":" + event.__cron.iid + ":" + event.__cron.ts + ":" + context.awsRequestId;
			console.log("[LEOCRON]:check:" + cronkey);
			debug && console.log("Locking on  __cron", event.__cron);
			var startTime = moment.now();
			cron.checkLock(event.__cron, context.awsRequestId, context.getRemainingTimeInMillis(), function (err, data) {
				if (err) {
					console.log("LOCK EXISTS, cannot run");
					callback(null, "already running");
				} else {
					try {
						console.log("[LEOCRON]:start:" + cronkey);
						fill(event || {}, config, dynamodb.docClient).then(filledEvent => {
							file[handler](filledEvent, context, function (err, data) {
								console.log("[LEOCRON]:complete:" + cronkey);
								cron.reportComplete(event.__cron, context.awsRequestId, err ? "error" : "complete", err ? err : '', {}, function (err2, data2) {
									if (err || err2) {
										console.log(err || err2);
									}
									callback(err, data);
								});
							});
						}).catch(err => {
							cron.reportComplete(event.__cron, context.awsRequestId, "error", err, {}, function () {
								callback(err);
							});
						});
					} catch (e) {
						console.log("error", e);
						cron.reportComplete(event.__cron, context.awsRequestId, "error", {
							msg: e.message,
							stack: e.stack
						}, {}, function () {
							callback(e);
						});
					}

				}

			});
		} else {
			debug && console.log("Locking Settings");

			cron.createLock(config.name, context.awsRequestId, context.getRemainingTimeInMillis() + 100, function (err, data) {
				if (err) {
					console.log("LOCK EXISTS, cannot run");
					callback(null, "already running");
				} else {
					try {
						debug && console.log("running");
						fill(event || {}, config, dynamodb.docClient).then(filledEvent => {
							file[handler](filledEvent, context, function (err, data) {
								debug && console.log("removing lock", config.name, context.awsRequestId);
								cron.removeLock(config.name, context.awsRequestId, function (err2, data2) {
									if (err || err2) {
										console.log(err || err2);
									}
									callback(err, data);
								});
							});
						}).catch(err => {
							debug && console.log("error");
							cron.removeLock(config.name, context.awsRequestId, function () {
								callback(err);
							}, "error");
						});
					} catch (e) {
						debug && console.log("error");
						cron.removeLock(config.name, context.awsRequestId, function () {
							callback(e);
						});
					}

				}
			});
		}
	}
};