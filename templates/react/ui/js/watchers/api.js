import {
	add
} from '@leo-sdk/core/ui/watcher.js';
import {
	update
} from '../actions/action.js';

export default {
	getStats: add(function (dispatch, done) {
		console.log(dispatch, done);
		return $.get("api/list").then((data) => {
			dispatch(update(data.users));
		});
	}, 5000)
};