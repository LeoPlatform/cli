"use strict";
const config = require("leo-config").bootstrap(require("../../leo_config.js"));

const leo = require("leo-sdk");
const ls = leo.streams;


exports.handler = function(event, context, callback) {
	const ID = context.botId;
	let settings = Object.assign({}, event);

	// Do work
	callback();
};
