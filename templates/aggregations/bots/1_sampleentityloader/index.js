"use strict";

let config = require("leo-config");
let entityTable = require("leo-connector-entity-table");
const queueName = "____DIRNAME_____enriched_numbers";

exports.handler = require("leo-sdk/wrappers/cron.js")((event, context, callback) => {

    entityTable.loadFromQueue(config.entityTableName, queueName, payloadTransform, {
        botId: context.botId,
        batchRecords: 25,
        merge: false
    }).then(() => {
        console.log(`Completed. Remaining Time:`, context.getRemainingTimeInMillis());
        callback();
    }).catch(callback);
});

const payloadTransform = (payload, hash) => {
    let hashed = hash(queueName, payload.number);
    return Object.assign({}, payload.fullobj, {
        id: payload.id.toString(),
        partition: hashed
    })
};
