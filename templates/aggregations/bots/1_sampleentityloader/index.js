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
    let hashed = hash(queueName, payload.id);

    // if entity type id type is string, convert the id to a string, otherwsise convert to integer
    let id = ('__entity_id_type__' === 'S') ? payload.id.toString() : parseInt(payload.id);

    return Object.assign({}, payload, {
        id: id,
        partition: hashed
    })
};
