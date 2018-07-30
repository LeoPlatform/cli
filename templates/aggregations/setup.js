'use strict';
const merge = require('lodash.merge');
const utils = require('./../../lib/utils');
const prompt = require('./../../lib/prompt');
const beautify = require('js-beautify').js_beautify;
const fs = require('fs');

module.exports = {
	inquire: async function (utils) {
		let dirPath = process.cwd().split('/');
		let lastIndex = dirPath.length - 1;

		if (lastIndex < 0) {
			throw new Error('Error while attempting to process setup.js. Cannot find valid directory.');
		}

		let dirname = utils.properCaseTransform(dirPath[lastIndex]);
		return {
			____DIRNAME____: dirname,
			__bot01__: utils.properCaseTransform(dirPath[lastIndex] + '-SampleEntityLoader'),
			__bot02__: utils.properCaseTransform(dirPath[lastIndex] + '-SampleEntityChangeProcessor'),
			__bot03__: utils.properCaseTransform(dirPath[lastIndex] + '-SampleEntityChanges'),
			__bot04__: utils.properCaseTransform(dirPath[lastIndex] + '-SampleEntityAggregations'),
			__entity_id_type__: await prompt('What type would you like your ID to be in the Entities table? [S(string)|N(number)]', 'S', /^[SN]$/),
			__aggregation_id_type__: await prompt('What type would you like your ID to be in the Aggregations table? (S (String)|N (Number))', 'S', /^[SN]$/),
		};
	},
	process: async function (utils, context) {
		await updateConfig(utils, context);
		await updateModules(utils, context);
	}
};

async function updateConfig(utils, context) {
	let configs = utils.findParentFiles(process.cwd(), "leo_config.js");

	if (!configs || !configs[0] || !configs[0].length) {
		throw new Error('leo_config.js not found in installation path.');
	}

	let dirPath = process.cwd().split('/');
	let lastIndex = dirPath.length - 1;

	if (lastIndex < 0) {
		throw new Error('Error while attempting to process setup.js. Cannot find valid directory.');
	}

	// add tables to leo_config.js
	let aggregationTableName = 'aggregationTableName: process.env.aggregationTableName,';
	let entityTableName = 'entityTableName: process.env.entityTableName,';

	await utils.asyncReadFile(configs[0]).then(async data => {
		let configVars = !data.match(/aggregationTableName/) && aggregationTableName;
		configVars += !data.match(/entityTableName/) && entityTableName;

		// we already have tables defined in the config.
		if (!configVars) {
			return;
		}

		// insert the new config vars inside _global
		data = data.replace(/\_global\:\W*\{/, `_global: {${configVars}`);

		// format and write the file
		data = beautify(data, {indent_with_tabs: true});
		fs.writeFileSync(configs[0], data);
	}).catch(err => {
		console.log(err);
		throw new Error(`Unable to read ${configs[0]}`);
	});
}

/**
 * Update package.json with new modules
 * @param utils
 * @param context
 * @returns {Promise<void>}
 */
async function updateModules(utils, context) {
	let packages = utils.findParentFiles(process.cwd(), "package.json");

	if (!packages || !packages[0] || !packages[0].length) {
		throw new Error('package.json not found in installation path.');
	}

	await utils.asyncReadFile(packages[0]).then(data => {
		let p = JSON.parse(data);

		p.dependencies = merge(p.dependencies || {}, {
			'leo-connector-entity-table': '>=1.0.0'
		});

		fs.writeFileSync(packages[0], beautify(JSON.stringify(p)));
	});
}
