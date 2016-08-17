import React from 'react';
import ReactDOM from 'react-dom';

function handleError(error){
	console.log(error);
}

var actions = Reflux.createActions([
	"dateSelected", "variableSelected", "elevationSelected", "gammaSelected", "serviceSelected", "highlightedValueAction"
]);


var Backend = require('./Backend.js');
var ControlsStore = require('./stores/ControlsStoreFactory.js')(Backend, handleError, actions);
var Controls = require('./views/ControlsViewFactory.jsx')(ControlsStore, actions);

var RasterStore = require('./stores/RasterStoreFactory.js')(Backend, actions, handleError);

var MapStore = require('./stores/MapStoreFactory.js')(Backend, RasterStore, handleError);

var Legend = require('./views/LegendViewFactory.jsx')(RasterStore, actions.highlightedValueAction);

var LMapContainer = require('./views/LMapContainerFactory.jsx')(RasterStore, MapStore);

ReactDOM.render(
	<div style={{width:'100%', height: '100%'}}>
		<Controls.View/>
		<Legend width={1000} height={45}/>
		<div className="illustration">
			<LMapContainer />
		</div>
	</div>,
	document.getElementById('main')
);
