import React, {Component} from 'react';
import {connect} from 'react-redux';


import {navigateTo} from '../../actions/action.js';

class Header extends React.Component {
    render() {
    console.log(this.props);
        return (
            <header>
            	<ul>
            		<li onClick={this.changePage.bind(this, "home")} className={this.props.page === "home"?'selected':''}>Home</li>
            		<li onClick={this.changePage.bind(this, "sub")} className={this.props.page === "sub"?'selected':''}>Sub</li>
            	</ul>
            </header>
        );
    }

    changePage(page) {
    	this.props.dispatch(navigateTo(page));
    }
}

export default connect((state) => {
	return state.navigation;
})(Header);