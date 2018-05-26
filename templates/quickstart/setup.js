'use strict';

// let prompt = require("prompt-sync")();

module.exports = {
	inquire: async function(utils) {
		let enviornments = await utils.createLeoEnviornments();
		let template = utils.createLeoConfig(enviornments);
		return {
			template: template
		};
	},

	process: async function(utils, context) {
		utils.storeLeoConfigJS(context.template);
		return {};
	}
};
