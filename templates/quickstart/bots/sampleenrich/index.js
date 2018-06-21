"use strict";
let leo = require("leo-sdk");

exports.handler = require("leo-sdk/wrappers/cron.js")(async function(event, context, callback) {
	let settings = Object.assign({
		source: "quickstart_random_numbers",
		destination: "quickstart_enriched_numbers"
	}, event);
	leo.enrich({
		id: context.botId,
		inQueue: settings.source,
		outQueue: settings.destination,
		each: (payload) => Object.assign({
			enriched: true,
			enrichedNow: Date.now()
		}, payload)
	}, (err) => {
		console.log("All done processing events", err);
		callback(err);
	});
});
