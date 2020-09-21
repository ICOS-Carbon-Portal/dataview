import { getDownloadCounts, getDownloadsByCountry, getAvars, getSpecifications, getFormats, getDataLevels, getStations,
	getContributors, getCountriesGeoJson, getThemes, getStationsCountryCode, getDownloadsPerDateUnit,
	getPreviewAggregation, getPopularTimeserieVars, callApi, getSearchParams, getDownloadStatsApi, getStationsApi,
	getSpecsApi, getContributorsApi} from './backend';
import {getConfig} from "./models/RadioConfig";

export const actionTypes = {
	ERROR: 'ERROR',
	DOWNLOAD_STATS_FETCHED: 'DOWNLOAD_STATS_FETCHED',
	FILTERS: 'FILTERS',
	STATS_UPDATE: 'STATS_UPDATE',
	STATS_UPDATED: 'STATS_UPDATED',
	COUNTRIES_FETCHED: 'COUNTRIES_FETCHED',
	DOWNLOAD_STATS_PER_DATE_FETCHED: 'DOWNLOAD_STATS_PER_DATE_FETCHED',
	SET_VIEW_MODE: 'SET_VIEW_MODE',
	RADIO_CREATE: 'RADIO_CREATE',
	PREVIEW_DATA_FETCHED: 'PREVIEW_DATA_FETCHED',
	RADIO_UPDATED: 'RADIO_UPDATED',
	SET_BACKEND_SOURCE: 'SET_BACKEND_SOURCE',
	RESET_FILTERS: 'RESET_FILTERS',
}

const failWithError = dispatch => error => {
	console.log(error);
	dispatch({
		type: actionTypes.ERROR,
		error
	});
};

export const init = (dispatch, getState) => {
	const viewMode = getState().view.mode;
	dispatch(fetchDataForView(viewMode));
};

export const setViewMode = mode => dispatch => {
	dispatch({
		type: actionTypes.SET_VIEW_MODE,
		mode
	});

	dispatch(fetchDataForView(mode));
};

const fetchDataForView = viewMode => dispatch => {
	if (viewMode === "downloads"){
		dispatch(initDownloads);
	} else if (viewMode === "previews"){
		dispatch(initPreviewView);
	}
};

const initDownloads = (dispatch) => {
	dispatch(fetchCountries);
	dispatch(fetchFilters);
	dispatch(fetchDownloadStats());
};

const initPreviewView = dispatch => {
	dispatch(fetchPreviewData('getPopularTimeserieVars'));

	const radioConfigMain = getConfig('main');

	dispatch({
		type: actionTypes.RADIO_CREATE,
		radioConfig: radioConfigMain,
		radioAction: actionTxt => {
			dispatch(radioSelected(radioConfigMain, actionTxt));
			dispatch(fetchPreviewData(actionTxt));
		}
	});

	const radioConfigSub = getConfig('popularTSVars');

	dispatch({
		type: actionTypes.RADIO_CREATE,
		radioConfig: radioConfigSub,
		radioAction: actionTxt => dispatch(radioSelected(radioConfigSub, actionTxt))
	});
};

const fetchPreviewData = actionTxt => dispatch => {
	const fetchFn = actionTxt === "getPopularTimeserieVars"
		? getPopularTimeserieVars
		: getPreviewAggregation(actionTxt);
	dispatch(fetchPreviewDataFromBackend(fetchFn));
};

const fetchPreviewDataFromBackend = (fetchFn, page = 1) => dispatch => {
	fetchFn(page).then(previewDataResult => {
		dispatch({
			type: actionTypes.PREVIEW_DATA_FETCHED,
			page,
			previewDataResult,
			fetchFn
		});
	});
};

export const radioSelected = (radioConfig, actionTxt) => dispatch => {
	dispatch({
		type: actionTypes.RADIO_UPDATED,
		radioConfig,
		actionTxt
	});
};

const fetchCountries = dispatch => {
	getCountriesGeoJson().then(
		countriesTopo => {
			dispatch({
				type: actionTypes.COUNTRIES_FETCHED,
				countriesTopo
			});
		},
		err => dispatch(failWithError(err))
	);
};

export const resetFilters = () => dispatch => {
	dispatch({
		type: actionTypes.RESET_FILTERS
	});
	dispatch(fetchDownloadStats())
};

export const fetchDownloadStats = (newPage) => (dispatch, getState) => {
	const { downloadStats, stationCountryCodeLookup, dateUnit, backendSource } = getState();
	const filters = downloadStats.filters;
	const page = newPage || 1;

	if (backendSource.source === 'restheart') {
		const useFullColl = useFullCollection(filters);
		const avars = getAvars(filters, stationCountryCodeLookup);

		Promise.all([getDownloadCounts(useFullColl, avars, page), getDownloadsByCountry(useFullColl, avars)])
			.then(([downloadStats, countryStats]) => {
				dispatch({
					type: actionTypes.DOWNLOAD_STATS_FETCHED,
					downloadStats: downloadStats._embedded.map(d => ({ ...d, ...{ hashId: d._id } })),
					countryStats: countryStats._embedded.map(d => ({ ...d, ...{ countryCode: d._id } })),
					filters,
					page,
					to: downloadStats._returned,
					objCount: downloadStats._size
				});
			});
		dispatch(fetchDownloadStatsPerDateUnit(dateUnit, avars));
		
	} else {
		const searchParams = getSearchParams(filters);

		Promise.all([getDownloadStatsApi(page, searchParams), callApi('downloadsByCountry', searchParams)])
			.then(([downloadStats, countryStats]) => {
				dispatch({
					type: actionTypes.DOWNLOAD_STATS_FETCHED,
					downloadStats: downloadStats.stats,
					countryStats,
					filters,
					page,
					to: downloadStats.stats.length,
					objCount: downloadStats.size
				});
			});
		dispatch(fetchDownloadStatsPerDateUnit(dateUnit));
	}
};

