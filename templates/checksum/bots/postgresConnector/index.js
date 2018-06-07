"use strict";

const config = require('leo-config');
const connector = require('leo-connector-postgres');

module.exports = connector.checksum(async () => {
	return await config.postgres;
});
