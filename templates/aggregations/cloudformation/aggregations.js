let cf = require("leo-aws/utils/cloudformation.js")();

let aggregationsCF = cf.add({
	"LeoEventMapping": {
		"Type": "AWS::Lambda::EventSourceMapping",
		"Properties": {
			"BatchSize": 500,
			"Enabled": true,
			"StartingPosition": "TRIM_HORIZON",
			"EventSourceArn": {
				"Fn::Sub": "${Entities.StreamArn}"
			},
			"FunctionName": {
				"Fn::Sub": "${__bot02__}"
			}
		}
	}
})
.add({
	"LeoAggregationsMapping": {
		"Type": "AWS::Lambda::EventSourceMapping",
		"Properties": {
			"BatchSize": 500,
			"Enabled": true,
			"StartingPosition": "TRIM_HORIZON",
			"EventSourceArn": {
				"Fn::Sub": "${Aggregations.StreamArn}"
			},
			"FunctionName": {
				"Fn::Sub": "${__bot04__}"
			}
		}
	}
})
.add({
	"LeoEntitiesChangesRole": {
		"Type": "AWS::IAM::Role",
		"Properties": {
			"AssumeRolePolicyDocument": {
				"Version": "2012-10-17",
				"Statement": [
					{
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
					}
				]
			},
			"ManagedPolicyArns": [
				"arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole",
				{
					"Fn::ImportValue": {
						"Fn::Sub": "${LeoBus}-Policy"
					}
				}
			],
			"Policies": [
				{
					"PolicyName": "Leo_Entities",
					"PolicyDocument": {
						"Version": "2012-10-17",
						"Statement": [
							{
								"Effect": "Allow",
								"Action": [
									"dynamodb:Scan",
									"dynamodb:PutItem",
									"dynamodb:BatchWriteItem",
									"dynamodb:BatchGetItem",
									"dynamodb:UpdateItem",
									"dynamodb:Query"
								],
								"Resource": [
									{
										"Fn::Sub": "${Entities.Arn}"
									}
								]
							},
							{
								"Effect": "Allow",
								"Action": [
									"dynamodb:GetRecords",
									"dynamodb:GetShardIterator",
									"dynamodb:DescribeStream",
									"dynamodb:ListStreams"
								],
								"Resource": [
									{
										"Fn::Sub": "${Entities.StreamArn}"
									}
								]
							}
						]
					}
				},
				{
					"PolicyName": "Leo_Aggregations",
					"PolicyDocument": {
						"Version": "2012-10-17",
						"Statement": [
							{
								"Effect": "Allow",
								"Action": [
									"dynamodb:Scan",
									"dynamodb:PutItem",
									"dynamodb:BatchWriteItem",
									"dynamodb:BatchGetItem",
									"dynamodb:UpdateItem",
									"dynamodb:Query"
								],
								"Resource": [
									{
										"Fn::Sub": "${Aggregations.Arn}"
									}
								]
							},
							{
								"Effect": "Allow",
								"Action": [
									"dynamodb:GetRecords",
									"dynamodb:GetShardIterator",
									"dynamodb:DescribeStream",
									"dynamodb:ListStreams"
								],
								"Resource": [
									{
										"Fn::Sub": "${Aggregations.StreamArn}"
									}
								]
							}
						]
					}
				}
			]
		}
	}
})
.add(cf.dynamodb.table("Entities", {
	id: '__entity_id_type__',
	partition: 'S',
	autoscale: true,
	throughput: {
		read: 20,
		write: 20
	},
	stream: "NEW_AND_OLD_IMAGES"
}))
.add(cf.dynamodb.table('Aggregations', {
	id: 'S',
	bucket: 'S',
	autoscale: true,
	throughput: {
		read: 20,
		write: 20
	},
	stream: "NEW_AND_OLD_IMAGES"
}));

module.exports = aggregationsCF;
