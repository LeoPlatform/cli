'use strict';
module.exports = {
	inquire: async function (utils) {
		let enviornments = await utils.createLeoEnviornments();
		return {
			template: utils.createLeoConfig(enviornments)
		};
	},

	process: async function (utils, context) {
		utils.storeLeoConfigJS(context.template);
		return {};
	}
};
