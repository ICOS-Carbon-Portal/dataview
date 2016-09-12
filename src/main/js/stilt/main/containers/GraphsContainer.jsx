import React from 'react';
import ReactDOM from 'react-dom';
import { connect } from 'react-redux';
import throttle from '../../../common/main/general/throttle';
import copyprops from '../../../common/main/general/copyprops';

import config from '../config';
import {setDateRange} from '../actions.js';
import {formatDate} from '../models/formatting';
import Dygraphs from '../components/Dygraphs.jsx';

const GraphsContainer = props => props.timeSeriesData
	? <Dygraphs data={props.timeSeriesData} {...props}/>
	: <div></div>;

function stateToProps(state){

	const firstVisibleStilt = config.stiltResultColumns.concat(config.wdcggColumns).find(
		series => state.options.modelComponentsVisibility[series.label]
	);

	const annotations = state.footprint && firstVisibleStilt
		? [{
			series: firstVisibleStilt.label,
			x: state.footprint.date,
			shortText: '',
			text: state.footprint.filename,
			cssClass: 'glyphicon glyphicon-triangle-bottom',
			//attachAtBottom: true,
			tickHeight: 10
		}]
		: [];

	return Object.assign(
		{
			dateFormatter: formatDate,
			annotations,
			visibility: state.options.modelComponentsVisibility
		},
		copyprops(state, ['timeSeriesData', 'dateRange'])
	);
}

function dispatchToProps(dispatch){
	return {
		updateXRange: throttle(range => {
			dispatch(setDateRange(range));
		}, 200)
	};
}

export default connect(stateToProps, dispatchToProps)(GraphsContainer);

