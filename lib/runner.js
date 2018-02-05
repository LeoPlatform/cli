var fs = require('fs');
var path = require('path');
var moment = require("moment");

//need to remove from argv because this is a fork
let argv = process.argv.slice(2);

require("./leo-bot-run.js")(argv, (err, module) => {
	module.handler(module.event, createContext({}, module.config), (err, data) => {
		module.runner.callback(err, data, (err, data) => {
			data && console.log("\n\n\n--------------------------Results--------------------------\n")
			let results = data;
			if (err) {
				console.log("Error:", err)
			} else {
				if (typeof data === "object") {
					data = JSON.stringify(data, null, 2);
				}
				if (data !== undefined) {
					console.log(data);
				}
			}
			if (fs.existsSync(path.resolve(module.rootDir, "test/postprocess.js"))) {
				require(path.resolve(module.rootDir, "test/postprocess.js"))(module.event, err, results)
			}
		});
	});

});



function createContext(pkg, config) {
	var start = new Date();
	var maxTime = (config.timeout || 5256000) * 1000;
	return {
		awsRequestId: "requestid-local" + moment.now().toString(),
		getRemainingTimeInMillis: function() {
			var timeSpent = new Date() - start;
			if (timeSpent < maxTime) {
				return maxTime - timeSpent;
			} else {
				return 0;
			}
		}
	};
}

function stripBOM(content) {
	// Remove byte order marker. This catches EF BB BF (the UTF-8 BOM)
	// because the buffer-to-string conversion in `fs.readFileSync()`
	// translates it to FEFF, the UTF-16 BOM.
	if (content.charCodeAt(0) === 0xFEFF) {
		content = content.slice(1);
	}
	return content;
}