"use strict";

let leo = require("leo-sdk");
let config = require("leo-config");

exports.handler = async function (event, context, callback) {
	let stream = leo.load(event.botId, event.destination);
	stream.write({
		now: Date.now(),
		number: Math.round(Math.random() * 10000)
	});

	stream.end(err => {
		console.log("All done loading events", err);
		callback(err);
	});
};