module.exports = {
	event: (event) => {

		var a = Object.assign({
			__cron: {
				id: event.botId,
				iid: "0",
				ts: Date.now(),
				force: true
			}
		}, event);
		return a;
	},
	callback: (err, response, callback) => {
		callback(err, response);
	}
}