import commonConfig from '../../common/main/config';
import localConfig from './config';
import {KeyAnyVal, UrlStr} from "./backend/declarations";
import {Query} from './backend/sparql';

const config = Object.assign(commonConfig, localConfig);

export const SPECCOL = 'spec';

export function specBasics(): Query<"spec" | "type" | "specLabel" | "level" | "format" | "formatLabel" | "theme" | "themeLabel", "dataset"> {
	const text = `prefix cpmeta: <${config.cpmetaOntoUri}>
select ?spec (?spec as ?type) ?specLabel ?level ?dataset ?format ?formatLabel ?theme (if(bound(?theme), ?themeLbl, "(not applicable)") as ?themeLabel)
where{
	?spec cpmeta:hasDataLevel ?level .
	FILTER NOT EXISTS {?spec cpmeta:hasAssociatedProject/cpmeta:hasHideFromSearchPolicy "true"^^xsd:boolean}
	FILTER(STRSTARTS(str(?spec), "${config.sparqlGraphFilter}"))
	?spec cpmeta:hasDataTheme ?theme .
	?theme rdfs:label ?themeLbl .
	OPTIONAL{?spec cpmeta:containsDataset ?dataset}
	FILTER EXISTS{?dobj cpmeta:hasObjectSpec ?spec . filter not exists {[] cpmeta:isNextVersionOf ?dobj}}
	?spec rdfs:label ?specLabel .
	?spec cpmeta:hasFormat ?format .
	?format rdfs:label ?formatLabel .
}`;

	return {text};
}

export function specColumnMeta(): Query<"spec" | "colTitle" | "valType" | "valTypeLabel" | "quantityKindLabel" | "quantityUnit", "quantityKind"> {
	const text = `prefix cpmeta: <${config.cpmetaOntoUri}>
select distinct ?spec ?colTitle ?valType ?valTypeLabel ?quantityKind
(if(bound(?quantityKind), ?qKindLabel, "(not applicable)") as ?quantityKindLabel)
(if(bound(?unit), ?unit, "(not applicable)") as ?quantityUnit)
where{
	?spec cpmeta:containsDataset [cpmeta:hasColumn ?column ] .
	FILTER NOT EXISTS {?spec cpmeta:hasAssociatedProject/cpmeta:hasHideFromSearchPolicy "true"^^xsd:boolean}
	FILTER(STRSTARTS(str(?spec), "${config.sparqlGraphFilter}"))
	FILTER EXISTS {[] cpmeta:hasObjectSpec ?spec}
	?column cpmeta:hasColumnTitle ?colTitle .
	?column cpmeta:hasValueType ?valType .
	?valType rdfs:label ?valTypeLabel .
	OPTIONAL{
		?valType cpmeta:hasQuantityKind ?quantityKind .
		?quantityKind rdfs:label ?qKindLabel .
	}
	OPTIONAL{?valType cpmeta:hasUnit ?unit }
}`;

	return {text};
}


export function dobjOriginsAndCounts(): Query<"spec" | "submitter" | "submitterLabel" | "project" | "projectLabel" | "count" | "stationLabel", "station"> {
	//This is needed to get rid of duplicates due to multiple labels for stations.
	//TODO Stop fetching labels in this query, use a dedicated label fetcher that prepares label lookup
	const fromClauses = config.envri == 'ICOS'
		? `from <http://meta.icos-cp.eu/resources/cpmeta/>
from <http://meta.icos-cp.eu/ontologies/cpmeta/>
from <http://meta.icos-cp.eu/resources/stations/>
from <http://meta.icos-cp.eu/resources/wdcgg/>`
		: '';

	const text = `prefix cpmeta: <${config.cpmetaOntoUri}>
prefix prov: <http://www.w3.org/ns/prov#>
select ?spec ?submitter ?submitterLabel ?project ?projectLabel ?count
(if(bound(?stationName), ?station0, ?stationName) as ?station)
(if(bound(?stationName), CONCAT(?stPrefix, ?stationName), "(not applicable)") as ?stationLabel)
${fromClauses}
where{
	{
		select * where{
			[] cpmeta:hasStatProps [
				cpmeta:hasStatCount ?count;
				cpmeta:hasStatStation ?station0;
				cpmeta:hasStatSpec ?spec;
				cpmeta:hasStatSubmitter ?submitter
			] .
			OPTIONAL{?station0 cpmeta:hasName ?stationName}
			OPTIONAL{?station0 cpmeta:hasStationId ?stId}
		}
	}
	BIND( IF(bound(?stId), CONCAT("(", ?stId, ") "),"") AS ?stPrefix)
	FILTER(STRSTARTS(str(?spec), "${config.sparqlGraphFilter}"))
	?spec cpmeta:hasAssociatedProject ?project .
	FILTER NOT EXISTS {?project cpmeta:hasHideFromSearchPolicy "true"^^xsd:boolean}
	?submitter cpmeta:hasName ?submitterLabel .
	?project rdfs:label ?projectLabel .
	}`;

	return {text};
}

