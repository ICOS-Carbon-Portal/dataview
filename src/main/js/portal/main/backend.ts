import { sparqlFetch, sparqlFetchAndParse } from './backend/SparqlFetch';
import * as queries from './sparqlQueries';
import commonConfig from '../../common/main/config';
import localConfig from './config';
import Cart, {JsonCart} from './models/Cart';
import Storage from './models/Storage';
import {FilterRequest} from './models/FilterRequest';
import {UrlStr, Sha256Str, AsyncResult} from "./backend/declarations";
import { sparqlParsers } from "./backend/sparql";
import { Profile, ExtendedDobjInfo, TsSetting, TsSettings, User, WhoAmI, LabelLookup, StationPos4326Lookup} from "./models/State";
import {getLastSegmentInUrl, throwError, uppercaseFirstChar} from './utils';
import {ObjInfoQuery} from "./sparqlQueries";
import {Filter} from "./models/SpecTable";
import keywordsInfo, { KeywordsInfo } from "./backend/keywordsInfo";
import {QueryParameters} from "./actions/types";
import { SpecTableSerialized } from './models/CompositeSpecTable';
import { References } from '../../common/main/metacore';
import {getJson, sparql} from 'icos-cp-backend';
import { feature } from 'topojson-client';
import { GeometryCollection } from "topojson-specification";
import { PersistedMapPropsExtended } from './models/InitMap';
import {HelpStorageListEntry} from "./models/HelpStorage";

const config = Object.assign(commonConfig, localConfig);
const tsSettingsStorageName = 'tsSettings';
const tsSettingsStorage = new Storage();

const fetchSpecBasics = () => {
	const query = queries.specBasics();

	return sparqlFetchAndParse(query, config.sparqlEndpoint, b => ({
		spec: b.spec.value,
		project: b.project.value,
		type: b.type.value,
		level: parseInt(b.level.value),
		dataset: b.dataset?.value,
		format: b.format.value,
		theme: b.theme.value,
		temporalResolution: b.temporalResolution?.value
	}));
};

const fetchSpecColumnMeta = () => {
	const query = queries.specColumnMeta();

	return sparqlFetchAndParse(query, config.sparqlEndpoint, b => ({
		spec: b.spec.value,
		variable: b.variable.value,
		varTitle: b.varTitle.value,
		valType: b.valType.value,
		quantityKind: sparqlParsers.fromUrl(b.quantityKind),
		quantityUnit: b.quantityUnit.value
	}));
};

export const fetchDobjOriginsAndCounts = (filters: FilterRequest[]) => {
	const query = queries.dobjOriginsAndCounts(filters);

	return sparqlFetchAndParse(query, config.sparqlEndpoint, b => ({
		spec: b.spec.value,
		countryCode: b.countryCode?.value,
		submitter: b.submitter.value,
		count: parseInt(b.count.value),
		station: b.station?.value,
		site: b.site?.value,
		ecosystem: b.ecosystem?.value,
		location: b.location?.value,
		stationclass: b.stationclass?.value,
		stationNetwork: b.stationNetwork?.value
	}));
};

function fetchStationPositions(): Promise<StationPos4326Lookup> {
	const query = queries.stationPositions();

	return sparqlFetchAndParse(query, config.sparqlEndpoint, b => ({
		station: b.station.value,
		lon: parseFloat(b.lon.value),
		lat: parseFloat(b.lat.value)
	})).then(sparqlRes => sparqlRes.rows.reduce<StationPos4326Lookup>(
		(acc, stLatLon) => {
			acc[stLatLon.station] = stLatLon;
			return acc;
		},
		{}
	));
};

export type RawListItem = {label?: string, comment?: string, webpage?: string, stationId?: string};
export const makeHelpStorageListItem = (item: RawListItem): HelpStorageListEntry => {
	if (item.label === undefined && item.comment === undefined && item.webpage === undefined)
		// Log error so we can catch this in development
		console.error("Cannot make makeHelpStorageListItem since label, comment and webpage are undefined");

	return {
		label: item.label,
		comment: item.comment ? uppercaseFirstChar(item.comment) : undefined,
		webpage: item.webpage ? item.webpage as UrlStr : undefined
	};
};

