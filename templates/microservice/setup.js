'use strict';
module.exports = {
	inquire: async function (utils) {

		let data = await utils.createLeoConfig(Object.assign({
			_global: {},
			_local: {}
		}), {
			name: utils.name,
			askForEnvs: true,
			params: {}
		});

		return {
			leoconfig: data.leo,
			leocliconfig: data.cli
		};
	},

	process: async function (utils, context) {
		utils.storeFile("leo_config.js", context.leoconfig);
		utils.storeFile("leo_cli_config.js", context.leocliconfig);
		return {};
	}
};