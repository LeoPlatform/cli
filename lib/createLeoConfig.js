module.exports = function(environments, _local, _global) {
	let template = `'use strict';
module.exports = {
	/**defaults applied to every system**/
	_global: ${JSON.stringify(Object.assign({}, _global),null, 2).replace(/"(process[^"]*)"/, '$1').replace(/^  /gm, "\t\t").replace(/  /g,"\t").replace(/^}/m, "\t}")},
	${Object.keys(environments).map(name=>createEnv(name, environments[name]))},
	/**overrides on every system when running locally**/
	_local: ${JSON.stringify(Object.assign({
		leoaws: {
			profile: 'default',
			region: 'us-west-2'
		}
	}, _local), null, 2).replace(/^  /gm, "\t\t").replace(/  /g,"\t").replace(/^}/m, "\t}")}
};`;
	return template;
};

function createEnv(name, env) {
	return `
	${name}: {
		"leosdk": ${JSON.stringify(env['leo-sdk'],null, 2).replace(/^  /gm, "\t\t\t").replace(/  /g,"\t").replace(/^}/m, "\t\t}")},
		"leoauth": ${JSON.stringify(env['leo-auth'],null, 2).replace(/^  /gm, "\t\t\t").replace(/  /g,"\t").replace(/^}/m, "\t\t}")}
	}`
}