export function findDobjs(search: string): Query<string, "dobj"> {
	const text = `prefix cpmeta: <${config.cpmetaOntoUri}>
SELECT ?dobj WHERE{
  ?dobj  cpmeta:hasObjectSpec ?spec.
  FILTER NOT EXISTS {?spec cpmeta:hasAssociatedProject/cpmeta:hasHideFromSearchPolicy "true"^^xsd:boolean}
  FILTER NOT EXISTS {[] cpmeta:isNextVersionOf ?dobj}
  FILTER CONTAINS(LCASE(REPLACE(STR(?dobj), "${config.cpmetaObjectUri}", "")), LCASE("${search}"))
}`;

	return {text};
}

export function findStations(search: string){
	return `PREFIX cpst: <http://meta.icos-cp.eu/ontologies/stationentry/>
SELECT DISTINCT (str(?lName) AS ?Long_name)
FROM <http://meta.icos-cp.eu/resources/stationentry/>
WHERE {
  ?s cpst:hasLongName ?lName .
  FILTER CONTAINS(LCASE(STR(?lName)), LCASE("${search}"))
}
ORDER BY ?Long_name`;
}

export const listKnownDataObjects = (dobjs: string[]): Query<"dobj" | "spec" | "fileName" | "size" | "submTime" | "timeStart" | "timeEnd", string> => {
	const values = dobjs.map(d => `<${config.cpmetaObjectUri}${d}>`).join(' ');
	const text = `prefix cpmeta: <${config.cpmetaOntoUri}>
prefix prov: <http://www.w3.org/ns/prov#>
select ?dobj ?spec ?fileName ?size ?submTime ?timeStart ?timeEnd
where {
VALUES ?dobj { ${values} }
?dobj cpmeta:hasObjectSpec ?spec .
?dobj cpmeta:hasSizeInBytes ?size .
?dobj cpmeta:hasName ?fileName .
?dobj cpmeta:wasSubmittedBy/prov:endedAtTime ?submTime .
?dobj cpmeta:hasStartTime | (cpmeta:wasAcquiredBy / prov:startedAtTime) ?timeStart .
?dobj cpmeta:hasEndTime | (cpmeta:wasAcquiredBy / prov:endedAtTime) ?timeEnd .
}`;

	return {text};
};

export const listFilteredDataObjects = (options: any): Query<"dobj" | "spec" | "fileName" | "size" | "submTime" | "timeStart" | "timeEnd", string> => {

	function isEmpty(arr: []){return !arr || !arr.length;}

	const {specs, stations, submitters, sorting, paging, rdfGraphs, filters} = options;

	const fromClause = isEmpty(rdfGraphs) ? '' : 'FROM <' + rdfGraphs.join('>\nFROM <') + '>\n';

	const specsValues = isEmpty(specs)
		? `?${SPECCOL} cpmeta:hasDataLevel [] .
			FILTER(STRSTARTS(str(?${SPECCOL}), "${config.sparqlGraphFilter}"))
			FILTER NOT EXISTS {?${SPECCOL} cpmeta:hasAssociatedProject/cpmeta:hasHideFromSearchPolicy "true"^^xsd:boolean}`
		: `VALUES ?${SPECCOL} {<` + specs.join('> <') + '>}';

	const submitterSearch = isEmpty(submitters) ? ''
		: `VALUES ?submitter {<${submitters.join('> <')}>}
			?dobj cpmeta:wasSubmittedBy/prov:wasAssociatedWith ?submitter`;

	const dobjStation = '?dobj cpmeta:wasAcquiredBy/prov:wasAssociatedWith ';

	const noStationFilter = `FILTER NOT EXISTS{${dobjStation} []}`;

	function stationsFilter(stations: any[]){
		return `VALUES ?station {<${stations.join('> <')}>}` +
			'\n' + dobjStation + '?station .';
	}

	const stationSearch = isEmpty(stations) ? '' : stations.some((s: any) => !s)
		? stations.length === 1
			? noStationFilter
			: `{{
					${noStationFilter}
				} UNION {
					${stationsFilter(stations.filter((s: any) => !!s))}
				}}`
		: stationsFilter(stations);

	const filterClauses = getFilterClauses(filters);

	const orderBy = (sorting && sorting.varName)
		? (
			sorting.ascending
				? `order by ?${sorting.varName}`
				: `order by desc(?${sorting.varName})`
			)
		: '';

	const text = `prefix cpmeta: <${config.cpmetaOntoUri}>
prefix prov: <http://www.w3.org/ns/prov#>
select ?dobj ?${SPECCOL} ?fileName ?size ?submTime ?timeStart ?timeEnd
${fromClause}where {
	${specsValues}
	?dobj cpmeta:hasObjectSpec ?${SPECCOL} .
	${stationSearch}
	${submitterSearch}
	FILTER NOT EXISTS {[] cpmeta:isNextVersionOf ?dobj}
	?dobj cpmeta:hasSizeInBytes ?size .
	?dobj cpmeta:hasName ?fileName .
	?dobj cpmeta:wasSubmittedBy/prov:endedAtTime ?submTime .
	?dobj cpmeta:hasStartTime | (cpmeta:wasAcquiredBy / prov:startedAtTime) ?timeStart .
	?dobj cpmeta:hasEndTime | (cpmeta:wasAcquiredBy / prov:endedAtTime) ?timeEnd .
	${filterClauses}
}
${orderBy}
offset ${paging.offset || 0} limit ${paging.limit || 20}`;

	return {text};
};

