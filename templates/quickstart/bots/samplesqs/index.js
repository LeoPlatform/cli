const config = require("leo-config");
const leo = require('leo-sdk');
const leoaws = require("leo-aws");

exports.handler = require("leo-sdk/wrappers/cron.js")(async function(event, context, callback) {
	let settings = Object.assign({
		queue: "____DIRNAME_____enriched_numbers",
		destination: config.sqs
	}, event);

	// read events from a queue
	leo.offload({
			id: context.botId,
			queue: settings.queue,
			batch: {
				size: 10
			},
			each: (payloads) => leoaws.sqs.sendMessageBatch({
				QueueUrl: settings.destination,
				Entries: payloads.map((obj, i) => {
					return {
						Id: i.toString(),
						MessageBody: `Message sent at ${obj.payload.now}`,
						MessageAttributes: {
							'Bot_ID': {
								DataType: 'String',
								StringValue: context.botId
							},
							'random_number': {
								DataType: 'String',
								StringValue: obj.payload.enrichedNow.toString()
							}
						}
					};
				})
			})
		},
		(err) => {
			console.log("All done processing events", err);
			callback(err);
		});
});