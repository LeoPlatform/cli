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
		let profile = promptDefault(`Which aws cli profile does ${env} use?`, 'default');
		let leo_sdk = await getStackProfileId(`What is the name of the LeoBus Stack for ${env}?`, env, region, profile);
		let leo_auth = await getStackProfileId(`What is the name of the LeoAuth Stack for ${env}?`, env, region, profile);

		out[env] = {
			region: region,
			profile: profile,
			'leo-sdk': leo_sdk,
			'leo-auth': leo_auth
		};
	}

	return out;

	async function getStackProfileId(questionText, env, region, profile)
	{
		let response = promptDefault(questionText, `${capitalizeFirstLetter(env)}Bus`);
		let result;

		try {
			result = await getstackprofile(response, {
				'region': region,
				'profile': profile
			});
		} catch (e) {
			console.log(`[ERROR]: ${e.message} Please try another ID.`);
			return await getStackProfileId(questionText, env, region, profile);
		}

		return result;
	}
};