export function fetchLabelLookup(): Promise<LabelLookup> {
	const query = queries.labelLookup();

	return sparqlFetchAndParse(query, config.sparqlEndpoint, b => ({
		uri: b.uri.value,
		label: b.label.value,
		comment: b.comment?.value,
		stationId: b.stationId?.value,
		webpage: b.webpage?.value
	})).then(ll => ll.rows.reduce<LabelLookup>((acc, item) => {

		if (acc[item.uri] === undefined) {
			acc[item.uri] = {
				label: item.stationId && config.features.displayStationIds ? `(${item.stationId}) ${item.label}` : item.label,
				list: item.comment
					? [makeHelpStorageListItem({comment: item.comment, webpage: item.webpage})]
					: []
			};

		} else if (item.comment) {
			// Filter out duplicate website urls
			const webpage = acc[item.uri].list.some(list => list.webpage === item.webpage)
				? undefined
				: item.webpage;
			acc[item.uri].list.push(makeHelpStorageListItem({comment: item.comment, webpage}));

		}
		return acc;
	}, {}));
}

export type BootstrapData = {
	specTables: SpecTableSerialized
	labelLookup: LabelLookup
	keywords: KeywordsInfo
	countryCodes: Record<string, string>
	stationPos4326Lookup: StationPos4326Lookup
}

export function fetchBoostrapData(filters: FilterRequest[]): Promise<BootstrapData> {

	return Promise.all([
		fetchSpecTableData(filters),
		fetchLabelLookup(),
		keywordsInfo.fetch(),
		fetchStationPositions(),
		getJson('https://static.icos-cp.eu/constant/misc/countries.json')
	]).then(
		([specTables, labelLookup, keywords, stationPos4326Lookup, countryCodes]) => ({
			specTables,
			labelLookup,
			keywords,
			countryCodes,
			stationPos4326Lookup
		})
	)
}

export function fetchSpecTableData(filters: FilterRequest[]): Promise<SpecTableSerialized> {

	return Promise.all([
		fetchSpecBasics(),
		fetchSpecColumnMeta(),
		fetchDobjOriginsAndCounts(filters)
	]).then(
		([basics, columnMeta, origins]) => ({
			basics, columnMeta, origins
		})
	)
}

export const fetchKnownDataObjects = (dobjs: string[]) => {
	return dobjs.length
		? fetchAndParseDataObjects(queries.listKnownDataObjects(dobjs))
		: Promise.resolve({colNames: [], rows: []});
};

export function fetchFilteredDataObjects(options: QueryParameters){
	return Filter.allowsNothing(options.specs) || Filter.allowsNothing(options.submitters) || Filter.allowsNothing(options.stations)
		? Promise.resolve({
			colNames: [],
			rows: []
		})
		: fetchAndParseDataObjects(queries.listFilteredDataObjects(options));
}

const fetchAndParseDataObjects = (query: ObjInfoQuery) => {
	return sparqlFetchAndParse(query, config.sparqlEndpoint, b => ({
		dobj: sparqlParsers.fromUrl(b.dobj),
		hasNextVersion: sparqlParsers.fromBoolean(b.hasNextVersion),
		spec: sparqlParsers.fromUrl(b.spec),
		fileName: sparqlParsers.fromString(b.fileName),
		size: sparqlParsers.fromLong(b.size),
		submTime: sparqlParsers.fromDateTime(b.submTime),
		timeStart: sparqlParsers.fromDateTime(b.timeStart),
		timeEnd: sparqlParsers.fromDateTime(b.timeEnd),
		hasVarInfo: sparqlParsers.fromBoolean(b.hasVarInfo)
	}));
};

export function sparqlFetchBlob(queryTxt: string, acceptCachedResults: boolean = true) {
	return sparqlFetch(queryTxt, config.sparqlEndpoint, 'CSV', acceptCachedResults)
		.then(resp => resp.blob());
}

