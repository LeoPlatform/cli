//https: //docs.aws.amazon.com/apigateway/latest/developerguide/set-up-lambda-proxy-integrations.html#api-gateway-simple-proxy-for-lambda-input-format
module.exports = {
	httpMethod: "GET",
	headers: {},
	queryStringParameters: {
		something: 'awesome'
	},
	pathParameters: {
		id: "steve"
	}
};
