"use strict";

process.resources = process.env.Resources && JSON.parse(process.env.Resources) || {};
var async = require("async");
var leosdk = require("leo-sdk");
var kms = require("leo-sdk/lib/kms")(leosdk.configuration);

const handler = "____HANDLER____";
const pkg = require("____PACKAGEJSON____");
const botId = pkg.name;
const settings = pkg.config && pkg.config.leo && pkg.config.leo.cron && pkg.config.leo.cron.settings || {};



let decrypted = false;
let botHandler = function(event, context, callback) {
	let tasks = [];
	Object.keys(process.env).filter(e => !e.match(/^npm/)).forEach(function(key) {
		if (!decrypted && (key.toLowerCase().indexOf('kms') !== -1 || process.env[key].match(/^KMS:/)) && !key.match(/^npm_/)) {
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

module.exports = {
	handler: function(event, context, callback) {
		context.resources = process.resources;
		context.botId = botId;
		context.settings = settings;

		return botHandler(event, context, callback);
	}
};