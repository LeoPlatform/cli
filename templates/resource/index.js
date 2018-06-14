"use strict";
const config = require("leo-config").bootstrap(require("../../leo_config.js"));
var request = require("leo-auth");



exports.handler = async function(event, context, callback) {
	let leoaws = await config.leoaws;
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
