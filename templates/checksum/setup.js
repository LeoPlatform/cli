'use strict';
const utils = require('./../../lib/utils');
const fs = require('fs');
const path = require('path');

let prompt = require("prompt-sync")();
let availableOptions = ['mysql', 'postgres', 'sqlserver', 'custom'];
let dbTypes = ['mysql', 'postgres', 'sqlserver'];
module.exports = {
	inquire: async function(utils) {
		console.log('Available data system types:');
		for (let option of availableOptions) {
			console.log(`  ° ${option}`);
		}

		let master = promptDefault('What is your master data system?', 'mysql');
		let masterDestination = dbTypes.indexOf(master) !== '-1' && promptDefault('What name would you like for the master connector? (If this connector does not exist, it will be created)', master + 'Connector');
		let slave = promptDefault('What is your slave data system?', 'postgres');
		let slaveDestination = dbTypes.indexOf(slave) !== '-1' && promptDefault('What name would you like for the slave connector? (If this connector does not exist, it will be created)', slave + 'Connector');

		return {
			master: master,
			masterDestination: masterDestination,
			slave: slave,
			slaveDestination: slaveDestination
		}
	},

	process: async function(utils, context) {
		await copyChecksumFiles(__dirname, context.prefix, context.dir, {
			'____DIRPATH____': context.parentName + "-" + context.dir.replace(/\s+/g, '_'),
			'____DIRNAME____': context.dir.replace(/[^a-zA-Z0-9]+/g, '_'),
			'____BOTNAME____': context.parentName + "-" + context.dir.replace(/[^a-zA-Z0-9]+/g, '_'),
			'____BOTTYPE____': context.declaredType,
			'__BOTNAME__': context.dir
		}, [
			/setup\.js$/,
			/node_modules/
		], context);

		return {};
	}
};

function promptDefault(p, def) {
	let a = prompt(p + `[${def}]: `).trim();
	if (a == "") {
		a = def;
	}
	return a;
}

async function copyChecksumFiles(src, dest, dir, replacements, ignore, setupContext) {
	let botReplacements = replacements;
	src = src + '/bots';

	botReplacements = await setupMaster(src, dest, replacements, botReplacements, ignore, setupContext);
	botReplacements = await setupSlave(src, dest, replacements, botReplacements, ignore, setupContext);
	setupChecksum(src, dest, dir, replacements, botReplacements, ignore);

	return Promise.resolve();
}

async function setupMaster(src, dest, replacements, botReplacements, ignore, setupContext)
{
	let dbReplacements = {};
	// if it's a database type that is selected, create or re-use the specified database connectors
	if (dbTypes.indexOf(setupContext.master) !== -1) {
		if (!fs.existsSync(dest + '/' + setupContext.masterDestination)) {
			let masterReplacements = replacements;

			fs.mkdirSync(dest + '/' + setupContext.masterDestination);
			fs.readdirSync(src + '/dbConnector').forEach(function (entry) {
				masterReplacements['__CONNECTOR_TYPE__'] = setupContext.master;
				utils.copyDirectorySync(path.join(src + '/dbConnector', entry), path.join(dest + '/' + setupContext.masterDestination, entry), masterReplacements, ignore);
			});
		}

		await utils.asyncReadFile(path.join(src + '/dbLambdaConnector', 'index.js')).then(data => {
			dbReplacements['__CONNECTOR_TYPE__'] = setupContext.master;
			dbReplacements['__CONNECTOR_NUMBER__'] = 1;
			for (let replaceVar in dbReplacements) {
				data = data.replace(new RegExp(replaceVar, 'g'), dbReplacements[replaceVar]);
			}
			botReplacements['__MASTER_CONNECTOR__'] = data;
			botReplacements['__MASTER_CONNECTOR_TYPE__'] = setupContext.master;
			botReplacements['__MASTER_CONNECTOR_NAME__'] = setupContext.master.charAt(0).toUpperCase() + setupContext.master.slice(1) + 'Connector';
		});
		replacements['__CONNECTOR_1__'] = 'db1';
	} else if (setupContext.master === 'custom') { // else if custom was selected
		await utils.asyncReadFile(path.join(src + '/customConnector', 'index.js')).then(data => {
			botReplacements['__MASTER_CONNECTOR__'] = data.replace(/__CONNECTOR_NUMBER__/g, 1);
		});
		replacements['__CONNECTOR_1__'] = 'custom1';
	}

	return botReplacements;
}

async function setupSlave(src, dest, replacements, botReplacements, ignore, setupContext)
{
	let dbReplacements = {};
	// if slave is of type database
	if (dbTypes.indexOf(setupContext.slave) !== -1) {
		if (!fs.existsSync(dest + '/' + setupContext.slaveDestination)) {
			let slaveReplacements = replacements;

			fs.mkdirSync(dest + '/' + setupContext.slaveDestination);
			fs.readdirSync(src + '/dbConnector').forEach(function (entry) {
				slaveReplacements['__CONNECTOR_TYPE__'] = setupContext.slave;
				utils.copyDirectorySync(path.join(src + '/dbConnector', entry), path.join(dest + '/' + setupContext.slaveDestination, entry), slaveReplacements, ignore);
			});
		}

		await utils.asyncReadFile(path.join(src + '/dbLambdaConnector', 'index.js')).then(data => {
			dbReplacements['__CONNECTOR_TYPE__'] = setupContext.slave;
			dbReplacements['__CONNECTOR_NUMBER__'] = 2;
			for (let replaceVar in dbReplacements) {
				data = data.replace(new RegExp(replaceVar, 'g'), dbReplacements[replaceVar]);
			}
			botReplacements['__SLAVE_CONNECTOR__'] = data;
			botReplacements['__SLAVE_CONNECTOR_TYPE__'] = setupContext.slave;
			botReplacements['__SLAVE_CONNECTOR_NAME__'] = setupContext.slave.charAt(0).toUpperCase() + setupContext.slave.slice(1) + 'Connector';
		});
		replacements['__CONNECTOR_2__'] = 'db2';
	} else if (setupContext.slave === 'custom') { // else custom was selected
		await utils.asyncReadFile(path.join(src + '/customConnector', 'index.js')).then(data => {
			botReplacements['__SLAVE_CONNECTOR__'] = data.replace(/__CONNECTOR_NUMBER__/g, 2);
		});
		replacements['__CONNECTOR_2__'] = 'custom2';
	}

	return botReplacements;
}

async function setupChecksum(src, dest, dir, replacements, botReplacements, ignore)
{
	if (!fs.existsSync(dest + '/' + dir)) {

		fs.mkdirSync(dest + '/' + dir);
		fs.readdirSync(src + '/checksumBot').forEach(function(entry) {
			utils.copyDirectorySync(path.join(src + '/checksumBot', entry), path.join(dest + '/' + dir, entry), botReplacements, ignore);
		});
	} else {
		console.log('Checksum bot already exists.');
	}
}
