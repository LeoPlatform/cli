module.exports = {
	"Parameters": {
		"AlarmEmail": {
			"Description": "Email address to notify if operational problems arise",
			"Type": "String"
		}
	},
	"Resources": {
		"MyQueue": {
			"Type": "AWS::SQS::Queue",
			"Properties": {
				"QueueName": "SQS_____DIRNAME____"
			}
		},
		"AlarmTopic": {
			"Type": "AWS::SNS::Topic",
			"Properties": {
				"Subscription": [{
					"Endpoint": {
						"Ref": "AlarmEmail"
					},
					"Protocol": "email"
				}]
			}
		},
		"QueueDepthAlarm": {
			"Type": "AWS::CloudWatch::Alarm",
			"Properties": {
				"AlarmDescription": "Alarm if queue depth grows beyond 10 messages",
				"Namespace": "AWS/SQS",
				"MetricName": "ApproximateNumberOfMessagesVisible",
				"Dimensions": [{
					"Name": "QueueName",
					"Value": {
						"Fn::GetAtt": ["MyQueue", "QueueName"]
					}
				}],
				"Statistic": "Sum",
				"Period": "300",
				"EvaluationPeriods": "1",
				"Threshold": "10",
				"ComparisonOperator": "GreaterThanThreshold",
				"AlarmActions": [{
					"Ref": "AlarmTopic"
				}],
				"InsufficientDataActions": [{
					"Ref": "AlarmTopic"
				}]
			}
		},
		"QueueWriterRole": {
			"Type": "AWS::IAM::Role",
			"Properties": {
				"AssumeRolePolicyDocument": {
					"Version": "2012-10-17",
					"Statement": [{
						"Effect": "Allow",
						"Principal": {
							"Service": [
								"lambda.amazonaws.com"
							],
							"AWS": {
								"Fn::Sub": "arn:aws:iam::${AWS::AccountId}:root"
							}
						},
						"Action": [
							"sts:AssumeRole"
						]
					}]
				},
				"ManagedPolicyArns": [
					"arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole", {
						"Fn::ImportValue": {
							"Fn::Sub": "${LeoBus}-Policy"
						}
					}
				],
				"Policies": [{
					"PolicyName": "BasicPolicy",
					"PolicyDocument": {
						"Version": "2012-10-17",
						"Statement": [{
							"Effect": "Allow",
							"Action": [
								"sqs:*"
							],
							"Resource": {
								"Fn::GetAtt": ["MyQueue", "Arn"]
							}
						}]
					}
				}]
			}
		}
	}
};