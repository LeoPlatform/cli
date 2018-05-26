"use strict";
var request = require("leo-auth");

exports.handler = async function (event, context, callback) {
	let user = await request.authorize(event, {
		lrn: 'lrn:leo:botmon:::cron',
		action: "listCron"
	});
	///OR ALTERNATIVELY
	// console.log("------- Alternative method---------");

	// user = await request.getUser(event.requestContext);
	// //do stuff
	// await user.authorize(event, {
	// 	lrn: 'lrn:leo:botmon:::cron',
	// 	action: "listCron"
	// });

	// console.log(user);

	callback(null, "I changed this b");
};
