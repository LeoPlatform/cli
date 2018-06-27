"use strict";
const leo = require("leo-sdk");
exports.handler = require("leo-sdk/wrappers/cron.js")(function(event, context, callback) {
	let settings = Object.assign({}, event);
	let stream = leo.load(event.botId, event.destination);
	stream.write({
		now: Date.now(),
		number: Math.round(Math.random() * 10000)
	});

	stream.end(err => {
		console.log("All done loading events", err);
		callback(err);
	});

});
