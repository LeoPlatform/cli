"use strict";

process.resources = process.env.Resources && JSON.parse(process.env.Resources) || {};
var handler = "____HANDLER____";
var async = require("async");
var leosdk = require("leo-sdk");
var kms = require("leo-sdk/lib/kms")(leosdk.configuration);

let decrypted = false;
let botHandler = function(event, context, callback) {
	let tasks = [];
	Object.keys(process.env).filter(e => !e.match(/^npm/)).forEach(function(key) {
		if (!decrypted && key.toLowerCase().indexOf('kms') !== -1) {
			tasks.push(function(done) {
				kms.decryptString(process.env[key], function(err, value) {
					if (err) {
						return done(err);
					}
					console.log(key, value);
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

module.exports = {
	handler: function(event, context, callback) {
		context.resources = process.resources;
		return botHandler(event, context, callback);
	}
};