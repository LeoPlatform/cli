"use strict";

let leo = require("leo-sdk");
let config = require("leo-config");

exports.handler = async function(event, context, callback) {
	leo.enrich({
		id: event.botId,
		inQueue: event.source,
		outQueue: event.destination,
		each: (payload, meta, done) => {
			// Enrich the event
			done(null, Object.assign({
				enriched: true,
				enrichedNow: Date.now()
			}, payload));
		}
	}, (err) => {
		console.log("All done processing events", err);
		callback(err);
	});
}