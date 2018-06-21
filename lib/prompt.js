const readline = require('readline');
const rl = readline.createInterface({
	input: process.stdin,
	output: process.stdout
});

module.exports = function(question) {
	return new Promise(resolve => {
		rl.question(question, (data) => {
			resolve(data);
		});
	});
};


module.exports.close = rl.close;
