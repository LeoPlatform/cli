let createLeoEnvironments = require('./createLeoEnvironments.js')
let merge = require("lodash.merge")
module.exports = async function(config, opts) {
	let name = opts.name;
	let askForEnvs = opts.askForEnvs;

	let environments = askForEnvs ? (await createLeoEnvironments()) : {};
	let local_aws = environments.dev || environments.development || {};

	let regions = {};
	let deploy = {};
	Object.keys(environments).map(env => {
		deploy[env] = {
			stack: `${env}${name}`,
			parameters: Object.assign({
				LeoBus: environments[env]["leosdk"].LeoStream.split("-")[0]
			}, opts.params)
		}
		regions[`${environments[env].profile}-${environments[env].region}`] = environments[env]
	})

	return {
		leo: merge({
			_global: {},
		}, environments, config, {
			_local: {
				"leoaws": {
					"profile": local_aws.profile || undefined,
					"region": local_aws.region || undefined
				}
			}
		}),
		cli: {
			linkedStacks: ['LeoBus'],
			publish: Object.keys(regions).map(key => ({
				leoaws: {
					profile: regions[key].profile,
					region: regions[key].region
				},
				public: false,
				// staticAssets: "s3://leomicroservices-leos3bucket-10v1vi32gpjy1/leo_templatecache"
			})),
			deploy: deploy,
			test: {
				"personas": {
					"default": {
						"identity": {
							"sourceIp": "127.0.0.1"
						}
					}
				},
				defaultPersona: 'default'
			}
		}
	};
};
