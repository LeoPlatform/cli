/**************************
 * Begin Custom Connector *
 **************************/
Begin
let custom__CONNECTOR_NUMBER__ = checksum.basicConnector('< Checksum name >', {
	id_column: 'id'
}, {
	/**
	 * Called when checksum starts.
	 * Used for situations such as when your endpoint requires authorization.
	 * Called with data, return a session
	 */
	initialize: function(data) {
		return Promise.resolve({});
	},

	/**
	 * @int start
	 * @int end
	 * @object options (optional)
	 * @return object {min: int, max: int, total: int}
	 */
	range: function(start, end) {
		let min = null;
		let max = null;
		let total = 0;

		/************************************************
		 * Begin example code to get min, max, and total.*
		 * This example loops through records returned   *
		 * into “db” and creates a start and end from    *
		 * the greatest and least id’s.                  *
		 *************************************************/
			// db: object containing records to compare
		let db = [{id: 1, name: 'foo', etc: 'etc'}, {...}];
		Object.keys(db).map(id => {
			id = db[id][this.settings.id_column];
			if ((start === undefined || id >= start) && (end === undefined || id <= end)) {
				total++;
				if (min == null || id < min) {
					min = id;
				}
				if (max == null || id > max) {
					max = id;
				}
			}
		});
		/**********************************************
		 * End example code to get min, max, and total *
		 ***********************************************/

		// return a min, max and total
		return Promise.resolve({
			min,
			max,
			total
		});
	},

	/**
	 * Respond to a start and end, and build an array of data returned into “db”
	 *
	 * @int start
	 * @int end
	 * @return Array
	 */
	batch: function(start, end) {
		let data = [];
		// db: object containing records to compare
		let db = [{id: 1, name: 'foo', etc: 'etc'}, {...}];

		/***********************************************************************************
		 * Example code to put together an array of data using the data returned from “db” *
		 ***********************************************************************************/
		for (v of db) {
			data.push(v);
		}

		/**********************************************************************************************************
		 * Alternatively, if you cannot pass in a start and end and just get a chunk of data back, build an array *
		 * with the data having id’s between start and end                                                         *
		 ***********************************************************************************************************/
		for (let i = start; i <= end; i++) {
			if (typeof db[i] !== 'undefined') {
				data.push(db[i]);
			}
		}

		// return the array of data
		return Promise.resolve(data);
	},

	/**
	 * Nibble handler: Uses a start, end, limit, and reverse; and gives a “next” and “current” to continue checking data
	 * @int start
	 * @int end
	 * @int limit
	 * @bool reverse
	 * @return Object{next, current}
	 */
	nibble: function(start, end, limit, reverse) {
		// db: object containing records to compare
		let db = [{id: 1, name: 'foo', etc: 'etc'}, {...}];
		let current = null;
		let next = null;
		let dir = 1;
		let ostart = start;
		let oend = end;
		if (reverse) {
			start = end;
			end = ostart;
			dir = -1;
		}
		let cnt = 0;
		for (let i = start; i >= ostart && i <= oend; i += dir) {
			if (typeof db[i] !== undefined) {
				let v = db[i];
				cnt++;
				if (cnt >= limit) {
					if (!current) {
						current = v[this.settings.id_column];
					} else {
						next = v[this.settings.id_column];
						break;
					}
				}
			}
		}

		return Promise.resolve({
			current,
			next
		});
	},

	/**
	 * Check an individual record
	 * @param start
	 * @param end
	 * @returns Array
	 */
	individual: function(start, end) {
		return this.batch(start, end);
	},

	/**
	 * Delete extras found in the slave that do not exist in master
	 * @param ids
	 * @returns {Promise<void>}
	 */
	delete: function(ids) {
		// db: object containing records to compare
		let db = [{id: 1, name: 'foo', etc: 'etc'}, {...}];
		ids.map(id => {
			if (id in db) {
				delete db[id];
			}
		});
		return Promise.resolve();
	},

	/**
	 * Return a sample of differences
	 * @param ids
	 * @returns {Promise<Array>}
	 */
	sample: function(ids) {
		let data = [];
		// db: object containing records to compare
		let db = [{id: 1, name: 'foo', etc: 'etc'}, {...}];
		ids.map(id => {
			let v = db[id];
			if (v !== undefined) {
				data.push(v);
				console.log(v);
			}
		});

		return Promise.resolve(data);
	},

	/**
	 * Called on completion
	 * @param data
	 * @returns {Promise<void>}
	 */
	destroy: function(data) {
		return Promise.resolve();
	}
});
/************************
 * End Custom Connector *
 ************************/
