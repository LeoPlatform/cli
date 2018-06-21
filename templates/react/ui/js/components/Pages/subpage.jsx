import React, {Component} from 'react';
import {connect} from 'react-redux';

class SubPage extends React.Component {
    render() {
        return (
            <div>
            	<header>SUB Page</header>
            	This page is not watching the API call, and will therefor not refresh the names
            	<ul>
            		{this.props.users.map((user)=>{
						return <li>
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
})(SubPage);
