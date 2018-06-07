"use strict";

const leo = require('leo-sdk');
const checksum = require('leo-connector-common/checksum');
const moment = require('moment');

exports.handler = function(event, context, callback) {
	let system = 'default';
	let mysqldb = checksum.lambdaConnector('SQL Server DB Lead checksum', process.env.sqlserver_lambda, {
		sql: `SELECT id, status FROM orders WHERE id __IDCOLUMNLIMIT__`,
		table: 'orders',
		id_column: 'id',
		key_column: 'primary'
	});
	let postgresdb = checksum.lambdaConnector('Postgres DB Lead checksum', process.env.postgres_lambda, {
		sql: `SELECT id, status FROM d_orders WHERE id __IDCOLUMNLIMIT__`,
		table: 'd_orders',
		id_column: 'id',
		key_column: 'primary'
	});

	checksum.checksum(system, event.botId, mysqldb, postgresdb, {
		stopOnStreak: 1750000,
		stop_at: moment().add({minutes: 4}),
		fieldNames: [
			'id', 'status'
		],
		maxLimit: 500000,
		//shouldDelete: true, // uncomment this out to delete records on the slave (postgresdb) that no longer exist on the master (mysqldb)
		loadSize: 50000,
		limit: 20000,
		reverse: true,
		sample: true,
		queue: {
			name: event.destination,
			transform: leo.streams.through((obj, done) => {
				done(null, {
					Example: obj.missing.concat(obj.incorrect)
				});
			})
		}
	})
	.then(data=>{ console.log(data); callback()})
	.catch(callback);
};
