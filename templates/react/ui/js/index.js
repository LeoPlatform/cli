import App from "./components/main.jsx";
import React, {
	Component
} from 'react';
import {
	Provider,
	connect
} from 'react-redux';
import {
	createStore,
	applyMiddleware
} from 'redux';

import thunkMiddleware from 'redux-thunk';
import createLogger from 'redux-logger';
import rootReducer from './reducers/root.js';

import watcher from '@leo-sdk/core/ui/watcher.js';

import moment from 'moment';

const loggerMiddleware = createLogger();
var preloadedState = {
	navigation: {
		page: 'home'
	},
	data: []
};

var store = createStore(
	rootReducer,
	preloadedState,
	applyMiddleware(
		thunkMiddleware,
		loggerMiddleware
	)
);
watcher.setStore(store);

class Root extends Component {
	render() {
		return (
			<Provider store={store}>
                <App />
            </Provider>
		);
	}
}

//Set up CSS required
require("../css/main.less");

$(function () {
	require("react-dom").render(<Root />, document.getElementById('root'));
})