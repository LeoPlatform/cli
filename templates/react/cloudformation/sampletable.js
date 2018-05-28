let cf = require("leo-aws/utils/cloudformation.js")();
module.exports = cf
	.add(cf.dynamodb.table("SampleTable", {
		id: 'S',
		autoscale: true,
		throughput: {
			read: 20,
			write: 20
		}
	})).export();
