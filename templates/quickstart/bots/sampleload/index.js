"use strict";
let leo = require("leo-sdk");
process.env.LEO_LOGGER = '/.*/tide'
exports.handler = require("leo-sdk/wrappers/cron.js")(async function(event, context, callback) {
	let settings = Object.assign({
		destination: "____DIRNAME_____random_numbers"
	}, event);

	let stream = leo.load(context.botId, settings.destination);
	for (let i = 0; i < 10; i++) {
		stream.write({
			id: i,
			now: Date.now(),
			number: Math.round(Math.random() * 10000)
		});
	}
	console.log("sending");
	stream.end(err => {
		console.log("All done loading events", err);
		callback(err);
	});
});