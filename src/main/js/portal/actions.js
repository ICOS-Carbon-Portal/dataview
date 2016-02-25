import {getBinaryTable} from './backend'

export const FETCHING_STARTED = 'FETCHING_STARTED';
export const ERROR = 'ERROR';
export const FETCHED_TABLE = 'FETCHED_TABLE';

const request = {
	"tableId": "aaaaaaaaaaaaaaaaaaaaaa01",
	"schema": {
		"columns": ["INT", "FLOAT", "DOUBLE"],
		"size": 344
	},
	"columnNumbers": [0,1,2]
};

function failWithError(error){
	return {
		type: ERROR,
		error
	};
}

function gotTable(table){
	return {
		type: FETCHED_TABLE,
		table
	};
}

export function fetchTable(dispatch, getState) {
	const state = getState();

	if(state.status !== 'FETCHING'){

		dispatch({type: FETCHING_STARTED});

		getBinaryTable(request).then(
			tbl => dispatch(gotTable(tbl)),
			err => dispatch(failWithError(err))
		);

	}
}

