module.exports = function(environments) {
	let template = `'use strict';

const leoaws = require("leo-aws");
module.exports = {
	/**defaults applied to every system**/
	_global: {
		leopublish: function () {
			return {
				"us-east-1": {
					leoaws: leoaws({
						profile: 'default',
						region: 'us-east-1'
					}),
					public: false,
					static: {
						s3: "s3://leomicroservices-leos3bucket-10v1vi32gpjy1/leo_template_cache",
						cloudfront: ""
					},
					stack: this.env + "LeoTemplateCache"
				}/*,
				"us-west-2": {
					leoaws: leoaws({
						profile: 'default',
						region: 'us-west-2'
					}),
					public: false,
					static: {
						s3: "s3://leomicroservices-leos3bucket-10v1vi32gpjy1/leo_template_cache",
						cloudfront: ""
					},
					stack: this.env + "LeoTemplateCache"
				}*/
			}
		}
	},
	${Object.keys(environments).map(name=>createEnv(name, environments[name]))},
	/**overrides on every system when running locally**/
	_local: {
		"leoauth": {
			"test": {
				"personas": {
					"default": {
						"identity": {
							"sourceIp": "67.163.78.93"
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