export function checkDobjExists(search: Sha256Str, showDeprecated: Boolean): Promise<boolean> {
	const query = queries.findDobjByUrlId(search, showDeprecated);
	return sparql(query, config.sparqlEndpoint, true).then(res => res.results.bindings.length > 0);
}

export function searchDobjByFileName(fileName: string, showDeprecated: Boolean): Promise<{dobj: Sha256Str}[]> {
	const query = queries.getDobjByFileName(fileName, showDeprecated);

	return sparqlFetchAndParse(query, config.sparqlEndpoint, b => ({
		dobj: getLastSegmentInUrl(sparqlParsers.fromUrl(b.dobj)) || throwError(`Expected a data object URL, got ${b.dobj.value}`)
	})).then(res => res.rows);
}

export const saveCart = (email: string | null, cart: Cart): Promise<void> => {
	if (email){
		updatePersonalRestheart(email, {cart});
	}
	return Promise.resolve();
};

const updatePersonalRestheart = (email: string, data: {}): void => {
	fetch(`${config.restheartProfileBaseUrl}/${email}`, {
		credentials: 'include',
		method: 'PATCH',
		mode: 'cors',
		headers: new Headers({
			'Content-Type': 'application/json'
		}),
		body: JSON.stringify(data)
	});
};

export const getError = (errorId: string): Promise<any> => {
	return fetch(`${config.portalUseLogUrl}/${errorId}`).then(resp => {
		return resp.status === 200
			? Promise.resolve(resp.json())
			: Promise.resolve(undefined);
	});
};

export const logOut = (): Promise<boolean> => {
	return fetch('/logout', {credentials: 'include'}).then(resp => {
		return resp.status === 200
			? Promise.resolve(true)
			: Promise.reject(false);
	});
};

export const getCart = (email: string | null) => {
	return email
		? Promise.resolve(getFromRestheart<{ cart: JsonCart }>(email, 'cart'))
		: Promise.resolve({ cart: new Cart().serialize });
};

const getFromRestheart = <T>(email: string, key: string): Promise<T> => {
	const keyFilter = encodeURIComponent(`{${key}:1}`);
	return fetch(`${config.restheartProfileBaseUrl}/${email}?keys=${keyFilter}`, {credentials: 'include'})
		.then(resp => {
			return resp.status === 200
				? resp.json() as unknown as T
				: {} as T;
		});
};

export const getIsBatchDownloadOk = (): Promise<boolean> => {
	return fetch('../objects?ids=[]&fileName=test', {credentials: 'include'})
		.then(response => response.status === 200);
};

export function getWhoIam(){
	return fetch('/whoami', {credentials: 'include'})
		.then(resp => {
			return resp.status === 200
				? resp.json() as unknown as WhoAmI
				: {email: null};
		});
}

export const getProfile = (email: string | null): Promise<User['profile']> => {
	return email
		? getFromRestheart<Profile>(email, 'profile')
		: Promise.resolve({});
};

export const getExtendedDataObjInfo = (dobjs: UrlStr[]): Promise<ExtendedDobjInfo[]> => {
	if (dobjs.length == 0) return Promise.resolve([]);

	const query = queries.extendedDataObjectInfo(dobjs);

	return sparqlFetchAndParse(query, config.sparqlEndpoint, b => ({
		dobj: sparqlParsers.fromUrl(b.dobj),
		station: sparqlParsers.fromString(b.station),
		stationId: sparqlParsers.fromString(b.stationId),
		samplingHeight: sparqlParsers.fromFloat(b.samplingHeight),
		samplingPoint: sparqlParsers.fromString(b.samplingPoint),
		theme: sparqlParsers.fromString(b.theme),
		themeIcon: sparqlParsers.fromString(b.themeIcon),
		title: sparqlParsers.fromString(b.title),
		description: sparqlParsers.fromString(b.description),
		specComments: sparqlParsers.fromString(b.specComments),
		columnNames: b.columnNames ? JSON.parse(b.columnNames.value) as string[] : undefined,
		site: b.site?.value,
		hasVarInfo: sparqlParsers.fromBoolean(b.hasVarInfo),
		dois: b.dois && b.dois.value !== "" ? b.dois.value.split('|') : undefined,
		biblioInfo: sparqlParsers.fromString(b.biblioInfo)
	})).then(res => res.rows.map(
		({biblioInfo, ...row}) => ({
			...row,
			biblioInfo: biblioInfo ? JSON.parse(biblioInfo) as References : undefined
		})
	));
};

