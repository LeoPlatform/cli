import React, { Component } from 'react';
import { connect } from 'react-redux';

import Footer from './Sections/footer.jsx';
import Header from './Sections/header.jsx';

import Home from './Pages/home.jsx';
import SubPage from './Pages/subpage.jsx';

class App extends React.Component {
	constructor(props) {
		super(props);
		this.state = {};
	}
	render() {
		var pages = {
			home: <Home />,
			sub: <SubPage />
		};

		return (<section>
            <Header />
            {pages[this.props.page]}
            <Footer />
        </section>);
	}
}

export default connect((state) => {
	return state.navigation;
})(App);
