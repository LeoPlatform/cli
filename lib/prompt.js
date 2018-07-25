const readline = require('readline');
const rl = readline.createInterface({
	input: process.stdin,
	output: process.stdout
});

module.exports = function(question, def = null, constraints = null) {
	return new Promise((resolve, reject) => {
		rl.question(question + ` [${def}] `, (data) => {
			data = data.trim();
			if (data == "") {
				data = def;
			}

			if (constraints && !data.match(constraints)) {
				throw new Error('Invalid input');
			}

			resolve(data);
		});
	});
};


module.exports.close = rl.close;
