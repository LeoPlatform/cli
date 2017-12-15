#!/usr/bin/env node

var program = require('commander');
var configure = require("./package.json");

program
	.version(configure.version)
	.command('publish [directory] [alias] [region]', "Publish your project to S3")
	.command('test [directory] [alias] [region]', "Test your lambda")
	.parse(process.argv);