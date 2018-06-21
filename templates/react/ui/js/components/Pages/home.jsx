import React, {Component} from 'react';
import {connect} from 'react-redux';
import api from '../../watchers/api.js';

import {
    update
} from '../../actions/action.js';

class Home extends React.Component {
    constructor(props) {
        super(props);
        api.getStats.watch();
    }
    componentWillUnmount() {
        api.getStats.unwatch();
    }
    render() {
        return (
            <div>
            	<header>HOME PAGE</header>
            	<ul>
            		{this.props.users.map((user)=>{
						return <li key={user.name}>
                            Name: {user.name}<br />
                            Gender: {user.gender}<br />
                        </li>
            		})}
            	</ul>
            </div>
        );
    }
}

export default connect((state) => {
    return {
        users: state.data
    };
})(Home);
