'use strict';
module.exports = {
	inquire: async function(utils) {
		let data = await utils.createLeoConfig(Object.assign({
			_global: {
				sqs: utils.raw('process.env.SQS_URL'),
			},
			_local: {
				sqs: 'LOCAL ENDPOINT TESTING'
			}
		}), {
			name: utils.name,
			askForEnvs: true,
			params: {
				AlarmEmail: "default@email.com"
			}
		});

		return {
			leoconfig: data.leo,
			leocliconfig: data.cli
		};
	},

	process: async function(utils, context) {
		utils.storeFile("leo_config.js", context.leoconfig);
		utils.storeFile("leo_cli_config.js", context.leocliconfig);
		return {};
	}
};