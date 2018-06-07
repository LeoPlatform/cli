"use strict";

const config = require('leo-config');
const connector = require('leo-connector-mysql');

module.exports = connector.checksum(async () => {
	return await config.mysql;
});
