import commonConfig from '../../common/main/config';
import {IKeyValStrPairs} from "./typescript/interfaces";


export default {
	envri: commonConfig.envri,
	ROUTE_SEARCH: 'search',
	ROUTE_CART: 'cart',
	ROUTE_METADATA: 'metadata',
	ROUTE_PREVIEW: 'preview',
	DEFAULT_ROUTE: 'search',
	TIMESERIES: 'TIMESERIES',
	NETCDF: 'NETCDF',
	MAPGRAPH: 'MAPGRAPH',
	netCdfFormat: 'http://meta.icos-cp.eu/ontologies/cpmeta/netcdf',
	mapGraphFormats: [
		'http://meta.icos-cp.eu/ontologies/cpmeta/asciiOtcSocatTimeSer',
		'http://meta.icos-cp.eu/ontologies/cpmeta/asciiOtcProductCsv'
	],
	iFrameBaseUrl: {
		TIMESERIES: '/dygraph-light/',
		NETCDF: '/netcdf/',
		MAPGRAPH: '/map-graph/'
	},
	restheartBaseUrl: commonConfig.restheartBaseUrl,
	stepsize: 20,
	useDataObjectsCache: true,
	dobjCacheFetchLimit: 60,
	dobjExtendedCacheFetchLimit: 20,
	previewIdPrefix: {
		ICOS: 'https://meta.icos-cp.eu/objects/',
		SITES: 'https://meta.fieldsites.se/objects/'
	},
	historyStateMaxAge: (1000 * 3600 * 24),
	dobjSortLimit: 2000,
};

export const placeholders: { [key: string]: IKeyValStrPairs } = {
	ICOS: {
		type: 'Data type',
		level: 'Data level',
		format: 'Format',
		theme: 'Theme',
		colTitle: 'Column name',
		valType: 'Value type',
		quantityKind: 'Quantity kind',
		quantityUnit: 'Unit of measurement',
		submitter: 'Data submitter',
		station: 'Station of origin',
		project: 'Project'
	},
	SITES: {
		type: 'Data type',
		level: 'Data level',
		format: 'Format',
		theme: 'Theme',
		colTitle: 'Column name',
		valType: 'Value type',
		quantityUnit: 'Unit of measurement',
		submitter: 'Data submitter',
		station: 'Station',
		project: 'Project'
	}
};

export const prefixes = {
	ICOS: {
		project: 'http://meta.icos-cp.eu/resources/projects/',
		theme: 'http://meta.icos-cp.eu/resources/themes/',
		station: [
			{prefix: 'w', value: 'http://meta.icos-cp.eu/resources/wdcgg/station/'},
			{prefix: 'i', value: 'http://meta.icos-cp.eu/resources/stations/'}
		],
		submitter: [
			{prefix: 'o', value: 'http://meta.icos-cp.eu/resources/organizations/'},
			{prefix: 's', value: 'http://meta.icos-cp.eu/resources/stations/'}
		],
		type: 'http://meta.icos-cp.eu/resources/cpmeta/',
		format: 'http://meta.icos-cp.eu/ontologies/cpmeta/',
		valType: 'http://meta.icos-cp.eu/resources/cpmeta/',
		quantityKind: 'http://meta.icos-cp.eu/resources/cpmeta/'
	},
	SITES: {
		project: 'https://meta.fieldsites.se/resources/projects/',
		theme: 'https://meta.fieldsites.se/resources/themes/',
		station: 'https://meta.fieldsites.se/resources/stations/',
		submitter: [
			{prefix: 'o', value: 'https://meta.fieldsites.se/resources/organizations/'},
			{prefix: 's', value: 'https://meta.fieldsites.se/resources/stations/'}
		],
		type: 'https://meta.fieldsites.se/resources/objspecs/',
		format: 'https://meta.fieldsites.se/ontologies/sites/',
		valType: 'https://meta.fieldsites.se/resources/',
		quantityKind: 'https://meta.fieldsites.se/resources/'
	}
};

interface IFilter {
	 [key: string]: {
		 title: string;
		 list: string[];
	 }[]
}

export const filters: IFilter = {
	ICOS: [
		{title: "Data origin", list: ['project', 'theme', 'station', 'submitter']},
		{title: "Data types", list: ['type', 'level', 'format']},
		{title: "Value types", list: ['colTitle', 'valType', 'quantityUnit', 'quantityKind']}
	],
	SITES: [
		{title: "Data origin", list: ['project', 'theme', 'station']},
		{title: "Data types", list: ['type', 'level', 'format']},
		{title: "Value types", list: ['colTitle', 'valType', 'quantityUnit']}
	]
};
