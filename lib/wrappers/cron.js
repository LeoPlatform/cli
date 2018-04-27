"use strict";

process.resources = process.env.Resources && JSON.parse(process.env.Resources) || {};
var config = require("leo-sdk/leoConfigure");
var async = require("async");
var leosdk = require("leo-sdk");
var kms = require("leo-sdk/lib/kms")(leosdk.configuration);
const refUtil = require("leo-sdk/lib/reference.js");


process.__config = config;
var fill = require("leo-sdk/lib/build-config").fillWithTableReferences;
process.env.TZ = config.timezone;
require('source-map-support').install({
	environment: 'node',
	handleUncaughtExceptions: false
});

const handler = "____HANDLER____";
const pkg = require("____PACKAGEJSON____");
const botId = pkg.name;
const settings = pkg.config && pkg.config.leo && pkg.config.leo.cron && pkg.config.leo.cron.settings || {};


var moment = require("moment");
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

var cron = leosdk.bot;
var dynamodb = leosdk.aws.dynamodb;

for (let x of process.listeners('uncaughtException')) { //remove lambdas default listener
	process.removeListener('uncaughtException', x);
}
var theCallback;
var theContext;
var __theEvent;
var __startTime = moment.now();
process.on('uncaughtException', function(err) {
	console.log(err);
	console.log(`[LEOCRON]:end:${config.name}:${theContext.awsRequestId}`);
	if (__theEvent.__cron) {
		cron.reportComplete(__theEvent.__cron, theContext.awsRequestId, "error", {
			msg: err.message,
			stack: err.stack
		}, {}, function() {
			console.log("Cron Lock removed");
		});
	} else {
		cron.removeLock(config.name, theContext.awsRequestId, function() {
			console.log("Lock removed");
		});
	}
	console.error((new Date).toUTCString() + ' uncaughtException:', err.message);
	console.error(err.stack);
	theCallback(null, "Application Error");
});

function empty(obj) {
	for (let k in obj) {
		delete obj[k];
	}
}

module.exports = {
	handler: function(event, context, callback) {
		let debug = process.env.debug === "true";
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
		leosdk.configuration.registry = config.registry;
		config.registry.context = context;
		config.registry.__cron = event.__cron;
		global.cron_run_again = false;
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
			cron.checkLock(event.__cron, context.awsRequestId, context.getRemainingTimeInMillis(), function(err, data) {
				if (err) {
					console.log("LOCK EXISTS, cannot run");
					callback(null, "already running");
				} else {
					try {
						console.log("[LEOCRON]:start:" + cronkey);
						fill(event || {}, config, dynamodb.docClient).then(filledEvent => {
							botHandler(filledEvent, context, function(err, data) {
								console.log("[LEOCRON]:complete:" + cronkey);
								cron.reportComplete(event.__cron, context.awsRequestId, err ? "error" : "complete", err ? err : '', {}, function(err2, data2) {
									if (err || err2) {
										console.log(err || err2);
									}
									callback(null, err || data);
								});
							});
						}).catch(err => {
							cron.reportComplete(event.__cron, context.awsRequestId, "error", err, {}, function() {
								callback(null, err);
							});
						});
					} catch (e) {
						console.log("error", e);
						cron.reportComplete(event.__cron, context.awsRequestId, "error", {
							msg: e.message,
							stack: e.stack
						}, {}, function() {
							callback(null, e);
						});
					}

				}

			});
		} else {
			debug && console.log("Locking Settings");

			cron.createLock(config.name, context.awsRequestId, context.getRemainingTimeInMillis() + 100, function(err, data) {
				if (err) {
					console.log("LOCK EXISTS, cannot run");
					callback(null, "already running");
				} else {
					try {
						debug && console.log("running");
						fill(event || {}, config, dynamodb.docClient).then(filledEvent => {
							botHandler(filledEvent, context, function(err, data) {
								debug && console.log("removing lock", config.name, context.awsRequestId);
								cron.removeLock(config.name, context.awsRequestId, function(err2, data2) {
									if (err || err2) {
										console.log(err || err2);
									}
									callback(null, err || data);
								});
							});
						}).catch(err => {
							debug && console.log("error");
							cron.removeLock(config.name, context.awsRequestId, function() {
								callback(null, err);
							}, "error");
						});
					} catch (e) {
						debug && console.log("error");
						cron.removeLock(config.name, context.awsRequestId, function() {
							callback(null, e);
						});
					}

				}
			});
		}
	}
};