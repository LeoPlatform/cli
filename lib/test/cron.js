module.exports = {
	event: (event) => {
		let id = (event.__cron && event.__cron.id) || event.botId;
		var a = Object.assign({
			botId: id,
			__cron: {
				id: id,
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
