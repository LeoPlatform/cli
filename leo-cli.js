#!/usr/bin/env node

var program = require('commander');
var configure = require("./package.json");

program
	.version(configure.version)
	.command('publish [directory]', "Publish your project to S3")
	.command('test [directory]', "Test your lambda")
	.command('run [directory]', "Run your lambda")
	.command('create [type] [directory]', "Create a new leo system, bot, resource, or microservice")
	.parse(process.argv);