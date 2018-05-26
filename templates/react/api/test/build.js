(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g.lambda = f()}})(function(){var define,module,exports;return (function(){function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s}return e})()({1:[function(require,module,exports){
(function (Buffer){
"use strict";

process.resources = process.env.Resources && JSON.parse(process.env.Resources) || {};
var config = require("leo-sdk/leoConfigure");
var leosdk = require("leo-sdk");
const refUtil = require("leo-sdk/lib/reference.js");

var async = require("async");
process.env.TZ = config.timezone;
require('source-map-support').install({
	environment: 'node',
	handleUncaughtExceptions: false
});

const handler = "handler";
const pkg = require("C:\\Steve\\businesses\\leo\\leo-cli\\templates\\react\\api\\test\\package.json");
const botId = pkg.name;
const settings = pkg.config && pkg.config.leo && pkg.config.leo.cron && pkg.config.leo.cron.settings || {};

function empty(obj) {
	for (let k in obj) {
		delete obj[k];
	}
}

var getUser = function (event, context, callback) {
	callback();
};

let botHandler = async function (event, context, callback) {
	try {
		await require("C:\\Steve\\businesses\\leo\\leo-cli\\templates\\react\\api\\test\\index.js")[handler](event, context, callback);
	} catch (err) {
		callback(err);
	}
};

module.exports = {
	handler: function (event, context, callback) {
		context.resources = process.resources;
		context.botId = botId;
		context.getCheckpoint = function (queue, defaultIfNull, callback) {
			queue = refUtil.ref(queue);
			let c = event.start || event.__cron && event.__cron.checkpoints && event.__cron.checkpoints.read && (event.__cron.checkpoints.read[queue] && event.__cron.checkpoints.read[queue].checkpoint || event.__cron.checkpoints.read[queue.id] && event.__cron.checkpoints.read[queue.id].checkpoint) || defaultIfNull;
			if (callback) callback(null, c);
			return c;
		};
		context.settings = settings;

		//clear out the registry
		empty(config.registry);
		leosdk.configuration.registry = config.registry;
		config.registry.user = null;

		for (let x of process.listeners('uncaughtException')) {
			//remove lambdas default listener
			process.removeListener('uncaughtException', x);
		}
		process.on('uncaughtException', function (err) {
			console.error(new Date().toUTCString() + ' uncaughtException:', err.message);
			console.error(err.stack);
			callback(null, {
				statusCode: 500,
				'Content-Type': 'application/json',
				body: JSON.stringify("Application Error")
			});
		});

		event.requestContext.identity.SourceIp = event.requestContext.identity['source-ip'] = event.requestContext.identity.sourceIp;
		config.registry.context = context;
		if (!config.registry.id) {
			//If they didn't specify it in their config, then let's get it from the function name
			config.registry.id = process.env.AWS_LAMBDA_FUNCTION_NAME;
		}

		if (event.requestContext) {
			//new lambda proxy method
			if (event.isBase64Encoded) {
				event.body = JSON.parse(new Buffer(event.body, 'base64'));
			} else if (event.body && typeof event.body !== "object") {
				event.body = JSON.parse(event.body);
			}
			event.params = {
				path: event.pathParameters || {},
				querystring: event.queryStringParameters || {}
			};
			Object.keys(event.params.path).map(key => {
				event.params.path[key] = decodeURIComponent(event.params.path[key]);
			});
		}

		getUser(event, context, err => {
			botHandler(event, context, function (err, data) {
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

}).call(this,require("buffer").Buffer)

},{"C:\\Steve\\businesses\\leo\\leo-cli\\templates\\react\\api\\test\\index.js":2,"C:\\Steve\\businesses\\leo\\leo-cli\\templates\\react\\api\\test\\package.json":3,"async":undefined,"buffer":undefined,"leo-sdk":undefined,"leo-sdk/leoConfigure":undefined,"leo-sdk/lib/reference.js":undefined,"source-map-support":undefined}],2:[function(require,module,exports){
"use strict";

var request = require("leo-auth");

exports.handler = async function (event, context, callback) {
	let user = await request.authorize(event, {
		lrn: 'lrn:leo:botmon:::cron',
		action: "listCron"
	});
	///OR ALTERNATIVELY
	// console.log("------- Alternative method---------");

	// user = await request.getUser(event.requestContext);
	// //do stuff
	// await user.authorize(event, {
	// 	lrn: 'lrn:leo:botmon:::cron',
	// 	action: "listCron"
	// });

	// console.log(user);

	callback(null, "I changed this b");
};

},{"leo-auth":undefined}],3:[function(require,module,exports){
module.exports={
	"name": "____DIRNAME____-test",
	"version": "1.0.0",
	"description": "This is a sample ApiGateway Description",
	"main": "index.js",
	"directories": {
		"test": "test"
	},
	"scripts": {
		"test": "leo test . "
	},
	"config": {
		"leo": {
			"type": "resource",
			"uri": "GET:/api/test",
			"name": "test",
			"handler": "handler",
			"role": null,
			"memory": 128,
			"timeout": 3
		}
	},
	"keywords": [],
	"author": "",
	"license": "ISC"
}

},{}]},{},[1])(1)
});

