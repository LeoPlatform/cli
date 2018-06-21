'use strict';
module.exports = {
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
			stack: 'devLeoTemplateCache',
			parameters: {
				AlarmEmail: YOUR_EMAIL_HERE
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
