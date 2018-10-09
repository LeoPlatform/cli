"use strict";
const leo = require("leo-sdk");
const ls = leo.streams;

exports.handler = require("leo-sdk/wrappers/cron.js")(function(event, context, callback) {
	const ID = context.botId;
	let settings = Object.assign({}, event);

	// Do work
	callback();
});
