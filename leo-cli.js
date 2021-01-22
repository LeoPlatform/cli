#!/usr/bin/env node

const program = require('commander');
const configure = require("./package.json");
program
	.version(configure.version)
	.command('publish [directory] [options]', "Publish your project to S3")
	.command('deploy [directory] [stack]', "Deploy your microservice to AWS")
	.command('test <directory>', "Test your lambda")
	.command('run [directory]', "Run your lambda")
	.command('create [type] [directory]', "Create a new leo system, bot, resource, or microservice")
	.command('cron [id] [runner]', "Runs a cron handler for bot id")
	.command('configure [leo_bus_stack] [dir]', "Download Runs a cron handler for bot id")
	.parse(process.argv);
