const querystring = require('querystring');
let handlers = {
	saml: (event) => {
		let body = typeof event.body == "string" ? querystring.parse(event.body) : event.body;
		return (body && body.SAMLResponse) || (event.queryStringParameters && event.queryStringParameters.SAMLResponse);
	}
};
module.exports = (data) => {
	let logins = [];
	if (data) {
		let l = JSON.parse(data);
		if (!Array.isArray(l)) {
			l = [l];
		}
		logins = l.map(v => {
			let [junk, handler, key] = v.split(/^(.*?):(.*)$/);
			return {
				handler: handlers[handler.toLowerCase()],
				key: key
			};
		});
	}
	return {
		length: () => logins.length,
		get: (event) => {
			return logins.reduce((acc, login) => {
				acc[login.key] = login.handler(event);
				return acc;
			}, {})
		}
	}
};
