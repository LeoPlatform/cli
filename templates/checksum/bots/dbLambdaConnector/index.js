let db__CONNECTOR_NUMBER__ = checksum.lambdaConnector('__CONNECTOR_TYPE__ orders checksum', process.env.__CONNECTOR_TYPE___lambda, {
	sql: `SELECT id, status FROM orders WHERE id __IDCOLUMNLIMIT__`,
	table: 'orders',
	id_column: 'id',
	key_column: 'primary'
});
