"use strict";

var leo = require("leo-sdk");
exports.handler = function (event, context, callback) {
	leo.offload({
		id: event.botId,
		queue: event.source,
		each: (payload, meta, done) => {
			console.log(payload);
			console.log(meta);
			done(null, true); // Report this event was handled
		}
	}, (err) => {
		console.log("All done processing events", err);
		callback(err);
	});

}