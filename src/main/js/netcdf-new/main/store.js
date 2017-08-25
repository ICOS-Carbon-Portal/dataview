import 'babel-polyfill';
import { createStore, applyMiddleware } from 'redux';
import thunkMiddleware from 'redux-thunk';
import reducer from './reducer';
import {fetchCountriesTopo, setService, selectGamma, failWithError} from './actions.js';
import {ControlsHelper} from './models/ControlsHelper';

const pathName = window.location.pathname;
const sections = pathName.split('/');
const pid = sections.pop() || sections.pop();

const searchStr = window.decodeURIComponent(window.location.search).replace(/^\?/, '');
const keyValpairs = searchStr.split('&');
const searchParams = keyValpairs.reduce((acc, curr) => {
	const p = curr.split('=');
	acc[p[0]] = p[1];
	return acc;
}, {});

const controls = new ControlsHelper();
const gammaIdx = searchParams.gamma
	? controls.gammas.values.indexOf(parseFloat(searchParams.gamma))
	: 4;

console.log({searchStr, keyValpairs, searchParams, gammas: controls.gammas.values, gammaIdx});

const initState = {
	colorMaker: undefined,
	controls,
	countriesTopo: {
		ts: 0,
		data: undefined
	},
	desiredId: undefined,
	initSearchParams: {
		varName: searchParams.varName,
		date: searchParams.date,
		gamma: searchParams.gamma,
		elevation: searchParams.elevation,
		center: searchParams.center,
		zoom: searchParams.zoom,
	},
	playingMovie: false,
	raster: {
		ts: 0,
		data: undefined
	},
	rasterDataFetcher: undefined,
	toasterData: undefined
};

// function logger({ getState }) {
// 	return (next) => (action) => {
// 		console.log('will dispatch', action)
//
// 		// Call the next dispatch method in the middleware chain.
// 		let returnValue = next(action)
//
// 		console.log('state after dispatch', getState())
//
// 		// This will likely be the action itself, unless
// 		// a middleware further in chain changed it.
// 		return returnValue
// 	}
// }

export default function(){
	const store = createStore(reducer, initState, applyMiddleware(thunkMiddleware));

	if (pid) {
		store.dispatch(fetchCountriesTopo);
		store.dispatch(setService(pid));
		store.dispatch(selectGamma(gammaIdx));
	} else {
		store.dispatch(failWithError({message: 'The request is missing a pid'}));
	}
	return store;
}