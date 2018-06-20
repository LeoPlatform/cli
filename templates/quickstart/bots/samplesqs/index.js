const leo = require('leo-sdk');
const leoaws = require("leo-aws");

exports.handler = require("leo-sdk/wrappers/cron.js")(async function(event, context, callback) {
	let settings = Object.assign({
		queue: "Order",
		destination: "https://sqs.us-west-2.amazonaws.com/252200086215/test2"
	}, event);

	// read events from a queue
	leo.offload({
			id: context.botId,
			queue: settings.queue,
			batch: {
				size: 10
			},
			each: function(payloads, meta, done) {
				console.log(payloads);
				leoaws.sqs.sendMessageBatch({
					QueueUrl: settings.destination,
					Entries: payloads.map((obj, i) => {
						return {
							Id: i.toString(),
							MessageBody: obj.payload.op, // obj.payload.enriched_event.data,
							MessageAttributes: {
								'Bot_ID': {
									DataType: 'String',
									StringValue: context.botId
								},
								'random_number': {
									DataType: 'String',
									StringValue: obj.payload.op, //payload.enrichedNow
								}
							}
						};
					})
				}).then(() => done(null, true)).catch(done);
			}
		},
		(err) => {
			console.log("All done processing events", err);
			callback(err);
		});
});
