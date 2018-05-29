'use strict';
module.exports = {
	inquire: async function (utils) {
		let environments = await utils.createLeoEnvironments();
		return {
			template: utils.createLeoConfig(environments)
		};
	},

	process: async function (utils, context) {
		utils.storeLeoConfigJS(context.template);
		return {};
	}
};