const getFilterClauses = (filters: KeyAnyVal) => {
	const andFilters = filters.reduce((acc: any[], f: KeyAnyVal) => {
		if (f.fromDateTimeStr) {
			const cond = f.category === 'dataTime' ? '?timeStart' : '?submTime';
			acc.push(`${cond} >= '${f.fromDateTimeStr}'^^xsd:dateTime`);
		}
		if (f.toDateTimeStr) {
			const cond = f.category === 'dataTime' ? '?timeEnd' : '?submTime';
			acc.push(`${cond} <= '${f.toDateTimeStr}'^^xsd:dateTime`);
		}

		return acc;
	}, []).join(' && ');

	const orFilters = filters.reduce((acc: any[], f: KeyAnyVal) => {
		if (f.category === 'pids'){
			// Do not use prefix since it cannot be used with pids starting with '-'
			f.pids.forEach((fp: string) => acc.push(`?dobj = <${config.cpmetaObjectUri}${fp}>`));
		}

		return acc;
	}, []).join(' || ');

	let filterClauses = andFilters.length || orFilters.length
		? 'FILTER ('
		: '';
	if (filterClauses.length){
		if (andFilters.length && orFilters.length){
			filterClauses += `${andFilters} && (${orFilters}))`;
		} else if (andFilters.length){
			filterClauses += `${andFilters})`;
		}
		else if (orFilters.length){
			filterClauses += `${orFilters})`;
		}
	}

	return filterClauses;
};

export const extendedDataObjectInfo = (dobjs: string[]): Query<"dobj", "station" | "stationId" | "samplingHeight" | "theme" | "themeIcon" | "title" | "description" | "columnNames"> => {
	const dobjsList = dobjs.map(dobj => `<${dobj}>`).join(' ');
	const text = `prefix cpmeta: <${config.cpmetaOntoUri}>
prefix prov: <http://www.w3.org/ns/prov#>
select distinct ?dobj ?station ?stationId ?samplingHeight ?theme ?themeIcon ?title ?description ?columnNames where{
	{
		select ?dobj (min(?station0) as ?station) (sample(?stationId0) as ?stationId) (sample(?samplingHeight0) as ?samplingHeight) where{
			VALUES ?dobj { ${dobjsList} }
			OPTIONAL{
				?dobj cpmeta:wasAcquiredBy ?acq.
				?acq prov:wasAssociatedWith ?stationUri .
				OPTIONAL{ ?stationUri cpmeta:hasName ?station0 }
				OPTIONAL{ ?stationUri cpmeta:hasStationId ?stationId0 }
				OPTIONAL{ ?acq cpmeta:hasSamplingHeight ?samplingHeight0 }
			}
		}
		group by ?dobj
	}
	?dobj cpmeta:hasObjectSpec ?specUri .
	OPTIONAL{ ?specUri cpmeta:hasDataTheme [
		rdfs:label ?theme ;
		cpmeta:hasIcon ?themeIcon
	]}
	OPTIONAL{?specUri rdfs:comment ?spec }
	OPTIONAL{ ?dobj <http://purl.org/dc/terms/title> ?title }
	OPTIONAL{ ?dobj <http://purl.org/dc/terms/description> ?description0 }
	OPTIONAL{?dobj cpmeta:hasActualColumnNames ?columnNames }
	BIND ( IF(bound(?description0), ?description0, ?spec) AS ?description)
}`;

	return {text};
};

export const resourceHelpInfo = (uriList: UrlStr[]): Query<"uri", "label" | "comment" | "webpage"> => {
	const text = `select * where{
	VALUES ?uri { ${uriList.map(uri => '<' + uri + '>').join(' ')} }
	?uri rdfs:label ?label .
	OPTIONAL{?uri rdfs:comment ?comment}
	OPTIONAL{?uri rdfs:seeAlso ?webpage}
}
order by ?label`;

	return {text};
};
