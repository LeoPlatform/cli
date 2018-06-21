'use strict';
module.exports = {
	linkedStacks: ['LeoBus'],
	publish: [{
			leoaws: {
				profile: 'default',
				region: 'us-west-2'
			},
			public: false,
			// staticAssets: "s3://leomicroservices-leos3bucket-10v1vi32gpjy1/leo_templatecache"
		}, //{	
		// 	leoaws: {
		// 		profile: 'default',
		// 		region: 'us-east-1'
		// 	},
		// 	public: false,
		//  staticAssets: "s3://leomicroservices-leos3bucket-10v1vi32gpjy1/leo_templatecache"
		// }
	],
	deploy: {
		dev: {
			stack: 'dev____DIRNAME____',
			parameters: {
				AlarmEmail: null,
				LeoBus: 'DevBus'
			}
		}
	},
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
};