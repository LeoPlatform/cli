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
				"QueueName": "LeoQuickStart"
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
		}
	}
};
