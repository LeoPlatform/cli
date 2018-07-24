"use strict";
const leo = require("leo-sdk");
const config = require("leo-config");
const ls = require('leo-streams');
const {
    first,
    countChanges,
    aggregator
} = require("leo-connector-entity-table/lib/aggregations.js");

exports.handler = require("leo-sdk/wrappers/cron.js")((event, context, callback) => {
    let source = Object.assign({
        source: "____DIRNAME_____enriched_numbers_changes"
    }, event).source;

    let stats = ls.stats(context.botId, source);
    console.log("agg table name", config.aggregationTableName);
    ls.pipe(leo.read(context.botId, source), stats, aggregator(config.aggregationTableName, 'sample', payload => [sampleChanges(payload)]), err => {
        if (err) {
            callback(err);
        } else {
            let statsData = stats.get();
            stats.checkpoint((err) => {
                if (err) {
                    return callback(err);
                }
                if (statsData.units > 0) {
                    leo.bot.checkpoint(context.botId, `system:dynamodb.${config.aggregationTableName.replace(/-[A-Z0-9]{12}$/, "")}.sample`, {
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

const sampleChanges = o => ({
    entity: 'sample',
    id: o.id,
    aggregate: {
        timestamp: o.enrichedNow,
        buckets: ["alltime"]
    },
    data: {
	    id: first(Date.now(), o.id),
        numberChanges: countChanges(o.number)
    }
});
