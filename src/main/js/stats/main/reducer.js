import {ERROR, DOWNLOADCOUNTS_FETCHED, FILTERS, STATS_UPDATE, STATS_UPDATED} from './actions';
import * as Toaster from 'icos-cp-toaster';
import StatsTable from './models/StatsTable';

export default function(state, action){

	switch(action.type){

		case ERROR:
			return update({
				toasterData: new Toaster.ToasterData(Toaster.TOAST_ERROR, action.error.message.split('\n')[0])
			});

		case DOWNLOADCOUNTS_FETCHED:
			return update({
				downloadStats: new StatsTable(action.downloadStats._embedded)
			})

		case FILTERS:
			return update({
				filters: [{
					name: "specification",
					values: action.specifications._embedded
				}, {
					name: "format",
					values: action.formats._embedded
				}, {
					name: "dataLevel",
					values: action.dataLevels._embedded
				}]
			})

		case STATS_UPDATE:
			return update({
				downloadStats: state.downloadStats.withFilter(action.varName, action.values)
			})

		case STATS_UPDATED:
			return update({
				downloadStats: new StatsTable(action.downloadStats._embedded, state.downloadStats.filters)
			})

		default:
			return state;
	}

	function update() {
		const updates = Array.from(arguments);
		return Object.assign.apply(Object, [{}, state].concat(updates));
	}
}
