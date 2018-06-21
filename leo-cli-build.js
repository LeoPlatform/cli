#!/usr/bin/env node

var path = require('path');
var program = require('commander');
var colors = require('colors');
var cmds = require("./lib/build.js")
program
	.version('0.0.1')
	.option("-e, --env [env]", "Environment")
	.option("-r, --region [region]", "AWS Region")
	.option("-p, --profile [profile]", "AWS Profile")
	.arguments('[dir] [alias] [region]')
	.usage('[dir] [alias] [region] [options]')
	.action(function(dir, alias, region) {
		if (!dir) {
			dir = process.cwd();
		}
		console.log(dir);
		var rootDir = path.resolve(process.cwd(), "./" + dir);
		cmds.build(program, rootDir, {
			alias,
			region
		}, (err) => {

		});
	})
	.parse(process.argv);
console.log(process.argv);
if (!process.argv.slice(2).length) {
	program.outputHelp(colors.red);
}
