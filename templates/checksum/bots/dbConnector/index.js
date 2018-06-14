"use strict";

const connector = require('leo-connector-__CONNECTOR_TYPE__');
const config = require('leo-config');

module.exports = connector.checksum(async () => {
	return await config.__CONNECTOR_TYPE__;
});
