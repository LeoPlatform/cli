const leo = require('leo-sdk');
const leoaws = require("leo-aws");

exports.handler = async function(event, context, callback) {
	let settings = Object.assign({
		queue: "quickstart_enriched_numbers",
		destination: "https://sqs.us-west-2.amazonaws.com/252200086215/test2"
	}, event);

	// read events from a queue
	leo.offload({
		id: context.botId,
		queue: settings.queue,
		batch: {
			size: 10,
			map: (payload) => {
				return {
					MessageBody: payload.enriched_event.data,
					MessageAttributes: {
						'Bot_ID': {
							DataType: 'String',
							StringValue: context.botId
						},
						'random_number': {
							DataType: 'String',
							StringValue: payload.enrichedNow
						}
					}
				}
			}
		},
		each: function(payloads, meta, done) {
			leoaws.sqs.sendMessageBatch({
				QueueUrl: settings.destination,
				Entries: payloads
			}).then(() => done(null, true)).catch(done);
		}
	}, (err) => {
		console.log("All done processing events", err);
		callback(err);
	});
};