export const fetchResourceHelpInfo = (uriList: UrlStr[]) => {
	const query = queries.resourceHelpInfo(uriList);

	return sparqlFetchAndParse(query, config.sparqlEndpoint, b => ({
		uri: sparqlParsers.fromUrl(b.uri),
		label: sparqlParsers.fromString(b.label),
		comment: sparqlParsers.fromString(b.comment),
		webpage: sparqlParsers.fromUrl(b.webpage)
	})).then(res => res.rows);
};

export const saveTsSetting = (email: string | null, spec: string, type: string, val: string) => {
	const settings: TsSettings = tsSettingsStorage.getItem(tsSettingsStorageName) || {};
	const setting = settings[spec] || {} as TsSetting;
	const newSetting: TsSetting = { ...setting, ...{ [type]: val } };
	const newSettings: TsSettings = { ...settings, ...{ [spec]: newSetting } };
	tsSettingsStorage.setItem(tsSettingsStorageName, newSettings);

	if (email){
		updatePersonalRestheart(email, {[tsSettingsStorageName]: newSettings});
	}

	return Promise.resolve(newSettings);
};

export const getTsSettings = (email: string | null) => {
	const tsSettings = tsSettingsStorage.getItem(tsSettingsStorageName) || {};

	return email
		? getFromRestheart<Record<string,string>>(email, tsSettingsStorageName).then(settings => {
			const newSettings = settings
				? Object.assign({}, settings[tsSettingsStorageName], tsSettings)
				: tsSettings;
			tsSettingsStorage.setItem(tsSettingsStorageName, newSettings);

			return newSettings;
		})
		: Promise.resolve(tsSettings);
};

export const fetchJson = <T>(url: UrlStr, method: string = 'GET'): Promise<T> => {
	return fetch(url, {
		method,
		mode: 'cors',
		headers: new Headers({
			'Accept': 'application/json'
		})
	}).then(resp => {
		return resp.status === 200
			? resp.json()
			: undefined;
	});
};

export type CountriesTopo = GeoJSON.FeatureCollection<GeoJSON.GeometryObject, GeoJSON.GeoJsonProperties>
export const getCountriesGeoJson = async (): Promise<CountriesTopo> => {
	const sessionStorageKey = 'countriesTopo';
	const countriesTopoStorage = sessionStorage.getItem(sessionStorageKey);

	if (countriesTopoStorage)
		return Promise.resolve(JSON.parse(countriesTopoStorage));

	return getJson('https://static.icos-cp.eu/js/topojson/map-2.5k.json')
		.then(topo => {
			const countriesTopo = feature(topo, topo.objects.map as GeometryCollection<GeoJSON.GeoJsonProperties>);
			sessionStorage.setItem(sessionStorageKey, JSON.stringify(countriesTopo));

			return countriesTopo
		});
};

const persistedMapPropsSessStorageKey = 'persistedMapProps';
export const savePersistedMapProps = (persistedMapProps: PersistedMapPropsExtended) => {
	const { drawFeatures, ...mapProps } = persistedMapProps;
	sessionStorage.setItem(persistedMapPropsSessStorageKey, JSON.stringify(mapProps));
};

export function getPersistedMapProps(): PersistedMapPropsExtended | undefined {
	const sessStorageMapProps = sessionStorage.getItem(persistedMapPropsSessStorageKey);

	if (sessStorageMapProps){
		return JSON.parse(sessStorageMapProps);
	}

	return undefined;
};
