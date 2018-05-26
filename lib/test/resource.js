let extend = require('extend');
const config = require("leo-config");

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

		if (config.leoauth.test && config.leoauth.test.personas) {
			extend(true, e.requestContext, config.leoauth.test.personas[config.leoauth.test.defaultPersona || 'default']);
		}
		e.requestContext.identity.sourceIp = e.requestContext.sourceIp || e.requestContext['source-ip'] || e.requestContext.SourceIp || e.requestContext.identity['source-ip'] || e.requestContext.identity.SourceIp || e.requestContext.identity.sourceIp;
		return e;
	},
	callback: (err, response, callback) => {
		if (!err && response.body && response.statusCode === 200) {
			response.body = JSON.parse(response.body);
		}
		callback(err, response);
	}
}
