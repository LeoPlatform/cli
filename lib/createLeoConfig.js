module.exports = function(enviornments) {
	let template = `'use strict';

const leoaws = require("leo-aws");
module.exports = {
	/**defaults applied to every system**/
	_global: {
	},
	${Object.keys(enviornments).map(name=>createEnv(name, enviornments[name]))},
	/**overrides on every system when running locally**/
	_local: {
		"leoauth": {
			"test": {
				"personas": {
					"default": {
						"identity": {
							"source-ip": "67.163.78.93"
						}
					}
				},
				defaultPersona: 'default'
			}
		}
	}
};`;
	return template;
};

function createEnv(name, env) {
	return `
	${name}: {
		leoaws: leoaws({
			profile: '${env.profile}',
			region: '${env.region}'
		}),
		"leosdk": ${JSON.stringify(env['leo-sdk'],null, 2).replace(/^  /gm, "\t\t\t").replace(/  /g,"\t").replace(/^}/m, "\t\t}")},
		"leoauth": ${JSON.stringify(env['leo-auth'],null, 2).replace(/^  /gm, "\t\t\t").replace(/  /g,"\t").replace(/^}/m, "\t\t}")}
	}`
}
