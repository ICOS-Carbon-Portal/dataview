import {FETCHED_INITDATA, FETCHED_STATIONDATA, FETCHED_RASTER, SET_SELECTED_STATION, SET_SELECTED_YEAR,
	SET_DATE_RANGE, SET_VISIBILITY, SET_STATION_VISIBILITY, INCREMENT_FOOTPRINT, PUSH_PLAY, ERROR} from './actions';
import {makeTimeSeriesGraphData} from './models/timeSeriesHelpers';
import FootprintsRegistry from './models/FootprintsRegistry';
import FootprintsFetcher from './models/FootprintsFetcher';
import copyprops from '../../common/main/general/copyprops';
import deepUpdate from '../../common/main/general/deepUpdate';

export default function(state, action){

	switch(action.type){

		case FETCHED_INITDATA:
			return updateWith(['wdcggFormat', 'stations', 'countriesTopo']);

		case FETCHED_RASTER:
			return state.desiredFootprint.date == action.footprint.date
				? updateWith(['raster', 'footprint'])
				: state;

		case SET_SELECTED_STATION:
			const station = action.selectedStation;

			return keep(['wdcggFormat', 'stations', 'countriesTopo', 'options'], {
				selectedStation: station,
				selectedYear: station.years.length == 1
					? station.years[0]
					: null
			});

		case SET_SELECTED_YEAR:
			return updateWith(['selectedYear']);

		case FETCHED_STATIONDATA:
			if(checkStationId(action.stationId) && checkYear(action.year)){

				const footprints = new FootprintsRegistry(action.footprints);
				const footprintsFetcher = new FootprintsFetcher(footprints, action.stationId);
				const seriesId = action.stationId + '_' + action.year;
				const timeSeriesData = makeTimeSeriesGraphData(action.obsBinTable, action.modelResults, seriesId);

				return update({timeSeriesData, footprints, footprintsFetcher});
			} else return state;

		case SET_DATE_RANGE:
			const dateRange = action.dateRange;
			const desiredFootprint = state.footprints ? state.footprints.ensureRange(state.footprint, dateRange) : null;
			const footprintsFetcher = state.footprintsFetcher ? state.footprintsFetcher.withDateRange(dateRange) : null;
			return update({desiredFootprint, dateRange, footprintsFetcher});

		case SET_VISIBILITY:
			return deepUpdate(state, ['options', 'modelComponentsVisibility'], action.update);

		case SET_STATION_VISIBILITY:
			return updateWith(['showStationPosition'], ['options']);

		case INCREMENT_FOOTPRINT:
			return state.footprint
				? update({desiredFootprint: state.footprints.step(state.footprint, action.increment, state.dateRange)})
				: state;

		case PUSH_PLAY:
			return update({playingMovie: !state.playingMovie});

		case ERROR:
			return updateWith(['error']);

		default:
			return state;
	}

	function checkYear(year){
		return state.selectedYear && state.selectedYear.year == year;
	}

	function checkStationId(id){
		return state.selectedStation && state.selectedStation.id == id;
	}

	function keep(props, updatesObj){
		return Object.assign(copyprops(state, props), updatesObj); 
	}

	function update(){
		const updates = Array.from(arguments);
		return Object.assign.apply(Object, [{}, state].concat(updates)); 
	}

	function updateWith(actionProps, path){
		return path
			? deepUpdate(state, path, copyprops(action, actionProps))
			: update(copyprops(action, actionProps));
	}

}

