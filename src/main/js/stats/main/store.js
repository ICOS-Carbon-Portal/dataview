import 'babel-polyfill';
import { createStore, applyMiddleware } from 'redux';
import thunkMiddleware from 'redux-thunk';
import reducer from './reducer';
import { fetchDownloadStats, fetchCountries, fetchFilters } from './actions';
import StatsTable from './models/StatsTable';
import StatsMap from './models/StatsMap';
import StatsGraph from './models/StatsGraph';

const initState = {
	downloadStats: new StatsTable({}),
	statsMap: new StatsMap(),
	statsGraph: new StatsGraph(),
	paging: {
		offset: 0,
		to: 0,
		objCount: 0,
		pagesize: 100
	},
	dateUnit: 'week'
};

export default function() {
	const store = createStore(reducer, initState, applyMiddleware(thunkMiddleware));
	store.dispatch(fetchDownloadStats({}));
	store.dispatch(fetchFilters);
	store.dispatch(fetchCountries);
	return store;
}
