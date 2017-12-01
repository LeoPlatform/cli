"use strict";

process.resources = process.env.Resources && JSON.parse(process.env.Resources) || {};
var file = require("____FILE____");
var handler = "____HANDLER____";

module.exports = {
	handler: function (event, context, callback) {
		context.resources = process.resources;
		return file[handler](event, context, callback);
	}
};