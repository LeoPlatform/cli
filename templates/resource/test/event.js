//https: //docs.aws.amazon.com/apigateway/latest/developerguide/set-up-lambda-proxy-integrations.html#api-gateway-simple-proxy-for-lambda-input-format
module.exports = {
	httpMethod: "POST",
	headers: {},
	pathParameters: {
		id: "steve"
	},
	body: JSON.stringify('This is the sample file template'),
	isBase64Encoded: false,
};
