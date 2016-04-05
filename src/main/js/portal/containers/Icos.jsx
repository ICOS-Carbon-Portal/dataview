import React, { Component } from 'react'
import { connect } from 'react-redux'
import Search from './Search.jsx';

class Icos extends Component {
	constructor(props){
		super(props);
	}

	render() {
				
		switch(this.props.route){

			case 'search':
				return <Search />;

			default:
				return <h1>ICOS Data Service Protot</h1>;
		}				
				
				
	}
		

}

function stateToProps(state){
	return Object.assign({route: state.route}, state.icos);
}

export default connect(stateToProps)(Icos);

