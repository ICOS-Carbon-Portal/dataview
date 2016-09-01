import React, { Component } from 'react';
import { connect } from 'react-redux';
import StationsMap from '../components/LMap.jsx';
import FootprintContainer from './FootprintContainer.jsx';
import GraphsContainer from './GraphsContainer.jsx';
import {setSelectedStation} from '../actions.js';

class App extends Component {
	constructor(props){
		super(props);
	}

	render() {
		const props = this.props;
		// console.log({props});

		return (
			<div className="container-fluid">
				<div className="row">

					<div className="col-md-3">
						<div className="row">
							<div className="col-md-12">
								<div style={{height: 200}}>
									<StationsMap
										stations={this.props.stations}
										action={props.stationSelect}
									/>
								</div>
							</div>
						</div>

						<div className="row">
							<div className="col-md-12">
								<FootprintContainer />
							</div>
						</div>
					</div>

					<div className="col-md-9">
						<div className="row">
							<div className="col-md-12">
								<GraphsContainer />
							</div>
						</div>
					</div>

				</div>
			</div>
		);
	}
}

function stateToProps(state){
	return state;
}

function dispatchToProps(dispatch){
	return {
		stationSelect(station){
			dispatch(setSelectedStation(station));
		}
	};
}

export default connect(stateToProps, dispatchToProps)(App);


