"use strict";
var request = require("leo-auth");

exports.handler = async function(event, context, callback) {
	let user = await request.authorize(event, {
		lrn: 'lrn:leo:botmon:::cron',
		action: "listCron"
	});

	console.log(user);

};
