import {fetchStationMeasurement, fetchObjectSpecifications, fetchBinTable} from './backend';
import config from './config';
import {saveToRestheart} from "../../common/main/backend";
export const actionTypes = {
	ERROR: 'ERROR',
	DISPLAY_MSG: 'DISPLAY_MSG',
	INIT: 'INIT',
	STATION_MEASUREMENTS: 'STATION_MEASUREMENTS',
	BINTABLE: 'BINTABLE',
	SWITCH_TIMEPERIOD: 'SWITCH_TIMEPERIOD',
	SWITCH_HEIGHT: 'SWITCH_HEIGHT',
	SWITCH_VALUETYPE: 'SWITCH_VALUETYPE'
};


export const failWithError = dispatch => error => {
	console.log(error);
	dispatch({
		type: actionTypes.ERROR,
		error
	});
};

export const displayMsg = dispatch => error => {
	dispatch({
		type: actionTypes.DISPLAY_MSG,
		error
	});
};

export const init = searchParams => dispatch => {
	const isValidRequest = searchParams.has('stationId') && searchParams.has('valueType') && searchParams.has('height');
	const stationId = searchParams.get('stationId');
	const valueType = searchParams.get('valueType');
	const height = searchParams.get('height');

	dispatch({
		type: actionTypes.INIT,
		stationId,
		valueType,
		height
	});

	if (isValidRequest){
		dispatch(getStationMeasurement(stationId, valueType, 1, height));
		dispatch(getStationMeasurement(stationId, valueType, 2, height));

		saveToRestheart({
			dashboard: {
				webHostUrl: getWebHostUrl(),
				stationId,
				valueType,
				height
			}
		});
	}
};

const getWebHostUrl = () => {
	// Not loaded through an iframe
	if (window.location === window.parent.location)
		return undefined;

	if (document.referrer)
		return document.referrer;

	if (document.location.ancestorOrigins && document.location.ancestorOrigins.length > 0)
		return document.location.ancestorOrigins[0];

	return 'unknown';
};

const getStationMeasurement = (stationId, valueType, dataLevel, height) => dispatch => {

	fetchStationMeasurement(stationId, valueType, dataLevel, height).then(measurements => {
		dispatch({
			type: actionTypes.STATION_MEASUREMENTS,
			measurements
		});

		const objIds = getObjIds(measurements, valueType, height);

		dispatch(getObjectSpecifications(objIds, dataLevel, valueType));
	});
};

const getObjIds = (measurements, valueType, height) => {
	return measurements
		.filter(m => m.columnName == valueType && m.samplingHeight == height)
		.map(m => m.dobj);
}

const getObjectSpecifications = (objIds, dataLevel, valueType) => dispatch => {

	fetchObjectSpecifications(objIds).then(objectSpecifications => {
		if (objectSpecifications === undefined) {
			dispatch({
				type: actionTypes.BINTABLE,
				dataLevel,
				objSpec: undefined,
				binTable: undefined
			});
		} else {
			objectSpecifications.forEach(objSpec => {
				dispatch(getBinTable(dataLevel, valueType, objSpec));
			})
		}
	},
		displayMsg(dispatch)
	);
};

const getBinTable = (dataLevel, yCol, objSpec) => dispatch => {
	const {id, tableFormat, nRows} = objSpec;
	const columnIndexes = config.columnsToFetch.concat([yCol]).map(colName =>
		tableFormat.getColumnIndex(colName)
	);
	const request = tableFormat.getRequest(id, nRows, columnIndexes);

	fetchBinTable(request).then(binTable => {
		dispatch({
			type: actionTypes.BINTABLE,
			yCol,
			dataLevel,
			objSpec,
			binTable
		});
	},
		displayMsg(dispatch)
	);
};

export const switchTimePeriod = timePeriod => dispatch => {
	dispatch({
		type: actionTypes.SWITCH_TIMEPERIOD,
		timePeriod
	})
};

export const switchHeight = height => (dispatch, getState) => {
	dispatch({
		type: actionTypes.SWITCH_HEIGHT,
		height
	})

	const stats = getState().stats
	const objIds = getObjIds(stats.measurements, stats.params.valueType, height);

	dispatch(getObjectSpecifications(objIds, 1, stats.params.valueType));
	dispatch(getObjectSpecifications(objIds, 2, stats.params.valueType));
};

export const switchValueType = valueType => (dispatch, getState) => {
	dispatch({
		type: actionTypes.SWITCH_VALUETYPE,
		valueType
	})

	const stats = getState().stats
	const objIds = getObjIds(stats.measurements, valueType, stats.params.height);

	dispatch(getObjectSpecifications(objIds, 1, valueType));
	dispatch(getObjectSpecifications(objIds, 2, valueType));
};
