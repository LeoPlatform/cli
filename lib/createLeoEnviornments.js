const getstackprofile = require('leo-aws/utils/getLeoStackProfile');
let prompt = require("prompt-sync")();

function promptDefault(p, def) {
	let a = prompt(p + `[${def}]: `).trim();
	if (a == "") {
		a = def;
	}
	return a;
}

function capitalizeFirstLetter(string) {
	return string.charAt(0).toUpperCase() + string.slice(1);
}


module.exports = async function() {
	let environments = promptDefault('Which environments would you like to setup? (comma delimited)', "NONE");

	if (environments != "NONE") {
		environments = environments.split(/\s*,\s*/);
	} else {
		environments = [];
	}

	let out = {};
	for (var i = 0; i < environments.length; i++) {
		let env = environments[i];
		console.log(`----------------${env}------------`);
		let region = promptDefault(`In which aws region is ${env} located?`, 'us-west-2');
		let profile = promptDefault(`In which aws cli profile does ${env} use?`, 'default');
		out[env] = {
			region: region,
			profile: profile,
			'leo-sdk': await getstackprofile(
				promptDefault(`What is the name of the LeoBus Stack for ${env}?`, `${capitalizeFirstLetter(env)}Bus`), {
					'region': region,
					'profile': profile
				})
		};
	}

	return out;
};
