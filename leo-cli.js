#!/usr/bin/env node

require("babel-register");

var program = require('commander');
var configure = require("./package.json");
program
	.version(configure.version)
	.command('publish [directory]', "Publish your project to S3")
	.command('deploy [directory] [stack]', "Deploy your microservice to AWS")
	.command('test [directory]', "Test your lambda")
	.command('run [directory]', "Run your lambda")
	.command('create [type] [directory]', "Create a new leo system, bot, resource, or microservice")
	.command('cron [id] [runner]', "Runs a cron handler for bot id")
	.command('configure [bus_stack_name] [region]', "Download Runs a cron handler for bot id")
	.parse(process.argv);
