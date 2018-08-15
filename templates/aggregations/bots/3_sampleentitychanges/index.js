"use strict";
const leo = require("leo-sdk");
const config = require("leo-config");
const ls = leo.streams;
const {
	first,
	countChanges,
	aggregator,
	last
} = require("leo-connector-entity-table/lib/aggregations.js");
// will be used to prefix aggregations
const entity = 'sample';

exports.handler = require("leo-sdk/wrappers/cron.js")((event, context, callback) => {
	let source = Object.assign({
		source: "____DIRNAME_____enriched_numbers_changes"
	}, event).source;

	let stats = ls.stats(context.botId, source);
	ls.pipe(leo.read(context.botId, source), stats, aggregator(config.aggregationTableName, entity, payload => [changes(payload)]), err => {
		if (err) {
			callback(err);
		} else {
			let statsData = stats.get();
			stats.checkpoint((err) => {
				if (err) {
					return callback(err);
				}
				if (statsData.units > 0) {
					leo.bot.checkpoint(context.botId, `system:dynamodb.${config.aggregationTableName.replace(/-[A-Z0-9]{12}$/, "")}.${entity}`, {
						type: "write",
						eid: statsData.eid,
						records: statsData.units,
						started_timestamp: statsData.started_timestamp,
						ended_timestamp: statsData.ended_timestamp,
						source_timestamp: statsData.source_timestamp
					}, () => {
						callback();
					});
				} else {
					callback();
				}
			});
		}
	});
});

const changes = o => ({
	entity: entity,
	id: o.id,
	aggregate: {
		timestamp: o.enrichedNow,
		// available options: alltime, yearly, quarterly, monthly, weekly, daily, hourly, minutely
		buckets: ["alltime", "hourly"]
	},
	data: {
		id: first(Date.now(), o.id),
		latest: last(Date.now(), JSON.stringify(o)),
		numberChanges: countChanges(o.number)
	}
});
