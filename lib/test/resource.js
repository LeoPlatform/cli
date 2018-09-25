let extend = require('extend');

let config = require("../../leoCliConfigure.js")(process.env.NODE_ENV);
module.exports = {
	event: (event) => {
		let e = extend(true, {
			"requestContext": {
				"accountId": "",
				"resourceId": "",
				"stage": "DEV",
				"request-id": "",
				"identity": {
					"cognitoIdentityPoolId": null,
					"accountId": null,
					"cognitoIdentityId": null,
					"caller": null,
					"apiKey": null,
					"sourceIp": "127.0.0.1",
					"cognitoAuthenticationType": null,
					"cognitoAuthenticationProvider": null,
					"userArn": null,
					"userAgent": "PostmanRuntime/2.4.5",
					"user": null
				},
				"resourcePath": "",
				"httpMethod": "GET",
				"apiId": ""
			}
		}, event, {
			pathParameters: event.params && event.params.path,
			queryStringParameters: event.params && event.params.querystring
		});

		if (config.test && config.test.personas) {
			extend(true, e.requestContext, config.test.personas[config.test.defaultPersona || 'default']);
		}
		return e;
	},
	callback: (err, response, callback) => {
		if (!err && response.body && response.statusCode === 200) {
			response.body = typeof response.body === "object" ? response.body : JSON.parse(response.body);
		}
		callback(err, response);
	}
}
