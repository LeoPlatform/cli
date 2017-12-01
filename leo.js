#!/usr/bin/env node

var program = require('commander');
var configure = require("./package.json");

program
	.version(configure.version)
	.command('build [directory] [alias] [region]', "Builds lambda zip files and cloudformation")
	.command('deploy [directory] [alias] [region]', "Deploy your project to AWS")
	.command('publish [directory] [alias] [region]', "Publish your project to S3")
	.command('test [directory] [alias] [region]', "Test your lambda")
	.parse(process.argv);