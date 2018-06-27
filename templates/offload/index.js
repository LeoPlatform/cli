"use strict";
const leo = require("leo-sdk");
exports.handler = require("leo-sdk/wrappers/cron.js")(function (event, context, callback) {
	let settings = Object.assign({}, event);
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

});
