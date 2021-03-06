'use strict';

const leoaws = require("leo-aws");
module.exports = {
	/**defaults applied to every system**/
	_global: {},

	dev: {
		leoaws: leoaws({
			profile: 'default',
			region: 'us-west-2'
		}),
		leosdk: {
			"region": "us-west-2",
			"resources": {
				"Region": "us-west-2",
				"LeoArchive": "DevBus-LeoArchive-EV40AV12VN7Y",
				"LeoCron": "DevBus-LeoCron-1FLNC9Z5KSB72",
				"LeoEvent": "DevBus-LeoEvent-15BW5AWF2WDL",
				"LeoFirehoseStream": "DevBus-LeoFirehoseStream-WLRD5KQ5ISSP",
				"LeoKinesisStream": "DevBus-LeoKinesisStream-1LGSWLTEDERND",
				"LeoS3": "devbus-leos3-1vgbqr50913nz",
				"LeoSettings": "DevBus-LeoSettings-14HODE41JWL2O",
				"LeoStream": "DevBus-LeoStream-UY635GZGFIUQ",
				"LeoSystem": "DevBus-LeoSystem-AHQC22IPM23A"
			},
			"firehose": "DevBus-LeoFirehoseStream-WLRD5KQ5ISSP",
			"kinesis": "DevBus-LeoKinesisStream-1LGSWLTEDERND",
			"s3": "devbus-leos3-1vgbqr50913nz"
		},
		leoauth: {
			"resources": {
				"LeoAuth": "DevAuth-LeoAuth-LOG79AKRRTFR",
				"LeoAuthUser": "DevAuth-LeoAuthUser-VH4EUCCJAUJM",
			}
		}
	},
	/**overrides on every system when running locally**/
	_local: {
		"leoauth": {
			test: {
				personas: {
					default: {
						identity: {
							"sourceIp": "127.0.0.1"
						}
					}
				},
				defaultPersona: 'default'
			}
		}
	}
};