const fetchFilters = (dispatch, getState) => {
	const { backendSource } = getState();

	if (backendSource.source === 'restheart') {
		Promise.all([getSpecifications(), getFormats(), getDataLevels(), getStations(), getContributors(), getThemes(), getStationsCountryCode()]).then(
			([specifications, formats, dataLevels, stations, contributors, themes, countryCodes]) => {
				let countryCodesLabels = countryCodes.countryCodeFilter;
				const parser = d => ({ ...d, ...{ id: d._id } });

				dispatch({
					type: actionTypes.FILTERS,
					specifications: specifications._embedded.map(parser),
					formats: formats._embedded.map(parser),
					dataLevels: dataLevels._embedded.map(parser),
					stations: stations._embedded.map(parser),
					contributors: contributors._embedded.map(parser),
					themes: themes._embedded.map(parser),
					countryCodes: countryCodesLabels,
					stationCountryCodeLookup: countryCodes.stationCountryCodeLookup
				});
			}
		);
	
	} else {
		Promise.all([getSpecsApi(), getContributorsApi(), getStationsApi()]).then(
			([specifications, contributors, stations]) => {
				dispatch({
					type: actionTypes.FILTERS,
					specifications,
					stations,
					contributors
				});
			}
		);
	}
};

export const fetchDownloadStatsPerDateUnit = (dateUnit, avars) => (dispatch, getState) => {
	const { stationCountryCodeLookup, downloadStats, backendSource } = getState();
	const filters = downloadStats.filters;

	if (backendSource.source === 'restheart') {
		const useFullColl = useFullCollection(filters);

		const avarsGetter = avars => {
			if (avars === undefined) {
				return getAvars(filters, stationCountryCodeLookup);
			} else {
				return avars;
			}
		};

		getDownloadsPerDateUnit(useFullColl, dateUnit, avarsGetter(avars))
			.then(downloadsPerDateUnit => {
				dispatch({
					type: actionTypes.DOWNLOAD_STATS_PER_DATE_FETCHED,
					dateUnit,
					downloadsPerDateUnit: downloadsPerDateUnit.map(d => ({ ...d, ...{ date: new Date(d._id.$date) } }))
				});
			});
		
	} else {
		const endpoint = 'downloadsPer' + dateUnit.slice(0, 1).toUpperCase() + dateUnit.slice(1);
		const searchParams = getSearchParams(filters);
		const parser = d => ({ ...d, ...{ date: new Date(d.ts) } })

		callApi(endpoint, searchParams, parser)
			.then(downloadsPerDateUnit => {
				dispatch({
					type: actionTypes.DOWNLOAD_STATS_PER_DATE_FETCHED,
					dateUnit,
					downloadsPerDateUnit
				});
			});
	}
};

export const statsUpdate = (varName, values) => (dispatch, getState) => {

	dispatch({
		type: actionTypes.STATS_UPDATE,
		varName,
		values
	});

	const { stationCountryCodeLookup, statsGraph, downloadStats, backendSource } = getState();
	const filters = downloadStats.filters;

	if (backendSource.source === 'restheart') {
		const useFullColl = useFullCollection(filters);
		const avars = getAvars(filters, stationCountryCodeLookup);

		Promise.all([getDownloadCounts(useFullColl, avars), getDownloadsByCountry(useFullColl, avars)])
			.then(([downloadStats, countryStats]) => {
				dispatch({
					type: actionTypes.STATS_UPDATED,
					downloadStats: downloadStats._embedded.map(d => ({ ...d, ...{ hashId: d._id } })),
					countryStats: countryStats._embedded.map(d => ({ ...d, ...{ countryCode: d._id } })),
					to: downloadStats._returned,
					objCount: downloadStats._size
				});

				dispatch(fetchDownloadStatsPerDateUnit(statsGraph.dateUnit, avars))
			});

	} else {
		dispatch(fetchDownloadStats(1));
	}
};

export const requestPage = page => (dispatch, getState) => {
	const viewMode = getState().view.mode;

	if (viewMode === "downloads"){
		dispatch(fetchDownloadStats(page));
	} else if (viewMode === "previews"){
		dispatch(requestPagePreviews(page));
	}
};

const requestPagePreviews = page => (dispatch, getState) => {
	const fetchFn = getState().lastPreviewCall;
	dispatch(fetchPreviewDataFromBackend(fetchFn, page));
};


const useFullCollection = filters => {
	return Object.keys(filters).length === 0 || Object.keys(filters).every(key => filters[key].length === 0);
};

export const setBackendSource = source => dispatch => {
	dispatch({
		type: actionTypes.SET_BACKEND_SOURCE,
		source
	});

	dispatch(init);
};
