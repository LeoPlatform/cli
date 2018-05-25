'use strict';

const getstackprofile = require('leo-aws/utils/getLeoStackProfile');
let prompt = require("prompt-sync")();

module.exports = async function() {
	// let environments = prompt('Which environments would you like to setup? (comma delimited): ');

	// environments = environments.split(/\s*,\s*/);
	let stackProfile = await getstackprofile('LeoTestBus', {
		'region': 'us-west-2',
		'profile': 'leotest'
	});

	console.log(stackProfile);
	// console.log(environments);


	// return environments;
};

console.log('done');
