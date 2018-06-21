import {
	NAVIGATE
} from '../actions/action.js';

export default function state(state = {}, action) {
	switch (action.type) {
	case NAVIGATE:
		return Object.assign({}, state, {
			page: action.page
		});
	default:
		return state
	}
}