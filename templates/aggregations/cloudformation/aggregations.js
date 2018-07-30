module.exports = {
	"Resources": {
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
		},
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
		},
		"Entities": {
			"Type": "AWS::DynamoDB::Table",
			"Properties": {
				"AttributeDefinitions": [
					{
						"AttributeName": "partition",
						"AttributeType": "S"
					},
					{
						"AttributeName": "id",
						"AttributeType": "__entity_id_type__"
					}
				],
				"KeySchema": [
					{
						"AttributeName": "partition",
						"KeyType": "HASH"
					},
					{
						"AttributeName": "id",
						"KeyType": "RANGE"
					}
				],
				"ProvisionedThroughput": {
					"ReadCapacityUnits": 1000,
					"WriteCapacityUnits": 2000
				},
				"StreamSpecification": {
					"StreamViewType": "NEW_AND_OLD_IMAGES"
				}
			}
		},
		"Aggregations": {
			"Type": "AWS::DynamoDB::Table",
			"Properties": {
				"AttributeDefinitions": [
					{
						"AttributeName": "id",
						"AttributeType": "S",
					},
					{
						"AttributeName": "bucket",
						"AttributeType": "S"
					}
				],
				"KeySchema": [
					{
						"AttributeName": "id",
						"KeyType": "HASH"
					},
					{
						"AttributeName": "bucket",
						"KeyType": "RANGE"
					}
				],
				"ProvisionedThroughput": {
					"ReadCapacityUnits": 10,
					"WriteCapacityUnits": 10
				},
				"StreamSpecification": {
					"StreamViewType": "NEW_AND_OLD_IMAGES"
				}
			}
		},
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
	}
};