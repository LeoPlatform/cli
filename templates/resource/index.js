"use strict";
const leoaws = require("leo-aws");
var request = require("leo-auth");

exports.handler = async function(event, context, callback) {
	let dynamodb = leoaws.dynamodb;

	let user = await request.getUser(event);
	//Categorize what they are trying to do.

	//this will throw an error if access is denied
	await user.authorize(event, {
		lrn: 'lrn:leo:botmon:::cron',
		action: "listCron"
	});

	console.log(user);

	callback(null, "I changed this b");

};
