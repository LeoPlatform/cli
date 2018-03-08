#!/usr/bin/env node

const leo = require("leo-sdk");
const async = require("async");
const fs = require("fs");
const path = require("path");
var program = require('commander');

var dynamodb = leo.aws.dynamodb;
var cp = require("child_process");

program
	.version('0.0.1')
	.option("--regex [regex]", "Flag indicating the ids is a regex")
	.option("--regexFlags [regexFlags]", "Regex flags")
	.option("--runner [runner]", "Runner file to call when a bot is invoked")
	.option("--poll [poll]", "Poll duration in seconds")
	.usage('<id> [options]')
	.action(function (data) {
		var bots = {};
		var timeout = null;

		let regexExp = program.regex ? data : `^${data}$`;
		let regexFlags = program.regexFlags || "i";
		let runner = program.runner || path.resolve(__dirname, "./lib/defaultCronRunner.js");
		let regex = new RegExp(regexExp, regexFlags);
		console.log(regex, regexExp, regexFlags, runner)
		let cache = {
			_instances: {},
			_db: {},
			_remoteCode: true
		};
		let hooks = {};

		if (fs.existsSync(`./cron-hooks.js`)) {
			hooks = Object.assign(hooks, require(`./cron-hooks.js`));
		}

		console.log("Looking for Managed Bots", regex);
		console.log("Using Cron Table:", leo.configuration.resources.LeoCron);
		function findNewBots(callback) {
			dynamodb.scan(leo.configuration.resources.LeoCron, {}, (err, items) => {
				async.each(items.filter(c => {
					return c.id.match(regex);
				}), (cron, done) => {
					if (!cron.time && (!cron.triggers || cron.triggers.length == 0)) {
						cron.trigger = Date.now();
					}
					//cache._instances[cron.id] = Object.assign(cache._instances[cron.id] || {}, cron.instances, cache._db[cron.id]);

					if (!(cron.id in bots) || !bots[cron.id].running) {
						var shouldRun = leo.bot.shouldRun(bots[cron.id] && bots[cron.id].cron, cron, cache, (result) => {
							if (result && result.value) {
								createBot(cron, done);
							} else {
								if (result && !result.value) {
									console.log(`${cron.id} not triggered to run`)
								}
								done();
							}
						});
					} else {
						let bot = bots[cron.id];
						if (cron.paused) {
							kill(bot.proc);
							done();
						} else {
							updateBot(cron, done);
						}
					}
				}, (err) => {
					if (callback) {
						callback();
					}
				})

			});
			return this;
		}
		findNewBots();

		var interval = setInterval(findNewBots, 1000 * (program.poll || 10));
		//do something when app is closing
		process.on('exit', () => {
			clearInterval(interval);
		});

		//catches ctrl+c event
		process.on('SIGINT', () => {
			clearInterval(interval);
		});

		//catches uncaught exceptions
		process.on('uncaughtException', (err) => {
			console.log("Error", err)
			clearInterval(interval);
		});

		function getSettings(cron, callback) {
			leo.bot.buildPayloads(cron, {}, {
				instances: "0"
			}).then(r => {
				r[0].__cron.lambdaName = cron.lambdaName;
				r[0].__cron.force = true;
				callback(null, r[0]);
			}).catch(callback);
		}

		function createBot(cron, callback) {

			getSettings(cron, (err, settings) => {
				if (err) {
					return callback(err);
				}

				var bot = bots[cron.id];
				if (!bot) {
					bot = {
						cron: cron,
						proc: cp.fork(runner, [cron.id]),
					};

					if (!fs.existsSync(path.resolve(`/tmp/log`))) {
						fs.mkdirSync(path.resolve(`/tmp/log`));
					}
					//let stdout = console.log//fs.createWriteStream(path.resolve(`/tmp/log/${cron.id}.log`));
					//let stderr = fs.createWriteStream(path.resolve(`/tmp/log/${cron.id}.log`));

					//bot.proc.stdout.on("data", d=>console.log(d));
					//bot.proc.stderr.on("data", d=>console.error(d));

					bot.proc.on("exit", function () {
						delete bots[cron.id];
						console.log(cron.id, "exited");
						//stdout.end();
					});

					bot.proc.on("message", (msg) => {
						if (msg.action == "complete") {
							console.log(cron.id, "exited");
							bot.running = false;
						}
					});
					bots[cron.id] = bot;
				}

				bot.running = true;
				bot.proc.send({
					action: 'start',
					cron: settings
				});
				callback(null, bot);
			})
		}

		function updateBot(cron, callback) {
			var bot = bots[cron.id];

			async.map({ last: bot.cron, settings: cron }, getSettings, (err, results) => {
				let last = results.last;
				let settings = results.settings;
				let command = hooks.OnUpdate && hooks.OnUpdate(last, settings, bot.proc);

				if (command == "restart") {
					kill(bot.proc, () => {
						console.log("Should restart the bot", cron.id);
						createBot(cron, callback);
					});
				} else {
					bot.proc.send({
						action: 'update',
						cron: settings
					});
					callback();
				}
			});
		}

		function kill(proc, callback) {
			if (callback) {
				proc.on("exit", callback)
			}
			proc.kill('SIGINT');
		}
	})
	.parse(process.argv);

if (!process.argv.slice(2).length) {
	program.outputHelp(colors.red);
}
