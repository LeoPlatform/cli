'use strict';
module.exports = {
	inquire: async function(utils) {
		let environments = await utils.createLeoEnvironments();
		return {
			template: utils.createLeoConfig(environments, {
				sqs: 'LOCAL ENDPOINT TESTING'
			}, {
				sqs: 'process.env.SQS_URL'
			})
		};
	},

	process: async function(utils, context) {
		utils.storeLeoConfigJS(context.template);
		return {};
	}
};
