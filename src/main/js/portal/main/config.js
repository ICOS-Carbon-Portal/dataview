export default {
	ROUTE_SEARCH: 'search',
	ROUTE_CART: 'cart',
	TIMESERIES: 'TIMESERIES',
	NETCDF: 'NETCDF',
	iFrameBaseUrl: {
		TIMESERIES: '//data.icos-cp.eu/dygraph-light/',
		NETCDF: '//data.icos-cp.eu/netcdf/'
	},
	restheartBaseUrl: '//cpauth.icos-cp.eu/db/',
	restheartPortalUseBaseUrl: '//restheart.icos-cp.eu/db/',
};

export const placeholders = {
	specLabel: 'Specification',
	level: 'Data level',
	format: 'Format',
	colTitle: 'Column name',
	valType: 'Value type',
	quantityKind: 'Quantity kind',
	quantityUnit: 'Unit',
	submitter: 'Data submitter',
	station: 'Station of origin',
	isIcos: 'ICOS / non-ICOS data'
};
