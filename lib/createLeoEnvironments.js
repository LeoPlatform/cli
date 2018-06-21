const getstackprofile = require('leo-aws/utils/getLeoStackProfile');
let prompt = require("./prompt.js");

function capitalizeFirstLetter(string) {
	return string.charAt(0).toUpperCase() + string.slice(1);
}


module.exports = async function() {
	let environments = await prompt('Which environments would you like to setup? (comma delimited)', "dev");

	if (environments != "NONE") {
		environments = environments.split(/\s*,\s*/);
	} else {
		environments = [];
	}

	let out = {};
	for (var i = 0; i < environments.length; i++) {
		let env = environments[i];
		console.log(`----------------${env}------------`);
		let region = await prompt(`In which aws region is ${env} located?`, 'us-west-2');
		let profile = await prompt(`Which aws cli profile does ${env} use?`, 'default');
		let leo_sdk = await getStackProfileId(`What is the name of the LeoBus Stack for ${env}?`, env, region, profile, 'Bus');
		let leo_auth = await getStackProfileId(`What is the name of the LeoAuth Stack for ${env}?`, env, region, profile, 'Auth');

		out[env] = {
			region: region,
			profile: profile,
			'leo-sdk': leo_sdk,
			'leo-auth': leo_auth
		};
	}

	return out;

	async function getStackProfileId(questionText, env, region, profile, postFix) {
		let response = await prompt(questionText, `${capitalizeFirstLetter(env)}${postFix}`);
		let result;

		try {
			result = await getstackprofile(response, {
				'region': region,
				'profile': profile
			});
		} catch (e) {
			console.log(`[ERROR]: ${e.message}. Please try another ID.`);
			return await getStackProfileId(questionText, env, region, profile, postFix);
		}

		return result;
	}
};