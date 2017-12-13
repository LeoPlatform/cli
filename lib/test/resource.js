module.exports = {
	event: (event) => {

		return Object.assign({
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
		}, event);
	},
	callback: (err, response, callback) => {
		if (!err && response.body && response.statusCode === 200) {
			response.body = JSON.parse(response.body);
		}
		callback(err, response);
	}
}