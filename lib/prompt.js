const readline = require('readline');
const rl = readline.createInterface({
	input: process.stdin,
	output: process.stdout
});

module.exports = function(question, def = null) {
	return new Promise(resolve => {
		rl.question(question, (data) => {
			data = data.trim();
			if (data == "") {
				data = def;
			}
			resolve(data);
		});
	});
};


module.exports.close = rl.close;
