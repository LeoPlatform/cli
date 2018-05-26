import {
	combineReducers
} from 'redux';

import data from "./data";
import navigation from "./navigation";

export default combineReducers({
	data,
	navigation
});