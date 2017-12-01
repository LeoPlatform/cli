const glob = require("glob");
const path = require("path");
const fs = require("fs");
const merge = require('lodash.merge');
const aws = require("aws-sdk");
const async = require("async");

var cmds = require("./build.js")
var buildConfig = require("./build-config").build;

module.exports = {
	createCloudFormation: function (dir, opts, callback) {
		return new Promise((resolve, reject) => {
			opts = Object.assign({
				config: undefined,
				force: false,
				regions: ["us-west-2", 'us-east-1'],
				profile: null,
				public: false,
				filter: "*",
				cloudformation: undefined,
				overrideCloudFormationFile: true
			}, opts || {});
			if (!Array.isArray(opts.regions)) {
				if (opts.regions.split) {
					opts.regions = opts.regions.split(/,/);
				} else {
					opts.regions = [opts.regions];
				}
			}
			opts.filter = opts.filter || "*";

			getBuckets(opts.regions, {}, (err, buckets) => {
				const microservice = JSON.parse(fs.readFileSync(path.resolve(path.resolve(dir, "package.json"))));

				const cloudFormationFile = path.resolve(path.resolve(dir, "cloudformation.json"));

				if (opts.cloudformation) {
					var cloudFormation = opts.cloudformation;
				} else {
					const baseTemplate = JSON.parse(fs.readFileSync(path.resolve(__dirname, "./cloud-formation/template/base.json")));

					if (!fs.existsSync(cloudFormationFile)) {
						var cloudFormation = baseTemplate;
					} else {
						var cloudFormation = merge(baseTemplate, JSON.parse(fs.readFileSync(cloudFormationFile)));
					}
				}

				let version = microservice.version;

				for (var key in buckets) {
					let data = buckets[key];
					cloudFormation.Mappings.RegionMap = Object.assign({}, cloudFormation.Mappings.RegionMap, {
						[data.region]: {
							"S3Bucket": data.bucket
						}
					});
				}
				// If there isn't an ui to deploy don't make a restapi
				if (!(microservice.config && microservice.config.leo && microservice.config.leo.subtype)) {
					delete cloudFormation.Resources.RestApi;
				} else {
					cloudFormation.Resources.RestApi.Properties.Name = microservice.name;
					cloudFormation.Resources.RestApi.Properties.Description = microservice.description || microservice.name;
				}
				let thirdparty = microservice.config && microservice.config.leo && microservice.config.leo["3rdParty"];

				//if (thirdparty) {
				addStacks(microservice, cloudFormation)
				//}


				console.log(path.resolve(dir, "*(bots|api)" + `/${opts.filter}/package.json`))
				glob(path.resolve(path.resolve(dir, "*(bots|api)" + `/${opts.filter}/package.json`)), {
					nodir: true
				}, function (err, files) {
					var entries = [];
					files.filter(f => !f.match(/\/node_modules\//)).map((file) => {
						var package = JSON.parse(fs.readFileSync(file));
						const packageName = package.name.replace(/[^a-zA-Z0-9]/g, '');
						const ID = package.logicalResource || package.name.replace(/[^a-zA-Z0-9]+/g, "_").replace(/(^\w|_\w)/g, function (txt) {
							return txt.charAt(txt.length == 1 ? 0 : 1).toUpperCase();
						});
						const existing = cloudFormation.Resources[ID];
						// package = merge({}, microservice, package);
						package = merge({
							config: {
								leo: {
									stacks: []
								}
							}
						}, package);

						if (microservice.config && microservice.config.leo && microservice.config.leo.stacks) {
							package.config.leo.stacks = package.config.leo.stacks.concat(microservice.config.leo.stacks);
						}

						// TODO: this was for old config merging
						let mergedConfig = buildConfig(file);
						package.config.leo = mergedConfig;

						let version = package.version;
						let botDirName = file.replace(/^.*(?:bots|api)[/\\](.*)[\\/]package\.json$/, "$1").replace(/\//g, "\\");
						console.log(opts.force, file, botDirName)
						if (opts.force === "all" ||
							(opts.force && opts.force.replace && opts.force.replace(/[^a-zA-Z0-9]/g, '') === ID) ||
							(opts.force && opts.force.replace && opts.force.replace(/[^a-zA-Z0-9]/g, '') === packageName) ||
							(opts.force && opts.force.replace(/\//g, "\\") === botDirName)) {
							version += "." + Date.now();
						}
						const newPath = `${microservice.name}/${microservice.version}/${ID}_${version}.zip`;
						const existingPath = existing && existing.Properties.Code.S3Key.replace && existing.Properties.Code.S3Key || '';



						cloudFormation.Resources[ID] = createLambdaEntry(existing, package, newPath, file);
						if (cloudFormation.Resources[ID]) {
							cloudFormation.Resources[ID + "version"] = {
								"Type": "AWS::Lambda::Version",
								"Properties": {
									"FunctionName": {
										"Ref": ID
									}
								}
							}

							if (existingPath != newPath) {
								entries.push({
									basename: `${ID}_${version}.zip`,
									file: path.dirname(file),
									version: version,
									prev_version: existingPath.replace(new RegExp(`${microservice.name}/.*?/${ID}_`), '').replace('.zip', '')
								});
							}
						}

						//if (thirdparty) {
						addStacks(package, cloudFormation)
						//}

						let leoStack = !!(cloudFormation.Parameters && cloudFormation.Parameters["leosdk"]);
						//console.log("Leo Stack", leoStack)
						if (leoStack && package.config && package.config.leo && package.config.leo.cron && typeof package.config.leo.cron !== "string") {
							if (cloudFormation.Resources[ID]) {
								package.config.leo.cron.lambdaName = package.config.leo.cron.lambdaName || {
									"Ref": ID
								}
							}

							cloudFormation.Resources["LeoRegister"] = merge({}, cloudFormation.Resources["LeoRegister"], {
								"Type": "Custom::Install",
								"Properties": {
									"ServiceToken": {
										"Fn::ImportValue": {
											"Fn::Sub": "${leosdk}-Register"
										}
									},
									[ID]: Object.assign({
										id: package.config.leo.name || {
											"Fn::GetAtt": [
												ID,
												"Arn"
											]
										}
									}, package.config.leo.cron)
								},
							})
						}

					});

					let i = 1;
					console.log("\n\n\n----------------------Files with newer versions-----------------\n");
					entries.map(e => console.log(`${i++}. ${e.basename}  ${e.prev_version} -> ${e.version}`));
					console.log(`${i++}. cloudformation.json`);
					console.log(`\n\n${i-1} file(s) will be updated\n`);
					console.log("If you don't see the files you expected, please update their version number or");
					console.log("rerun with the --force all OR --force [LambdaDirName] command\n");
					let buildDir = `/tmp/${microservice.name}-${version}`;
					cmds.build(opts,
						dir, {
							buildDir: buildDir,
							lambdas: entries,
							cloudFormation: cloudFormation
						}, (err, data) => {
							if (!err && data) {
								let tasks = [];
								let summary = [];

								//tasks.push((done) => cmds.buildStatic(dir, opts.config, version, done))


								if (opts.publish !== false) {
									buckets.forEach((bucket) => {

										let s3region = bucket.region == "us-east-1" ? "" : "-" + bucket.region;
										summary.push({
											region: bucket.region,
											url: `https://s3${s3region}.amazonaws.com/${bucket.bucket}/${microservice.name}/${version}/`,
											cloudFormation: cloudFormation
										});
										tasks.push((done) => {
											cmds.publish(buildDir, `s3://${bucket.bucket}/${microservice.name}/${version}/`, {
												public: opts.public
											}, done);
										});
									});
								}
								async.series(tasks, (err, results) => {
									if (!err && opts.overrideCloudFormationFile) {
										fs.writeFileSync(cloudFormationFile, JSON.stringify(cloudFormation, null, 2));
									}

									if (opts.publish !== false) {
										fs.readdirSync(buildDir).forEach((file) => {
											fs.unlinkSync(path.resolve(buildDir, file));
										});
										fs.rmdirSync(buildDir);
									}
									resolve(summary);
								});
							} else {
								console.log("Error:", err || "Unknown")
								reject(err);
							}
						});
				});
			});
		});
	},
	run: function (stack, region, file, opts) {
		return new Promise((resolve, reject) => {
			var cloudformation = new aws.CloudFormation({
				region: region
			});

			cloudformation.updateStack(Object.assign({
				StackName: stack,
				TemplateURL: file,
				Capabilities: [
					"CAPABILITY_IAM",
				]
			}, opts), (err, data) => {
				if (err) {
					reject(err);
				} else {
					setTimeout(function () {
						cloudformation.waitFor("stackUpdateComplete", {
							StackName: stack
						}, (err, waitdata) => {
							if (err) {
								return reject(err);
							}
							resolve(waitdata)
						});
					}, 1);
				}
			});
		});
	},
	get: function (stack, region, opts) {
		return new Promise((resolve, reject) => {
			var cloudformation = new aws.CloudFormation({
				region: region
			});

			cloudformation.getTemplate(Object.assign({
				StackName: stack,
			}, opts), (err, data) => {
				if (err) {
					reject(err);
				} else {
					resolve(JSON.parse(data.TemplateBody))
				}
			});
		});
	}
};

function getBuckets(regions, opts, callback) {
	opts = Object.assign({
		name: 'LEO-CLI'
	}, opts || {});
	var tasks = [];
	regions.forEach((region) => {
		tasks.push((done) => {
			if (typeof region == "object" && region.region) {
				done(null, {
					region: region.region,
					bucket: region.bucket
				});
			} else {
				var cloudformation = new aws.CloudFormation({
					region: region
				});
				cloudformation.describeStackResources({
					StackName: opts.name
				}, function (err, data) {
					if (err) {
						if (err.message == `Stack with id ${opts.name} does not exist`) {
							console.log(`We cannot find a CloudFormation stack with the name ${opts.name} in region ${region}`);
							console.log(`Creating "${opts.name}" stack for region ${region}`);
							// console.log(`Please run the cloudformation.json file for the region ${region} or specify on the command line which regions to use --region us-west-2,us-east-1`);
							createStack(opts.name, JSON.stringify(require("../cloudformation.json")), region, (err, data) => {
								if (err) {
									console.log(`Error creating "${opts.name}" stack:`, err);
									process.exit();
								}
								done(null, {
									stack: opts.name,
									region: region,
									bucket: data.details.StackResources.filter(r => r.LogicalResourceId == "PublishBucket")[0].PhysicalResourceId
								});
							});
						} else {
							done(err);
						}
					} else {
						done(null, {
							stack: opts.name,
							region: region,
							bucket: data.StackResources.filter(r => r.LogicalResourceId == "PublishBucket")[0].PhysicalResourceId
						});
					}
				});
			}
		});
	});
	async.parallelLimit(tasks, 2, (err, results) => {
		err && console.log(err);
		callback(err, results);
	});
}



function createStack(name, template, region, done) {

	var cloudformation = new aws.CloudFormation({
		region: region
	});

	cloudformation.createStack({
		StackName: name,
		Capabilities: [
			"CAPABILITY_IAM"
		],
		OnFailure: "DELETE",
		TemplateBody: template,
	}, (err, data) => {
		if (err) {
			return done(err);
		}
		cloudformation.waitFor("stackCreateComplete", {
			StackName: name
		}, (err, waitdata) => {
			if (err) {
				return done(err);
			}
			cloudformation.describeStackResources({
				StackName: name
			}, function (err, data) {
				if (err) {
					return done(err);
				}
				done(null, {
					stack: name,
					region: region,
					details: Object.assign({}, waitdata.Stacks[0], {
						StackResources: data.StackResources
					})
				});
			})

		});
	});
}

function createLambdaEntry(existing, properties, newPath, file) {
	const lambdaTemplate = JSON.parse(fs.readFileSync(path.resolve(__dirname, "./cloud-formation/template/lambda.json")));

	const config = merge({
		build: {},
		stacks: []
	}, (properties && properties.config && properties.config.leo) || {});

	if (config.type == "cron-template") {
		// No lambda to create
		var visit = function (obj) {
			Object.keys(obj)
				.forEach(k => {
					var v = obj[k];
					if (typeof v == "string" && v.match(/.*\.js$/)) {
						var codefile = path.resolve(path.dirname(file), v);
						if (fs.existsSync(codefile)) {
							obj[k] = fs.readFileSync(codefile, {
								encoding: "utf-8"
							});
						}
					} else if (typeof v == "object" && !Array.isArray(v)) {
						visit(v);
					}
				});
		};

		let obj = properties.config.leo.cron;
		if (obj.settings.mappings == undefined) {
			obj.settings.mappings = "index.js"
		}
		visit(obj.settings);

		return undefined;
	}

	var env;

	let hasLeoStack = config.stacks.filter(s => s.replace(/[^a-zA-z0-9]/g, "") == "leosdk").length
	if (config.env && hasLeoStack && !("leosdk" in config.env)) {
		config.env = config.env || {};
		config.env["leosdk"] = {
			"Fn::LeoSdk": "${leosdk}"
		};
	}

	if (config.env) {
		env = {};
		Object.keys(config.env).map(k => {
			let v = config.env[k];
			let wrap = true;
			if (typeof v !== "string") {
				let t = JSON.stringify(v);
				if (!t.match(/Fn::/)) {
					v = t;
				} else {
					if (t.match(/"Fn::(LeoResources)":"(\$\{.*?\})"/)) {
						let lookups = JSON.stringify({
							"LeoStream": {
								"Fn::ImportValue": {
									"Fn::Sub": "$2-LeoStream"
								}
							},
							"LeoCron": {
								"Fn::ImportValue": {
									"Fn::Sub": "$2-LeoCron"
								}
							},
							"LeoEvent": {
								"Fn::ImportValue": {
									"Fn::Sub": "$2-LeoEvent"
								}
							},
							"LeoSettings": {
								"Fn::ImportValue": {
									"Fn::Sub": "$2-LeoSettings"
								}
							},
							"LeoS3": {
								"Fn::ImportValue": {
									"Fn::Sub": "$2-LeoS3"
								}
							},
							"LeoKinesisStream": {
								"Fn::ImportValue": {
									"Fn::Sub": "$2-LeoKinesisStream"
								}
							},
							"LeoFirehoseStream": {
								"Fn::ImportValue": {
									"Fn::Sub": "$2-LeoFirehoseStream"
								}
							},
							"Region": {
								"Fn::ImportValue": {
									"Fn::Sub": "$2-Region"
								}
							}
						});
						let sub = JSON.stringify({
							"LeoStream": "${LeoStream}",
							"LeoCron": "${LeoCron}",
							"LeoEvent": "${LeoEvent}",
							"LeoSettings": "${LeoSettings}",
							"LeoS3": "${LeoS3}",
							"LeoKinesisStream": "${LeoKinesisStream}",
							"LeoFirehoseStream": "${LeoFirehoseStream}",
							"Region": "${Region}"
						});
						v = JSON.parse(t.replace(/"Fn::(LeoResources)":"(\$\{.*?\})"/, `"Fn::Sub":[${JSON.stringify(sub)}, ${lookups}]`));

					}
					if (t.match(/"Fn::(LeoSdk)":"(\$\{.*?\})"/)) {

						let lookups = JSON.stringify({
							"LeoStream": {
								"Fn::ImportValue": {
									"Fn::Sub": "$2-LeoStream"
								}
							},
							"LeoCron": {
								"Fn::ImportValue": {
									"Fn::Sub": "$2-LeoCron"
								}
							},
							"LeoEvent": {
								"Fn::ImportValue": {
									"Fn::Sub": "$2-LeoEvent"
								}
							},
							"LeoSettings": {
								"Fn::ImportValue": {
									"Fn::Sub": "$2-LeoSettings"
								}
							},
							"LeoS3": {
								"Fn::ImportValue": {
									"Fn::Sub": "$2-LeoS3"
								}
							},
							"LeoKinesisStream": {
								"Fn::ImportValue": {
									"Fn::Sub": "$2-LeoKinesisStream"
								}
							},
							"LeoFirehoseStream": {
								"Fn::ImportValue": {
									"Fn::Sub": "$2-LeoFirehoseStream"
								}
							},
							"Region": {
								"Fn::ImportValue": {
									"Fn::Sub": "$2-Region"
								}
							}
						});
						let sub = JSON.stringify({
							"region": "${Region}",
							"kinesis": "${LeoKinesisStream}",
							"s3": "${LeoS3}",
							"firehose": "${LeoFirehoseStream}",
							"resources": {
								"LeoStream": "${LeoStream}",
								"LeoCron": "${LeoCron}",
								"LeoEvent": "${LeoEvent}",
								"LeoSettings": "${LeoSettings}",
								"LeoS3": "${LeoS3}",
								"LeoKinesisStream": "${LeoKinesisStream}",
								"LeoFirehoseStream": "${LeoFirehoseStream}",
								"Region": "${Region}"
							}
						});
						v = JSON.parse(t.replace(/"Fn::(LeoSdk)":"(\$\{.*?\})"/, `"Fn::Sub":[${JSON.stringify(sub)}, ${lookups}]`));

						//v = JSON.parse(t.replace(/"Fn::(LeoSdk)":"(\$\{.*?\})"/, '"Fn::Sub":"{\\"region\\":\\"$2-Region\\",\\"kinesis\\":\\"$2-LeoKinesisStream\\", \\"s3\\":\\"$2-LeoS3\\",  \\"firehose\\":\\"$2-LeoFirehoseStream\\", \\"resources\\": {\\"LeoStream\\": \\"$2-LeoStream\\",\\"LeoCron\\": \\"$2-LeoCron\\", \\"LeoEvent\\": \\"$2-LeoEvent\\", \\"LeoSettings\\": \\"$2-LeoSettings\\",\\"LeoS3\\": \\"$2-LeoS3\\", \\"LeoKinesisStream\\": \\"$2-LeoKinesisStream\\", \\"LeoFirehoseStream\\": \\"$2-LeoFirehoseStream\\", \\"Region\\": \\"$2-Region\\"}} "'))
					}
					wrap = false
				}
			}

			if (wrap) {
				env[k] = {
					"Fn::Sub": v
				};
			} else {
				env[k] = v;
			}
		});
	}
	var formation = merge({}, lambdaTemplate, existing, {
		Properties: {
			Code: lambdaTemplate.Properties.Code,
			Description: properties.description,
			Handler: properties.main.replace(/.js/, '') + "." + (properties.config.leo.handler || 'handler'),
			MemorySize: config.memory || null,
			Timeout: config.timeout || undefined,
			Environment: {
				Variables: env
			}
		}
	});
	let role = config.role || (config.aws && config.aws.role);
	if (role) {
		if (typeof role === "string" && !role.match(/^arn:aws:iam::/)) {
			role = {
				"Fn::GetAtt": [
					role,
					"Arn"
				]
			}
		}
		formation.Properties.Role = role;
	}
	formation.Properties.Code.S3Key = newPath;
	return formation;
}

function addStacks(package, cloudFormation) {
	let stacks = (package.config && package.config.leo && package.config.leo.stacks) || [];
	if (stacks.length) {
		cloudFormation.Parameters = cloudFormation.Parameters || {};
	}

	stacks.map(stack => {
		let stackName = stack.replace(/[^a-zA-z0-9]/g, "");
		if (!(stackName in cloudFormation.Parameters)) {
			cloudFormation.Parameters[stackName] = {
				"Type": "String",
				"Description": `Reference to the "${stack}" stack`
			}
		}
	});
}