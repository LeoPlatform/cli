import React, {Component} from 'react';
import {connect} from 'react-redux';

class Footer extends React.Component {
    render() {
        return (
            <footer style={{textAlign: 'right'}}>
                My footer
            </footer>
        );
    }
}
export default connect()(Footer);