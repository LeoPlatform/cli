"use strict";
var leo = require("leo-sdk");
exports.handler = function(event, context, callback) {
	let settings = Object.assign({}, event);
	var stream = leo.load(event.botId, event.destination);
	stream.write({
		now: Date.now(),
		number: Math.round(Math.random() * 10000)
	});

	stream.end(err => {
		console.log("All done loading events", err);
		callback(err);
	});

}
