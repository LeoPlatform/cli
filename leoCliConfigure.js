let utils = require("./lib/utils.js");
const merge = require("lodash.merge");

module.exports = function(env) {
	let configs = utils.findParentFiles(process.cwd(), "leo_cli_config.js");
	let config = {};

	configs.forEach(file => {
		let c = require(file);
		merge(config, c);
	});

	return config;
};
