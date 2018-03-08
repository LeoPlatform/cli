#!/usr/bin/env node

var program = require('commander');
var colors = require('colors');

const generateProfile = require("leo-sdk/lib/generateProfile.js");

program
	.version('0.0.1')
	.option("-g, --global", "Install Globally")
	.usage('<stack> <region> <dir> [options]')
	.action(function(stack, region, dir, options) {
		if (typeof dir === "object") {
			options = dir;
			dir = ".";
		}
		if (options.global) {
			dir = null;
		}
		generateProfile(stack, {
			region: region
		}, dir, (err) => {
			console.log("done");
			if (err) console.log(err);
		});
	})
	.parse(process.argv);
if (!process.argv.slice(2).length) {
	program.outputHelp(colors.red);
}
