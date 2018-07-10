"use strict";
const leo = require("leo-sdk");
exports.handler = require("leo-sdk/wrappers/cron.js")(function (event, context, callback) {
    let settings = Object.assign({
        source: "____IN_QUEUE_NAME____"
    }, event);
    leo.offload({
        id: context.botId,
        queue: settings.source,
        each: (payload, meta, done) => {
            console.log(payload);
            console.log(meta);
            done(null, true); // Report this event was handled
        }
    }, (err) => {
        console.log("All done processing events", err);
        callback(err);
    });
});
