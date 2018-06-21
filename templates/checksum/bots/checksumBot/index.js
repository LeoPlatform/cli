"use strict";

const leo = require('leo-sdk');
const checksum = require('leo-connector-common/checksum');
const moment = require('moment');

exports.handler = function(event, context, callback) {
	let system = 'default';

	__MASTER_CONNECTOR__

	__SLAVE_CONNECTOR__

	checksum.checksum(system, event.botId, __CONNECTOR_1__, __CONNECTOR_2__, {
		stopOnStreak: 1750000,
		stop_at: moment().add({minutes: 4}),
		fieldNames: [
			'id', 'status'
		],
		maxLimit: 500000,
		//shouldDelete: true, // uncomment this out to delete records on the slave that no longer exist on the master
		loadSize: 50000,
		limit: 20000,
		reverse: true,
		sample: true,
		queue: {
			name: event.destination,
			transform: leo.streams.through((obj, done) => {
				// push the incorect and missing id's into the destination queue
				done(null, {
					Example: obj.missing.concat(obj.incorrect)
				});
			})
		}
	})
	.then(data=>{ console.log(data); callback()})
	.catch(callback);
};
