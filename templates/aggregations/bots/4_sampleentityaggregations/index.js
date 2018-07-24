"use strict";

exports.handler = require("leo-connector-entity-table").tableOldNewProcessor({
    defaultQueue: "sample_aggregation_changes",
    resourcePrefix: "sample",
    eventSuffix: "_aggregations",
    botSuffix: "_aggregation_changes"
});
