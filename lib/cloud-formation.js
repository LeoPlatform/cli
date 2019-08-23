const glob = require("glob");
const path = require("path");
const fs = require("fs");
const merge = require('lodash.merge');
const async = require("async");
const utils = require("./utils");

var cmds = require("./build.js");
var buildConfig = require("./build-config").build;

module.exports = {
	createCloudFormation: function(dir, opts) {
		return new Promise((resolve, reject) => {
			opts = Object.assign({
				linkedStacks: [],
				config: undefined,
				force: false,
				targets: [],
				filter: "*",
				publish: true,
				tag: undefined,
				cloudFormationOnly: false
			}, opts || {});
			opts.filter = opts.filter || "*";
			opts.tag = (opts.tag ? (opts.tag.match(/^[/\\]/) ? opts.tag : `/${opts.tag}`) : "").replace(/\\/g, "/");

			opts.targets.forEach(target => {
				target.leoaws = require("leo-aws")(target.leoaws);
			});

			this.getBuckets(opts.targets, {
				ignoreErrors: !opts.publish,
				name: opts.cliStack
			}, (err, buckets) => {
				if (err) return reject(err);

				const microservice = JSON.parse(fs.readFileSync(path.resolve(path.resolve(dir, "package.json"))));
				let cloudFormation;
				if (opts.cloudformation) {
					cloudFormation = merge({}, opts.cloudformation, JSON.parse(fs.readFileSync(path.resolve(__dirname, "./cloud-formation/template/base.json"))));
				} else {
					cloudFormation = JSON.parse(fs.readFileSync(path.resolve(__dirname, "./cloud-formation/template/base.json")));
				}

				cloudFormation.Resources = Object.assign(cloudFormation.Resources, microservice.config && microservice.config.leo && microservice.config.leo.Resources || {});

				let defaultParameters = (microservice.config && microservice.config.leo && microservice.config.leo.no_env_param === true) ? {} : {
					"Environment": {
						"Type": "String",
						"Default": "dev",
						"MinLength": 1,
						"Description": "Environment"
					}
				};
				cloudFormation.Parameters = Object.assign(defaultParameters, cloudFormation.Parameters, microservice.config && microservice.config.leo && microservice.config.leo.Parameters || {});
				cloudFormation.Conditions = Object.assign({}, cloudFormation.Conditions, microservice.config && microservice.config.leo && microservice.config.leo.Conditions || {});
				cloudFormation.Outputs = Object.assign({}, cloudFormation.Outputs, microservice.config && microservice.config.leo && microservice.config.leo.Outputs || {});

				let version = microservice.version;
				let build = Date.now();
				let buildInfo = { build: build, version, tag: opts.tag, name: microservice.name, s3Folder: `/${microservice.name}${opts.tag}/${version}`, extendedVersion: `${version}.${build}` };
				let buildDir = `/tmp/${microservice.name}-${version}`;
				let tmpDir = path.resolve(dir, "/tmp");
				if (!fs.existsSync(tmpDir)) {
					fs.mkdirSync(tmpDir);
				}

				for (var key in buckets) {
					let data = buckets[key];
					cloudFormation.Mappings.RegionMap = Object.assign({}, cloudFormation.Mappings.RegionMap, {
						[data.region]: {
							"S3Bucket": data.bucket
						}
					});
				}
				addStacks(microservice, cloudFormation, opts.linkedStacks);
				console.log(path.resolve(dir, "*(bots|api)/{,!(node_modules)/**/}" + `/${opts.filter}/package.json`));
				let seenLambdaResourceNames = {};
				glob(path.resolve(path.resolve(dir, "*(bots|api)/{,!(node_modules)/**/}" + `/${opts.filter}/package.json`)), {
					nodir: true
				}, function(err, files) {
					var entries = [];
					let processFiles = [];
					files.filter(f => !f.match(/\/node_modules\//)).map(f => {
						var pkg = merge({
							config: {
								leo: {}
							}
						}, JSON.parse(fs.readFileSync(f)));
						let leo = pkg.config.leo;

						processFiles.push(f);
						if (leo.variations) {
							leo.variations.forEach((v, i) => {
								if (!v.name) {
									// TODO: Add memory and time to name
									v.name = i + 1;
								}
								let name = pkg.name + "-var-" + v.name;
								delete v.name;
								let newPackage = merge({
									config: {
										leo: {
											isVariation: true,
											variationUsesTime: v.cron && !!v.cron.time,
											variationUsesTriggers: v.cron && !!v.cron.triggers
										}
									}
								}, pkg, {
									name: name,
									config: {
										leo: v
									}
								});

								processFiles.push({
									file: f,
									package: newPackage
								});
							});
						}
					});

					let prevSwagger = merge({}, cloudFormation.Resources.RestApi && cloudFormation.Resources.RestApi.Properties.Body);
					processFiles.map((file) => {
						var filePackage;
						if (file.package) {
							filePackage = file.package;
							file = file.file;
						} else {
							filePackage = JSON.parse(fs.readFileSync(file));
						}

						const packageName = filePackage.name.replace(/[^a-zA-Z0-9]/g, '');
						const ID = filePackage.logicalResource || utils.properCaseTransform(filePackage.name);
						// .replace(/[^a-zA-Z0-9]+/g, "_").replace(/(^\w|_\w)/g, function(txt) {
						// 	return txt.charAt(txt.length == 1 ? 0 : 1).toUpperCase();
						// });
						if (!(ID in seenLambdaResourceNames)) {
							seenLambdaResourceNames[ID] = {
								count: 0,
								paths: []
							}
						}
						seenLambdaResourceNames[ID].count++;
						seenLambdaResourceNames[ID].paths.push(file);

						const existing = cloudFormation.Resources[ID];
						filePackage = merge({
							config: {
								leo: {
									stacks: []
								}
							}
						}, filePackage);

						if (microservice.config && microservice.config.leo && microservice.config.leo.stacks) {
							filePackage.config.leo.stacks = filePackage.config.leo.stacks.concat(microservice.config.leo.stacks);
						}

						if (filePackage.config.leo.skip === true) {
							return;
						}

						// TODO: this was for old config merging
						let mergedConfig = buildConfig(file, null, filePackage);

						if (mergedConfig && mergedConfig.isVariation && mergedConfig.cron) {
							if (!mergedConfig.variationUsesTime)
								delete mergedConfig.cron.time;
							if (!mergedConfig.variationUsesTriggers)
								delete mergedConfig.cron.triggers;
						}
						filePackage.config.leo = mergedConfig;



						let version = filePackage.version;
						let botDirName = file.replace(/^.*(?:bots|api)[/\\](.*)[\\/]package\.json$/, "$1").replace(/\//g, "\\");
						// console.log(opts.force, file, botDirName)
						if (opts.force === "all" ||
							(opts.force && opts.force.replace && opts.force.replace(/[^a-zA-Z0-9]/g, '') === ID) ||
							(opts.force && opts.force.replace && opts.force.replace(/[^a-zA-Z0-9]/g, '') === packageName) ||
							(opts.force && opts.force.replace(/\//g, "\\") === botDirName)) {
							version += "." + (buildInfo.build || Date.now());
						}
						const newPath = `${microservice.name}${opts.tag}/${microservice.version}/${ID}_${version}.zip`;
						const existingPath = existing && existing.Properties.Code.S3Key.replace && existing.Properties.Code.S3Key || '';


						let entryData = createLambdaEntry(existing, filePackage, newPath, file, cloudFormation.Parameters, ID);
						if (entryData) {
							let prev_version = existingPath.replace(new RegExp(`${microservice.name}/.*?/${ID}_`), '').replace('.zip', '');
							let prev_versionCmp = prev_version.split(".").map(a => `             ${a}`.slice(-13)).join(".");
							let versionCmp = version.split(".").map(a => `             ${a}`.slice(-13)).join(".");
							if (prev_versionCmp < versionCmp || existingPath.indexOf(`${microservice.name}${opts.tag}/${microservice.version}/`) === -1) {
								entries.push({
									basename: `${ID}_${version}.zip`,
									file: path.dirname(file),
									version: version,
									prev_version: prev_version
								});
								cloudFormation.Resources[ID] = entryData;
							}
						}

						if (mergedConfig.type == "resource") {
							let swagger = getSwagger(cloudFormation, microservice);
							createApiEntries(ID, swagger, filePackage);

							cloudFormation.Resources[ID + "GatewayPermission"] = {
								"Type": "AWS::Lambda::Permission",
								"Properties": {
									"FunctionName": {
										"Ref": ID
									},
									"Action": "lambda:InvokeFunction",
									"Principal": "apigateway.amazonaws.com",
									"SourceArn": {
										"Fn::Sub": "arn:aws:execute-api:${AWS::Region}:${AWS::AccountId}:${RestApi}/*"
									}
								}
							};
						}

						addStacks(filePackage, cloudFormation, opts.linkedStacks);

						let leoStack = findLeoStack(cloudFormation.Parameters);
						//console.log("Leo Stack", leoStack)
						if (mergedConfig.type !== "resource" && leoStack && filePackage.config && filePackage.config.leo && filePackage.config.leo.cron && typeof filePackage.config.leo.cron !== "string") {
							if (cloudFormation.Resources[ID]) {
								filePackage.config.leo.cron.lambdaName = filePackage.config.leo.cron.lambdaName || {
									"Ref": ID
								};
							}
							let registerResourceName = "LeoRegister";
							if (filePackage.config.leo.register === "individual") {
								registerResourceName = ID + registerResourceName;
							} else if (filePackage.config.leo.register) {
								registerResourceName = filePackage.config.leo.register + registerResourceName;
							}
							cloudFormation.Resources[registerResourceName] = merge({}, cloudFormation.Resources[registerResourceName], {
								"Type": "Custom::Install",
								"Properties": {
									"ServiceToken": {
										"Fn::ImportValue": {
											"Fn::Sub": `\${${leoStack}}-Register`
										}
									}
								},
							});
							cloudFormation.Resources[registerResourceName].Properties[ID] = Object.assign({
								id: filePackage.config.leo.id || filePackage.name || {
									"Fn::Sub": `\${${ID}.Arn}`
								}
							}, filePackage.config.leo.cron);
							if (cloudFormation.Resources[registerResourceName].Properties[ID].lambdaName === null) {
								delete cloudFormation.Resources[registerResourceName].Properties[ID].lambdaName;
							}
						}

					});

					let dups = Object.entries(seenLambdaResourceNames).filter(([key, value]) => value.count > 1).map(([key, value]) => `${key}:\n\t${value.paths.join("\n\t")}\n`);
					if (dups.length) {
						console.log(`Duplicate Cloudformation Resource(s): \n${dups.join('\n')}`);
						process.exit();
					}

					// Add LeoStack policy to ApiRole if needed
					let leoStack = findLeoStack(cloudFormation.Parameters);
					if (leoStack) {
						let p = cloudFormation.Resources.ApiRole.Properties.ManagedPolicyArns || [];
						let addLeoPolicy = true;
						let leoPolicy = {
							"Fn::ImportValue": {
								"Fn::Sub": `\${${leoStack}}-Policy`
							}
						};
						let stringVersion = JSON.stringify(leoPolicy);
						p.map(policy => {
							addLeoPolicy = addLeoPolicy && JSON.stringify(policy) != stringVersion;
						});

						if (addLeoPolicy) {
							p.push(leoPolicy);
						}
						cloudFormation.Resources.ApiRole.Properties.ManagedPolicyArns = p;
					}
					//let leoAuthStack = !!(cloudFormation.Parameters && cloudFormation.Parameters["leoauth"]);
					let leoAuthStack = findLeoAuthStack(cloudFormation.Parameters);
					if (leoAuthStack) {
						let p = cloudFormation.Resources.ApiRole.Properties.ManagedPolicyArns || [];
						let addLeoAuthPolicy = true;
						let leoAuthPolicy = {
							"Fn::ImportValue": {
								"Fn::Sub": `\${${leoAuthStack}}-Policy`
							}
						};
						let stringVersion = JSON.stringify(leoAuthPolicy);
						p.map(policy => {
							addLeoAuthPolicy = addLeoAuthPolicy && JSON.stringify(policy) != stringVersion;
						});
						if (addLeoAuthPolicy) {
							p.push(leoAuthPolicy);
						}
						cloudFormation.Resources.ApiRole.Properties.ManagedPolicyArns = p;
					}


					let hasNewDeployment = false;
					// If there isn't an ui to deploy don't make a restapi
					if (!((microservice.config && microservice.config.leo && microservice.config.leo.subtype) || (cloudFormation.Resources.RestApi && cloudFormation.Resources.RestApi.Properties.Body))) {
						delete cloudFormation.Resources.RestApi;
					} else {
						if (cloudFormation.Resources.RestApi.Properties.Body) {
							cloudFormation.Resources.RestApi.Properties.Body.info.version = microservice.version;
						}
						cloudFormation.Resources.RestApi.Properties.Name = {
							"Fn::Sub": "${AWS::StackName}-" + microservice.name
						};
						cloudFormation.Resources.RestApi.Properties.Description = microservice.description || microservice.name;

						// // Only add a Deployment if the swagger def changes
						// let swaggerString = JSON.stringify(cloudFormation.Resources.RestApi.Properties.Body || {});
						// let prevSwaggerString = JSON.stringify(prevSwagger || {});
						// if (swaggerString !== prevSwaggerString) {
						// 	let dkey = "ApiDeployment" + Date.now();
						// 	hasNewDeployment = dkey;
						// 	cloudFormation.Resources[dkey] = {
						// 		Type: "AWS::ApiGateway::Deployment",
						// 		Properties: {
						// 			RestApiId: {
						// 				Ref: "RestApi"
						// 			},
						// 			StageName: "Release",
						// 			Description: `Version: ${microservice.version}`
						// 		}
						// 	};
						// }
					}

					let hasApp = false;
					if (microservice.config && microservice.config.leo && microservice.config.leo.subtype) {
						let ID = "ShowPages";
						let version = microservice.version.replace(/.\[0-9]{13}$/) + "." + (buildInfo.build || Date.now());
						if (opts.force === "all" ||
							opts.filter == "*" ||
							opts.filter == ID ||
							(opts.force && opts.force.replace && opts.force.replace(/[^a-zA-Z0-9]/g, '') === ID)) {
							//version += "." + Date.now();
							let data = cmds.createMicroserviceApp(dir, opts.config, version, {
								dir: buildDir,
								LogicalResourceId: ID
							});
							hasApp = data;
							let swagger = getSwagger(cloudFormation, microservice);
							Object.assign(swagger.paths, data.swagger.paths);

							const newPath = `${microservice.name}${opts.tag}/${microservice.version}/${data.LogicalResourceId}_${version}.zip`;
							cloudFormation.Resources[data.LogicalResourceId] = createLambdaEntry(cloudFormation.Resources[data.LogicalResourceId], {
								main: "index.js",
								config: {
									leo: {
										memory: 128,
										timeout: 3,
										type: "raw",
										env: microservice.config.leo.showPagesEnv
									}
								}
							}, newPath, "", cloudFormation.Parameters, data.LogicalResourceId);
							cloudFormation.Resources[data.LogicalResourceId + "GatewayPermission"] = {
								"Type": "AWS::Lambda::Permission",
								"Properties": {
									"FunctionName": {
										"Ref": data.LogicalResourceId
									},
									"Action": "lambda:InvokeFunction",
									"Principal": "apigateway.amazonaws.com",
									"SourceArn": {
										"Fn::Sub": "arn:aws:execute-api:${AWS::Region}:${AWS::AccountId}:${RestApi}/*"
									}
								}
							};
						}
					}

					// Only add a Deployment if the swagger def changes
					let swaggerString = JSON.stringify(cloudFormation.Resources.RestApi && cloudFormation.Resources.RestApi.Properties && cloudFormation.Resources.RestApi.Properties.Body || {});
					let prevSwaggerString = JSON.stringify(prevSwagger || {});
					if (swaggerString !== prevSwaggerString) {
						Object.keys(cloudFormation.Resources).map(k => {
							if (k.match(/^ApiDeployment[0-9]{13}/)) {
								delete cloudFormation.Resources[k];
							}
						});
						let dkey = "ApiDeployment" + (buildInfo.build || Date.now());
						hasNewDeployment = dkey;
						cloudFormation.Resources[dkey] = {
							Type: "AWS::ApiGateway::Deployment",
							Properties: {
								RestApiId: {
									Ref: "RestApi"
								},
								StageName: "Release",
								Description: `Version: ${microservice.version}`
							}
						};
					}


					///Now lets override with anything they have defined
					glob(path.resolve(path.resolve(dir, "*cloudformation/{,!(node_modules)/**/}" + `/*.js`)), {
						nodir: true
					}, function(err, files) {
						files.forEach(file => {
							let contents = require(file);
							merge(cloudFormation, contents.export ? contents.export() : contents);
						});

						let i = 1;
						console.log("\n\n\n----------------------Files with newer versions-----------------\n");
						entries.map(e => console.log(`${i++}. ${e.basename}  ${e.prev_version} -> ${e.version}`));
						if (hasNewDeployment) {
							console.log(`${i++}. ${hasNewDeployment}`);
						}
						if (hasApp) {
							console.log(`${i++}. ${hasApp.LogicalResourceId}_${hasApp.version}`);
						}
						console.log(`${i++}. cloudformation.json`);
						console.log(`\n\n${i - 1} file(s) will be updated\n`);
						console.log("If you don't see the files you expected, please update their version number or");
						console.log("rerun with the --force all OR --force [LambdaDirName] command\n");

						cmds.build(opts,
							dir, {
								buildDir: buildDir,
								lambdas: entries,
								cloudFormation: cloudFormation,
								alias: opts.alias,
								region: opts.region,
								cloudFormationOnly: opts.cloudFormationOnly,
								variations: opts.variations,
								s3Folder: `/${microservice.name}${opts.tag}/${version}`,
								info: buildInfo
							}, (err, data) => {
								if (!err && data) {
									let tasks = [];
									let summary = [];


									tasks.push(done => exportBuildInfo(dir, buildDir, cloudFormation, buildInfo, done));

									let publishjs = path.resolve(path.resolve(dir, "publish.js"));
									if (fs.existsSync(publishjs)) {
										tasks.push(done => require(publishjs)(buildDir, cloudFormation, done, buildInfo));
									} else {
										publishjs = path.resolve(path.resolve(dir, "build-hooks/publish.js"));
										if (fs.existsSync(publishjs)) {
											tasks.push(done => require(publishjs)(buildDir, cloudFormation, done, buildInfo));
										}
									}
									let deployedStatic = {};
									if (opts.publish !== false) {
										buckets.forEach((bucket) => {
											if (!opts.cloudFormationOnly && hasApp && !deployedStatic[bucket.target.s3]) {
												deployedStatic[bucket.target.s3] = true;
												tasks.push((done) => cmds.buildMicroserviceApp(dir, opts.config, hasApp.version, {
													dir: buildDir,
													files: hasApp.files,
													profile: profile,
													static: `${bucket.target.staticAssets}/${hasApp.version}/`,
													cloudFormationOnly: opts.cloudFormationOnly
												}, (err) => {
													done(err);
												}));
											}
											let s3region = bucket.region == "us-east-1" ? "" : "-" + bucket.region;
											summary.push({
												region: bucket.region,
												url: `https://s3${s3region}.amazonaws.com/${bucket.bucket}/${microservice.name}${opts.tag}/${version}/`,
												cloudFormation: cloudFormation,
												target: bucket.target,
												version: data
											});
											let profile = (bucket.target.leoaws && bucket.target.leoaws.config && bucket.target.leoaws.config.credentials && bucket.target.leoaws.config.credentials.profile);
											let isPublic = opts.public || bucket.target.public;
											if (isPublic != undefined && typeof isPublic === "object") {
												isPublic = isPublic[opts.tag || "default"] || false;
											}
											if (!opts.cloudFormationOnly) {
												tasks.push((done) => {
													if (isPublic) {
														console.log('Adding file with public access');
													}
													cmds.publish(buildDir, `s3://${bucket.bucket}/${microservice.name}${opts.tag}/${version}/`, {
														public: isPublic,
														profile: profile,
														aws: bucket.target.leoaws
													}, done);
												});
											} else { //we still need to publish this version of the cloudformation
												tasks.push((done) => {
													cmds.publish(path.resolve(buildDir, "cloudformation.json"), `s3://${bucket.bucket}/${microservice.name}${opts.tag}/${version}/cloudformation.json`, {
														public: isPublic,
														command: "cp",
														label: "Publishing cloudformation.json",
														profile: profile,
														aws: bucket.target.leoaws
													}, done);
												});
											}
											tasks.push((done) => {
												if (isPublic) {
													console.log('Adding file with public access');
												}
												cmds.publish(path.resolve(buildDir, "cloudformation.json"), `s3://${bucket.bucket}/${microservice.name}${opts.tag}/cloudformation-latest.json`, {
													public: isPublic,
													command: "cp",
													label: "Publishing Latest cloudformation.json",
													profile: profile,
													aws: bucket.target.leoaws
												}, done);
											});
										});
									}
									async.series(tasks, (err) => {
										if (err) return reject(err);

										if (opts.publish !== false) {
											fs.readdirSync(buildDir).forEach((file) => {
												fs.unlinkSync(path.resolve(buildDir, file));
											});

											fs.rmdirSync(buildDir);
										}
										resolve(summary);
									});
								} else {
									console.log("Error:", err || "Unknown");
									reject(err);
								}
							});
					});
				});
			});
		});
	},
	getBuckets: function(targets, opts, callback) {
		opts = merge({
			name: 'LEO-CLI',
			ignoreErrors: false
		}, opts || {});
		var tasks = [];

		let nonCriticalError = (err = {}, target, done) => {
			console.warn(`\nNon-critical Error: Unable to get publish buckets for stack ${opts.name} in region ${target.leoaws.region}. ${err.code}: '${err.message}'.\nContinuing with the build but the cloudformation.json will be missing the publish location.\n`);
			done(null, {
				stack: opts.name,
				region: target.leoaws.region,
				target: target,
				bucket: undefined
			});
		};
		targets.forEach(target => {
			tasks.push(function(done) {
				let cloudformation = target.leoaws.cloudformation;

				let extractData = (data) => {
					done(null, {
						stack: opts.name,
						region: target.leoaws.region,
						target: target,
						bucket: data.filter(r => r.LogicalResourceId == "PublishBucket")[0].PhysicalResourceId
					});
				}

				cloudformation.describeStackResources(opts.name).then(extractData).catch(err => {
					if (err.message == `Stack with id ${opts.name} does not exist`) {
						console.log(`We cannot find a CloudFormation stack with the name ${opts.name} in region ${target.leoaws.region}`);
						console.log(`Creating "${opts.name}" stack for region ${target.leoaws.region}`);
						return cloudformation.createStack(opts.name, require("../cloudformation.json"), [], true)
							.then(() => cloudformation.describeStackResources(opts.name).then(extractData))
							.catch(err => {
								if (opts.ignoreErrors) {
									return nonCriticalError(err, target, done);
								}
								console.log(`Error creating "${opts.name}" stack:`, err);
								console.log(`Talk with your administrator to create the ${opts.name} stack`);
								process.exit();
							});
					} else if (opts.ignoreErrors) {
						nonCriticalError(err, target, done);
					} else {
						console.log("Failure in cloudformation.describeStackResources");
						done(err);
					}
				});
			});
		});

		async.parallelLimit(tasks, 2, (err, results) => {
			err && console.log(err);
			callback(err, results);
		});
	}
};



function createLambdaEntry(existing, properties, newPath, file, parameters = {}, LogicalResourceId) {
	const lambdaTemplate = JSON.parse(fs.readFileSync(path.resolve(__dirname, "./cloud-formation/template/lambda.json")));

	const config = merge({
		build: {},
		stacks: []
	}, (properties && properties.config && properties.config.leo) || {});

	if (config.type == "cron-template") {
		// No lambda to create
		var visit = function(obj) {
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
		if (obj.settings.mappings == undefined && !obj.lambdaName) {
			obj.settings.mappings = "index.js";
		}
		visit(obj.settings);

		return undefined;
	}

	if (config.cron && config.cron.lambdaName === null) {
		return undefined;
	}
	var env = {};

	// Only add leo-sdk and leo-auth env variables if this is a third party
	if (config["3rdParty"]) {
		let hasLeoStack = findLeoStack(parameters);
		if (hasLeoStack && (!config.env || !("leosdk" in config.env))) {
			config.env = config.env || {};
			config.env["leosdk"] = {
				"Fn::LeoSdk": `\${${hasLeoStack}}`
			};
		}

		//let hasLeoAuthStack = config.stacks.filter(s => s.replace(/[^a-zA-z0-9]/g, "") == "leoauth").length;
		let hasLeoAuthStack = findLeoAuthStack(parameters);
		if (config.type == "resource" && hasLeoAuthStack && (!config.env || !("leoauthsdk" in config.env))) {
			config.env = config.env || {};
			config.env["leoauthsdk"] = {
				"Fn::LeoAuthSdk": `\${${hasLeoAuthStack}}`
			};
		}
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
							"LeoSystem": {
								"Fn::ImportValue": {
									"Fn::Sub": "$2-LeoSystem"
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
							"LeoSystem": "${LeoSystem}",
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
							"LeoSystem": {
								"Fn::ImportValue": {
									"Fn::Sub": "$2-LeoSystem"
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
								"LeoSystem": "${LeoSystem}",
								"LeoS3": "${LeoS3}",
								"LeoKinesisStream": "${LeoKinesisStream}",
								"LeoFirehoseStream": "${LeoFirehoseStream}",
								"Region": "${Region}"
							}
						});
						v = JSON.parse(t.replace(/"Fn::(LeoSdk)":"(\$\{.*?\})"/, `"Fn::Sub":[${JSON.stringify(sub)}, ${lookups}]`));
					}
					if (t.match(/"Fn::(LeoAuthSdk)":"(\$\{.*?\})"/)) {

						let lookups = JSON.stringify({
							"LeoAuth": {
								"Fn::ImportValue": {
									"Fn::Sub": "$2-LeoAuth"
								}
							},
							"LeoAuthUser": {
								"Fn::ImportValue": {
									"Fn::Sub": "$2-LeoAuthUser"
								}
							}
						});
						let sub = JSON.stringify({
							"region": "${AWS::Region}",
							"resources": {
								"LeoAuth": "${LeoAuth}",
								"LeoAuthUser": "${LeoAuthUser}",
								"Region": "${AWS::Region}"
							}
						});
						v = JSON.parse(t.replace(/"Fn::(LeoAuthSdk)":"(\$\{.*?\})"/, `"Fn::Sub":[${JSON.stringify(sub)}, ${lookups}]`));
					}
					wrap = false;
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

	if (parameters.Environment) {
		env["NODE_ENV"] = {
			"Fn::Sub": "${Environment}"
		};
	}

	var formation = merge({}, lambdaTemplate, existing, {
		Properties: {
			FunctionName: config.staticFunctionNames ? {"Fn::Sub":`\${AWS::StackName}-${LogicalResourceId}`} : undefined,
			Code: config.code || lambdaTemplate.Properties.Code,
			Description: properties.description,
			Handler: properties.main.replace(/.js/, '') + "." + (properties.config.leo.handler || 'handler'),
			MemorySize: config.memory || undefined,
			Timeout: config.timeout || undefined,
			Runtime: config.runtime || undefined,
			Environment: {
				Variables: env
			},
			VpcConfig: config.VpcConfig
		},
		DependsOn: config.DependsOn
	});
	let role = config.role || (config.aws && config.aws.role);
	if (role) {
		if (typeof role === "string" && !role.match(/^arn:aws:iam::/)) {
			role = {
				"Fn::Sub": `\${${role}.Arn}`
			};
		}
		formation.Properties.Role = role;
	}
	formation.Properties.Code.S3Key = newPath;
	return formation;
}

function createApiEntries(ID, swagger, properties) {
	const config = merge({}, (properties && properties.config && properties.config.leo) || {});
	//const alias = "dev";
	if (!Array.isArray(config.uri)) {
		config.uri = [config.uri];
	}

	for (var i = 0; i < config.uri.length; i++) {
		//console.log(config.uri)
		var parts = config.uri[i].split(/:/);
		var method = parts.slice(0, 1)[0].toLowerCase();
		if (method == "any") {
			method = "x-amazon-apigateway-any-method";
		}
		var resource = parts.slice(1).join(":");
		if (!(resource in swagger.paths)) {
			swagger.paths[resource] = {};
		}
		var snippet = swagger.paths[resource];
		snippet[method] = {
			"produces": [
				"application/json"
			],
			"security": [{
				"sigv4": []
			}],

			"responses": {
				"200": {
					"description": "200 response",
					"schema": {
						"$ref": "#/definitions/Empty"
					},
					"headers": {
						"Access-Control-Allow-Origin": {
							"type": "string"
						}
					}
				}
			},
			"x-amazon-apigateway-integration": {
				"responses": {
					"default": {
						"statusCode": "200",
					}
				},
				"uri": {
					"Fn::Sub": `arn:aws:apigateway:\${AWS::Region}:lambda:path/2015-03-31/functions/\${${ID}.Arn}/invocations`
				},
				"passthroughBehavior": "when_no_match",
				"httpMethod": "POST",
				"contentHandling": "CONVERT_TO_TEXT",
				"type": "aws_proxy"
			}
		};
		if (config.secure === false) {
			delete snippet[method].security;
		}
		if (config.cors) {
			snippet[method]["x-amazon-apigateway-integration"].responses.default.responseParameters = {
				"method.response.header.Access-Control-Allow-Origin": "'" + config.cors + "'"
			};

			snippet.options = {
				"consumes": [
					"application/json"
				],
				"produces": [
					"application/json"
				],
				"responses": {
					"200": {
						"description": "200 response",
						"schema": {
							"$ref": "#/definitions/Empty"
						},
						"headers": {
							"Access-Control-Allow-Origin": {
								"type": "string"
							},
							"Access-Control-Allow-Methods": {
								"type": "string"
							},
							"Access-Control-Max-Age": {
								"type": "string"
							},
							"Access-Control-Allow-Headers": {
								"type": "string"
							}
						}
					}
				},
				"x-amazon-apigateway-integration": {
					"responses": {
						"default": {
							"statusCode": "200",
							"responseParameters": {
								"method.response.header.Access-Control-Max-Age": "'3000'",
								"method.response.header.Access-Control-Allow-Methods": "'" + (method == "any" || method == "x-amazon-apigateway-any-method" ? "DELETE, GET, HEAD, OPTIONS, PATCH, POST, PUT" : method.toUpperCase()) + ",OPTIONS'",
								"method.response.header.Access-Control-Allow-Headers": "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'",
								"method.response.header.Access-Control-Allow-Origin": "'" + config.cors + "'"
							}
						}
					},
					"requestTemplates": {
						"application/json": "{\"statusCode\": 200}"
					},
					"passthroughBehavior": "when_no_match",
					"type": "mock"
				}
			};
		}
	}
}

let leoStackAliases = {
	"leosdk": true,
	"leobus": true,
	"bus": true
};
let leoAuthStackAliases = {
	"leoauth": true,
	"auth": true
};


function findStack(parameters, aliases) {
	return Object.keys(parameters).filter(key => aliases[key.replace(/[^a-zA-z0-9]/g, "").toLowerCase()])[0];
}

function findLeoStack(parameters = {}) {
	return findStack(parameters, leoStackAliases);
}

function findLeoAuthStack(parameters = {}) {
	return findStack(parameters, leoAuthStackAliases);
}



function addStacks(filePackage, cloudFormation, additionalStacks) {
	let stacks = (filePackage.config && filePackage.config.leo && filePackage.config.leo.stacks) || [];
	stacks = stacks.concat(additionalStacks || []);
	if (stacks.length) {
		cloudFormation.Parameters = cloudFormation.Parameters || {};
	}

	stacks.map(stack => {
		let stackName = stack.replace(/[^a-zA-z0-9]/g, "");
		if (!(stackName in cloudFormation.Parameters)) {
			cloudFormation.Parameters[stackName] = {
				"Type": "String",
				"Description": `Reference to the "${stack}" stack`
			};
		}
	});
}

function getSwagger(cloudFormation, microservice) {
	return cloudFormation.Resources.RestApi.Properties.Body = cloudFormation.Resources.RestApi && cloudFormation.Resources.RestApi.Properties.Body || {
		"swagger": "2.0",
		"info": {
			"version": `${microservice.version}`,
			"title": microservice.name
		},
		"basePath": "/",
		"schemes": ["https"],
		"paths": {

		},
		"securityDefinitions": {
			"sigv4": {
				"type": "apiKey",
				"name": "Authorization",
				"in": "header",
				"x-amazon-apigateway-authtype": "awsSigv4"
			}
		},
		"definitions": {
			"Empty": {
				"type": "object"
			}
		}
	};
}


function exportBuildInfo(rootDir, buildDir, newCloudformation, info, done){

	let buildSuffix = "";
	if (info.build) {
		buildSuffix = `-${info.build}`;
	}

	// Add Build info to outputs
	console.log("Build Info:", JSON.stringify(info, null, 2));

	let artifactDir = path.resolve(rootDir, ".artifacts");
	if (!fs.existsSync(artifactDir)) {
		fs.mkdirSync(artifactDir);
	}

	// Create Deployment config files
	let cliConfig = require("../leoCliConfigure.js")();
	let regions = newCloudformation.Mappings.RegionMap;
	Object.keys(cliConfig.deploy || {}).forEach(env => {
		let envConfig = cliConfig.deploy[env];
		let Parameters = [].concat(Object.keys(newCloudformation.Parameters || {}).map(key => {
			let value = envConfig.parameters[key];
			if (value == null && key === "Environment") {
				value = env;
			}

			if (typeof value.NoEcho !== "undefined") {
				value = value.value;
			}
			return {
				ParameterKey: key,
				ParameterValue: value
			};
		}));

		// Only need one region.  The others will have the resources but the Region map will make that work
		let region = Object.keys(regions)[0];
		let s3region = region == "us-east-1" ? "" : "-" + region;
		let regionBucket = regions[region].S3Bucket;

		let data = {
			"StackName": envConfig.stack,
			"TemplateURL": `https://s3${s3region}.amazonaws.com/${regionBucket}${info.s3Folder}/cloudformation${buildSuffix}.json`,
			"Parameters": Parameters,
			"Capabilities": [
				"CAPABILITY_NAMED_IAM"
			]
		};

		fs.writeFileSync(path.resolve(artifactDir, `${env}-deploy-info.json`), JSON.stringify(data, null, 2));
		fs.writeFileSync(path.resolve(artifactDir, `${env}-deploy-stack-name.json`), JSON.stringify({ StackName: envConfig.stack }, null, 2));
	});

	fs.writeFileSync(path.resolve(artifactDir, "info-key-values.txt"), Object.keys(info).map(k => `${k}=${info[k]}`).join("\n"));
	fs.writeFileSync(path.resolve(artifactDir, "info.json"), JSON.stringify(info, null, 2));

	done();
}
