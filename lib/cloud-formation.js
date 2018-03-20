const glob = require("glob");
const path = require("path");
const fs = require("fs");
const merge = require('lodash.merge');
const aws = require("aws-sdk");
const async = require("async");

var cmds = require("./build.js")
var buildConfig = require("./build-config").build;

module.exports = {
	createCloudFormation: function(dir, opts, callback) {
		return new Promise((resolve, reject) => {
			opts = Object.assign({
				config: undefined,
				force: false,
				regions: ["us-west-2", 'us-east-1'],
				profile: null,
				public: false,
				filter: "*",
				cloudformation: undefined,
				overrideCloudFormationFile: true,
				tag: undefined
			}, opts || {});
			if (!Array.isArray(opts.regions)) {
				if (opts.regions.split) {
					opts.regions = opts.regions.split(/,/);
				} else {
					opts.regions = [opts.regions];
				}
			}
			opts.filter = opts.filter || "*";
			opts.tag = (opts.tag ? (opts.tag.match(/^[\/\\]/) ? opts.tag : `/${opts.tag}`) : "").replace(/\\/g, "/");

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

					cloudFormation.Resources = Object.assign(cloudFormation.Resources, microservice.config && microservice.config.leo && microservice.config.leo.Resources || {});
					cloudFormation.Parameters = Object.assign({}, cloudFormation.Parameters, microservice.config && microservice.config.leo && microservice.config.leo.Parameters || {});

					let scalable = function(tableName, throughput, type) {
						let targetCapacity = throughput[`Target${type}Capacity`];
						if (typeof targetCapacity == "number") {
							targetCapacity = {
								TargetValue: targetCapacity
							};
						}

						let scalableTargetId = `${tableName}${type}CapacityScalableTarget`;
						let scalableTarget = {
							Type: "AWS::ApplicationAutoScaling::ScalableTarget",
							Properties: {
								MaxCapacity: throughput[`Max${type}CapacityUnits`] || throughput[`${type}CapacityUnits`],
								MinCapacity: throughput[`Min${type}CapacityUnits`] || throughput[`${type}CapacityUnits`],
								ResourceId: {
									"Fn::Sub": `table/\${${tableName}}`,
								},
								RoleARN: {
									"Fn::Sub": "${ScalingRole.Arn}"
								},
								"ScalableDimension": `dynamodb:table:${type}CapacityUnits`,
								"ServiceNamespace": "dynamodb"
							}
						};

						let policyId = `${tableName}${type}AutoScalingPolicy`;
						let scalePolicy = {
							Type: "AWS::ApplicationAutoScaling::ScalingPolicy",
							Properties: {
								PolicyName: policyId,
								PolicyType: "TargetTrackingScaling",
								ScalingTargetId: {
									Ref: scalableTargetId
								},
								TargetTrackingScalingPolicyConfiguration: Object.assign({
									TargetValue: 70.0,
									PredefinedMetricSpecification: {
										PredefinedMetricType: `DynamoDB${type}CapacityUtilization`
									}
								}, targetCapacity)
							}
						};
						return {
							targetId: scalableTargetId,
							target: scalableTarget,
							policyId: policyId,
							policy: scalePolicy
						}
					}

					let autoScaleRole;
					let autoScaleTargets = [];
					Object.keys(cloudFormation.Resources).map(k => {
						let resource = cloudFormation.Resources[k];
						if (resource.Type == "AWS::DynamoDB::Table") {
							let throughput = resource.Properties && resource.Properties.ProvisionedThroughput || {};
							if (throughput.MinReadCapacityUnits || throughput.MaxReadCapacityUnits) {
								let d = scalable(k, throughput, "Read");
								cloudFormation.Resources[d.targetId] = d.target;
								cloudFormation.Resources[d.policyId] = d.policy;
								autoScaleTargets.push(d.target);
								throughput.ReadCapacityUnits = throughput.ReadCapacityUnits || d.target.MinCapacity
							};

							if (throughput.MinReadCapacityUnits || throughput.MaxReadCapacityUnits) {
								let d = scalable(k, throughput, "Write");
								cloudFormation.Resources[d.targetId] = d.target;
								cloudFormation.Resources[d.policyId] = d.policy;
								autoScaleTargets.push(d.target);
								throughput.WriteCapacityUnits = throughput.WriteCapacityUnits || d.target.MinCapacity
							}
							resource.Properties.ProvisionedThroughput = {
								ReadCapacityUnits: throughput.ReadCapacityUnits,
								WriteCapacityUnits: throughput.WriteCapacityUnits
							}
						} else if (resource.Type == "AWS::IAM::Role") {
							// Check for auto scaling service
							autoScaleRole = autoScaleRole || (resource.Properties.AssumeRolePolicyDocument.Statement.reduce((a, b) => {
								return b.Principal != undefined && b.Principal.Service.indexOf("application-autoscaling.amazonaws.com") >= 0
							}, false) && k);
						}
					});

					if (autoScaleTargets.length) {
						if (!autoScaleRole) {
							cloudFormation.Resources.AutoScalingRole = {
								"Type": "AWS::IAM::Role",
								"Properties": {
									"AssumeRolePolicyDocument": {
										"Version": "2012-10-17",
										"Statement": [{
											"Effect": "Allow",
											"Principal": {
												"Service": [
													"application-autoscaling.amazonaws.com"
												]
											},
											"Action": [
												"sts:AssumeRole"
											]
										}]
									},
									"Path": "/",
									"Policies": [{
										"PolicyName": "root",
										"PolicyDocument": {
											"Version": "2012-10-17",
											"Statement": [{
												"Effect": "Allow",
												"Action": [
													"dynamodb:DescribeTable",
													"dynamodb:UpdateTable",
													"cloudwatch:PutMetricAlarm",
													"cloudwatch:DescribeAlarms",
													"cloudwatch:GetMetricStatistics",
													"cloudwatch:SetAlarmState",
													"cloudwatch:DeleteAlarms"
												],
												"Resource": "*"
											}]
										}
									}]
								}
							};
						} else { //if (autoScaleRole != "AutoScalingRole") {
							autoScaleTargets.map(t => {
								t.Properties.RoleARN = {
									"Fn::Sub": `\${${autoScaleRole}.Arn}`
								}
							})
						}
					}
				}

				//microservice.version += "." + Date.now()
				let version = microservice.version;
				let buildDir = `/tmp/${microservice.name}-${version}`;

				for (var key in buckets) {
					let data = buckets[key];
					cloudFormation.Mappings.RegionMap = Object.assign({}, cloudFormation.Mappings.RegionMap, {
						[data.region]: {
							"S3Bucket": data.bucket
						}
					});
				}

				let thirdparty = microservice.config && microservice.config.leo && microservice.config.leo["3rdParty"];

				//if (thirdparty) {
				addStacks(microservice, cloudFormation)
				//}


				console.log(path.resolve(dir, "*(bots|api)/{,!(node_modules)/**/}" + `/${opts.filter}/package.json`));
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
							leo.variations.forEach(v => {
								let name = v.name ? pkg.name + "-var-" + v.name : pkg.name;
								delete v.name;
								let newPackage = merge({
									config: {
										leo: {
											isVariation: true
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
						var package;
						if (file.package) {
							package = file.package;
							file = file.file;
						} else {
							package = JSON.parse(fs.readFileSync(file));
						}



						const packageName = package.name.replace(/[^a-zA-Z0-9]/g, '');
						const ID = package.logicalResource || package.name.replace(/[^a-zA-Z0-9]+/g, "_").replace(/(^\w|_\w)/g, function(txt) {
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

						if (package.config.leo.skip === true) {
							return;
						}

						// TODO: this was for old config merging
						let mergedConfig = buildConfig(file, null, package);
						if (mergedConfig && mergedConfig.isVariation) {
							delete mergedConfig.cron.time;
							delete mergedConfig.cron.triggers;
						}
						package.config.leo = mergedConfig;



						let version = package.version;
						let botDirName = file.replace(/^.*(?:bots|api)[/\\](.*)[\\/]package\.json$/, "$1").replace(/\//g, "\\");
						// console.log(opts.force, file, botDirName)
						if (opts.force === "all" ||
							(opts.force && opts.force.replace && opts.force.replace(/[^a-zA-Z0-9]/g, '') === ID) ||
							(opts.force && opts.force.replace && opts.force.replace(/[^a-zA-Z0-9]/g, '') === packageName) ||
							(opts.force && opts.force.replace(/\//g, "\\") === botDirName)) {
							version += "." + Date.now();
						}
						const newPath = `${microservice.name}${opts.tag}/${microservice.version}/${ID}_${version}.zip`;
						const existingPath = existing && existing.Properties.Code.S3Key.replace && existing.Properties.Code.S3Key || '';


						let entryData = createLambdaEntry(existing, package, newPath, file);
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
							createApiEntries(ID, swagger, package);

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
							}
						}

						//if (thirdparty) {
						addStacks(package, cloudFormation)
						//}

						let leoStack = !!(cloudFormation.Parameters && cloudFormation.Parameters["leosdk"]);
						//console.log("Leo Stack", leoStack)
						if (mergedConfig.type !== "resource" && leoStack && package.config && package.config.leo && package.config.leo.cron && typeof package.config.leo.cron !== "string") {
							if (cloudFormation.Resources[ID]) {
								package.config.leo.cron.lambdaName = package.config.leo.cron.lambdaName || {
									"Ref": ID
								}
							}
							let registerResourceName = "LeoRegister";
							if (package.config.leo.register === "individual") {
								registerResourceName = ID + registerResourceName;
							}
							cloudFormation.Resources[registerResourceName] = merge({}, cloudFormation.Resources[registerResourceName], {
								"Type": "Custom::Install",
								"Properties": {
									"ServiceToken": {
										"Fn::ImportValue": {
											"Fn::Sub": "${leosdk}-Register"
										}
									}
								},
							});
							cloudFormation.Resources[registerResourceName].Properties[ID] = Object.assign({
								id: package.config.leo.id || package.name || {
									"Fn::Sub": `\${${ID}.Arn}`
								}
							}, package.config.leo.cron);
							if (cloudFormation.Resources[registerResourceName].Properties[ID].lambdaName === null) {
								delete cloudFormation.Resources[registerResourceName].Properties[ID].lambdaName;
							}
						}

					});

					// Add LeoStack policy to ApiRole if needed
					let leoStack = !!(cloudFormation.Parameters && cloudFormation.Parameters["leosdk"]);
					if (leoStack) {
						let p = cloudFormation.Resources.ApiRole.Properties.ManagedPolicyArns || [];
						let addLeoPolicy = true;
						let leoPolicy = {
							"Fn::ImportValue": {
								"Fn::Sub": "${leosdk}-Policy"
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
					let leoAuthStack = !!(cloudFormation.Parameters && cloudFormation.Parameters["leoauth"]);
					if (leoAuthStack) {
						let p = cloudFormation.Resources.ApiRole.Properties.ManagedPolicyArns || [];
						let addLeoAuthPolicy = true;
						let leoAuthPolicy = {
							"Fn::ImportValue": {
								"Fn::Sub": "${leoauth}-Policy"
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
						let version = microservice.version.replace(/.\[0-9]{13}$/) + "." + Date.now();
						if (opts.force === "all" ||
							opts.filter == "*" ||
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
							}, newPath);
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
							}
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
						let dkey = "ApiDeployment" + Date.now();
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
							region: opts.region
						}, (err, data) => {
							if (!err && data) {
								let tasks = [];
								let summary = [];

								if (hasApp) {
									tasks.push((done) => cmds.buildMicroserviceApp(dir, opts.config, hasApp.version, {
										dir: buildDir,
										files: hasApp.files,
										static: `${opts.config.static.s3}${opts.config.name.toLowerCase()}/${hasApp.version}/`
									}, (err, data) => {
										done(err)
									}));
								}


								let publishjs = path.resolve(path.resolve(dir, "publish.js"));
								if (fs.existsSync(publishjs)) {
									tasks.push(done => require(publishjs)(buildDir, cloudFormation, done));
								}

								if (opts.publish !== false) {
									buckets.forEach((bucket) => {

										let s3region = bucket.region == "us-east-1" ? "" : "-" + bucket.region;
										summary.push({
											region: bucket.region,
											url: `https://s3${s3region}.amazonaws.com/${bucket.bucket}/${microservice.name}${opts.tag}/${version}/`,
											cloudFormation: cloudFormation
										});
										tasks.push((done) => {
											cmds.publish(buildDir, `s3://${bucket.bucket}/${microservice.name}${opts.tag}/${version}/`, {
												public: opts.public
											}, done);
										});
										tasks.push((done) => {
											cmds.publish(path.resolve(buildDir, "cloudformation.json"), `s3://${bucket.bucket}/${microservice.name}${opts.tag}/cloudformation-latest.json`, {
												public: opts.public,
												command: "cp",
												label: "Publishing Latest cloudformation.json"
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
	run: function(stack, region, file, opts) {
		return new Promise((resolve, reject) => {
			var cloudformation = new aws.CloudFormation({
				region: region,
				credentials: require("./leo-aws")(process.env.LEO_AWS_PROFILE)
			});

			let updateOpts = Object.assign({}, opts);
			if (updateOpts.Parameters) {
				updateOpts.Parameters = updateOpts.Parameters.map(param => ({
					ParameterKey: param.ParameterKey,
					UsePreviousValue: param.UsePreviousValue
				}));
			}
			cloudformation.updateStack(Object.assign({
				StackName: stack,
				TemplateURL: file,
				Capabilities: [
					"CAPABILITY_IAM",
				]
			}, updateOpts), (err, data) => {
				if (err) {
					if (err.message === `Stack [${stack}] does not exist`) {
						// Create Stack
						createStack(stack, file, region, opts, (err, data) => {
							if (err) {
								reject(err);
							} else {
								resolve(data)
							}
						})
					} else {
						reject(err);
					}
				} else {
					setTimeout(function() {
						cloudformation.api.waiters["stackUpdateComplete"].delay = 10;
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
	get: function(stack, region, opts) {
		return new Promise((resolve, reject) => {
			var cloudformation = new aws.CloudFormation({
				region: region,
				credentials: require("./leo-aws")(process.env.LEO_AWS_PROFILE)
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
	},
	getBuckets: getBuckets
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
					region: region,
					credentials: require("./leo-aws")(process.env.LEO_AWS_PROFILE)
				});
				cloudformation.describeStackResources({
					StackName: opts.name
				}, function(err, data) {
					if (err) {
						if (err.message == `Stack with id ${opts.name} does not exist`) {
							console.log(`We cannot find a CloudFormation stack with the name ${opts.name} in region ${region}`);
							console.log(`Creating "${opts.name}" stack for region ${region}`);
							// console.log(`Please run the cloudformation.json file for the region ${region} or specify on the command line which regions to use --region us-west-2,us-east-1`);
							createStack(opts.name, require("../cloudformation.json"), region, (err, data) => {
								if (err) {
									console.log(`Error creating "${opts.name}" stack:`, err);
									console.log(`Talk with your administrator to create the ${opts.name} stack`);
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



function createStack(name, template, region, opts, done) {
	if (typeof opts === "function") {
		done = opts;
		opts = {};
	}

	var overridePrompts = {
		"leosdk": "Leo Bus Stack Name: ",
		"leoauth": "Leo Auth Stack Name: "
	};

	var parameterValues;
	if (opts.Parameters) {
		let prompt = require("prompt-sync")();
		console.log("\n");
		parameterValues = opts.Parameters.map(param => {
			let p = overridePrompts[param.ParameterKey] || `Stack Parameter "${param.ParameterKey}": `;
			return {
				ParameterKey: param.ParameterKey,
				ParameterValue: prompt(p),
				NoEcho: param.NoEcho
			}
		});

	}

	var cloudformation = new aws.CloudFormation({
		region: region,
		credentials: require("./leo-aws")(process.env.LEO_AWS_PROFILE)
	});

	let templateBody;
	if (typeof template === "string") {
		templateBody = "TemplateURL";
	} else {
		templateBody = "TemplateBody";
		template = JSON.stringify(template);
	}
	cloudformation.createStack({
		StackName: name,
		Capabilities: [
			"CAPABILITY_IAM"
		],
		OnFailure: "DELETE",
		[templateBody]: template,
		Parameters: parameterValues
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
			}, function(err, data) {
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
		if (obj.settings.mappings == undefined) {
			obj.settings.mappings = "index.js"
		}
		visit(obj.settings);

		return undefined;
	}

	if (config.cron && config.cron.lambdaName === null) {
		return undefined;
	}
	var env;

	// Only add leo-sdk and leo-auth env variables if this is a third party
	if (config["3rdParty"]) {
		let hasLeoStack = config.stacks.filter(s => s.replace(/[^a-zA-z0-9]/g, "") == "leosdk").length;
		if (hasLeoStack && (!config.env || !("leosdk" in config.env))) {
			config.env = config.env || {};
			config.env["leosdk"] = {
				"Fn::LeoSdk": "${leosdk}"
			};
		}

		let hasLeoAuthStack = config.stacks.filter(s => s.replace(/[^a-zA-z0-9]/g, "") == "leoauth").length;
		if (config.type == "resource" && hasLeoAuthStack && (!config.env || !("leoauthsdk" in config.env))) {
			config.env = config.env || {};
			config.env["leoauthsdk"] = {
				"Fn::LeoAuthSdk": "${leoauth}"
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

						//v = JSON.parse(t.replace(/"Fn::(LeoSdk)":"(\$\{.*?\})"/, '"Fn::Sub":"{\\"region\\":\\"$2-Region\\",\\"kinesis\\":\\"$2-LeoKinesisStream\\", \\"s3\\":\\"$2-LeoS3\\",  \\"firehose\\":\\"$2-LeoFirehoseStream\\", \\"resources\\": {\\"LeoStream\\": \\"$2-LeoStream\\",\\"LeoCron\\": \\"$2-LeoCron\\", \\"LeoEvent\\": \\"$2-LeoEvent\\", \\"LeoSettings\\": \\"$2-LeoSettings\\",\\"LeoS3\\": \\"$2-LeoS3\\", \\"LeoKinesisStream\\": \\"$2-LeoKinesisStream\\", \\"LeoFirehoseStream\\": \\"$2-LeoFirehoseStream\\", \\"Region\\": \\"$2-Region\\"}} "'))
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
			},
			VpcConfig: config.VpcConfig
		}
	});
	let role = config.role || (config.aws && config.aws.role);
	if (role) {
		if (typeof role === "string" && !role.match(/^arn:aws:iam::/)) {
			role = {
				"Fn::Sub": `\${${role}.Arn}`
			}
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
								"method.response.header.Access-Control-Allow-Methods": "'" + (method == "any" ? "DELETE, GET, HEAD, OPTIONS, PATCH, POST, PUT" : method.toUpperCase()) + ",OPTIONS'",
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
