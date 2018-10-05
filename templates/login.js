let handlers = {
	saml: (event) => {
		console.log(event);
		return (event.body && event.body.SAMLResponse) || (event.queryStringParameters && event.queryStringParameters.SAMLResponse);
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
				console.log(login)
				acc[login.key] = login.handler(event);
				return acc;
			}, {})
		}
	}
};
