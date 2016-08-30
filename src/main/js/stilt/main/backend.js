import 'whatwg-fetch';
import {checkStatus} from '../../common/main/backend/fetchHelp';
import {sparql} from '../../common/main/backend/sparql';
import {getBinaryTable} from '../../common/main/backend/binTable';
import * as sparqlQueries from './sparqlQueries';
import config from './config';


export function getStationInfo(){
	return Promise.resolve([
		{
			id: 'JFJ',
			uri: 'http://meta.icos-cp.eu/resources/wdcgg/station/Jungfraujoch%20',
			name: 'Jungfraujoch',
			years: [{
				year: 2011,
				dataObject: {id: 'https://meta.icos-cp.eu/objects/CKuB_hK4-1g3PB1lyPjrZMM3', nRows: 8760}
			}],
			lat: 46.55,
			lon: 7.98
		},
		{
			id: 'MHD',
			uri: 'http://meta.icos-cp.eu/resources/wdcgg/station/Mace%20Head%20',
			name: 'Mace Head',
			years: [{
				year: 2011,
				dataObject: {id: 'https://meta.icos-cp.eu/objects/epSW2GnzRlSmsSL76oylJnG1', nRows: 8760}
			},{
				year: 2012,
				dataObject: {id: 'https://meta.icos-cp.eu/objects/epSW2GnzRlSmsSL76oylJnG1', nRows: 8760}
			}],
			lat: 53.33,
			lon: -9.9
		},
		{
			id: 'PAL',
			uri: 'http://meta.icos-cp.eu/resources/wdcgg/station/Pallas-Sammaltunturi%20',
			name: 'Pallas-Sammaltunturi',
			years: [{
				year: 2011,
				dataObject: {id: 'https://meta.icos-cp.eu/objects/43UW3Nr00WbjDi1zVZa187AJ', nRows: 8760}
			}],
			lat: 67.97,
			lon: 24.12
		},
		{
			id: 'SIL',
			uri: 'http://meta.icos-cp.eu/resources/wdcgg/station/Schauinsland%20',
			name: 'Schauinsland',
			years: [{
				year: 2011,
				dataObject: {id: 'https://meta.icos-cp.eu/objects/S9HFnhr7lF4D4Xl-sKTN4VTk', nRows: 8760}
			}],
			lat: 47.92,
			lon: 7.92
		}
	]);

/*
	const query = sparqlQueries.stationPositions();
	return sparql(query).then(sparqlResult => {
		return sparqlResult.results.bindings.map(binding => {
			return {
				uri: binding.station.value,
				name: binding.name.value,
				lat: parseFloat(binding.lat.value),
				lon: parseFloat(binding.lon.value)
			}
		})
	});
*/
}

export function getTimeSeries(resultsRequest, dataObjectInfo, wdcggFormat){
	//resultsRequest: {stationId: String, year: Int}
	//dataObjectInfo: {id: String, nRows: Int}
	//wdcggFormat: TableFormat

	const observationsPromise = getWdcggBinaryTable(dataObjectInfo, wdcggFormat);
	const request = Object.assign({}, resultsRequest, {
		columns: ['isodate','co2.bio', 'co2.fuel', 'co2.total']
	});
	const modelResultsPromise = getStiltResults(request);

	return Promise.all([observationsPromise, modelResultsPromise])
		.then(([obsBinTable, modelResults]) => {return {obsBinTable, modelResults};});
}

function getWdcggBinaryTable(dataObjectInfo, wdcggFormat){
	const axisIndices = ['TIMESTAMP', 'PARAMETER'].map(idx => wdcggFormat.getColumnIndex(idx));
	const tblRequest = wdcggFormat.getRequest(dataObjectInfo.id, dataObjectInfo.nRows, axisIndices);

	return getBinaryTable(tblRequest);
}

function getStiltResults(resultsRequest){
	return fetch('stiltresult', {
		method: 'POST',
		headers: {"Content-Type": "application/json"},
		body: JSON.stringify(resultsRequest)
	})
	.then(checkStatus)
	.then(response => response.json());
}

