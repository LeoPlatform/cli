#!/usr/bin/env node

let program = require('commander');
let configure = require("./package.json");
program
    .version(configure.version)
    .command('publish [directory] [options]', "Publish your project to S3")
    .command('deploy [directory] [stack]', "Deploy your microservice to AWS")
    .command('test [directory]', "Test your lambda")
    .command('run [directory]', "Run your lambda")
    .command('create [type] [directory]', "Create a new leo system, bot, resource, or microservice")
    .command('cron [id] [runner]', "Runs a cron handler for bot id")
    .command('configure [leo_bus_stack] [dir]', "Download Runs a cron handler for bot id")
    .on('--help', function () {
        process.stdout.write(require('colors').red(
            '    debug [directory]                Debug your lambda\n'));
    })
    .action(cmd => {
        if (cmd === "debug" && process.argv.length >= 4) {
            process.argv = process.argv.filter(a => a !== "debug");
            require("./leo-cli-debug.js").debugBot(process.argv[2]);
        } else {
            program.help(require('colors').red);
        }
    })
    .parse(process.argv);
