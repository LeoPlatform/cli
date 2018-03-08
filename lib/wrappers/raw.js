"use strict";

process.resources = process.env.Resources && JSON.parse(process.env.Resources) || {};
var async = require("async");
var leosdk = require("leo-sdk");
var kms = require("leo-sdk/lib/kms")(leosdk.configuration);

const path = require("path");
const filePath = "____FILE____";
const handler = "____HANDLER____";
const pkg = require(path.resolve(path.dirname(filePath), "package.json"));
const botId = pkg.name;
const settings = pkg.config && pkg.config.leo && pkg.config.leo.cron && pkg.config.leo.cron.settings || {};



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
		require(filePath)[handler](event, context, callback);
	});
};

module.exports = {
	handler: function(event, context, callback) {
		context.resources = process.resources;
		context.botId = botId;
		context.settings = settings;

		return botHandler(event, context, callback);
	}
};