export const SPECCOL = 'spec';

export function specBasics(config){
	return `prefix cpmeta: <${config.cpmetaOntoUri}>
select ?spec ?specLabel ?level ?format
where{
	?spec cpmeta:hasDataLevel ?level .
	?spec rdfs:label ?specLabel .
	?spec cpmeta:hasFormat [rdfs:label ?format ]
}`;
}

export function specColumnMeta(config){
	return `prefix cpmeta: <${config.cpmetaOntoUri}>
select distinct ?spec ?colTitle ?valType
(if(bound(?qKind), ?qKind, "(not applicable)") as ?quantityKind)
(if(bound(?unit), ?unit, "(not applicable)") as ?quantityUnit)
where{
	?spec cpmeta:containsDataset [cpmeta:hasColumn ?column ] .
	?column cpmeta:hasColumnTitle ?colTitle .
	?column cpmeta:hasValueType ?valTypeRes .
	?valTypeRes rdfs:label ?valType .
	OPTIONAL{?valTypeRes cpmeta:hasQuantityKind [rdfs:label ?qKind] }
	OPTIONAL{?valTypeRes cpmeta:hasUnit ?unit }
}`;
}

export function dobjOriginsAndCounts(config){
	return `prefix cpmeta: <${config.cpmetaOntoUri}>
prefix prov: <http://www.w3.org/ns/prov#>
select
?spec
(sample(?submitterName) as ?submitter)
(if(bound(?stationName), ?stationName, "(not applicable)") as ?station)
(count(?dobj) as ?count)
(if(sample(?submitterClass) = cpmeta:ThematicCenter, "ICOS", "Non-ICOS") as ?isIcos)
where{
	?dobj cpmeta:hasObjectSpec ?spec .
	?dobj cpmeta:wasSubmittedBy [
		prov:wasAssociatedWith ?submitterRes ;
		prov:endedAtTime []
	] .
	OPTIONAL{
		?dobj cpmeta:wasAcquiredBy/prov:wasAssociatedWith/cpmeta:hasName ?stationName
	}
	?submitterRes cpmeta:hasName ?submitterName .
	?submitterRes a ?submitterClass .
	FILTER(?submitterClass != owl:NamedIndividual)
}
group by ?spec ?submitterRes ?stationName`;
}

export function findDobjs(config, search){
	return `prefix cpmeta: <${config.cpmetaOntoUri}>
SELECT ?dobj WHERE{
  ?dobj  cpmeta:hasObjectSpec ?spec.
  FILTER CONTAINS(LCASE(REPLACE(STR(?dobj), "${config.cpmetaObjectUri}", "")), LCASE("${search}"))
}`;
}

export function findStations(config, search){
	return `PREFIX cpst: <http://meta.icos-cp.eu/ontologies/stationentry/>
SELECT DISTINCT (str(?lName) AS ?Long_name)
FROM <http://meta.icos-cp.eu/resources/stationentry/>
WHERE {
  ?s cpst:hasLongName ?lName .
  FILTER CONTAINS(LCASE(STR(?lName)), LCASE("${search}"))
}
ORDER BY ?Long_name`;
}

export function rdfGraphsAndSpecFormats(config){
	return `prefix cpmeta: <${config.cpmetaOntoUri}>
select ?graph (sample(?fmt) as ?format) where{
	?spec cpmeta:hasFormat [rdfs:label ?fmt] .
	graph ?graph {
	?dobj cpmeta:hasObjectSpec ?spec .
	}
}
group by ?graph`;
}

export function listFilteredDataObjects(config, specs, stations, limit, offset){

	const specsFilter = (specs && specs.length)
		 ? `VALUES ?${SPECCOL} {<` + specs.join('> <') + '>}'
		 : '';

	return `prefix cpmeta: <${config.cpmetaOntoUri}>
prefix prov: <http://www.w3.org/ns/prov#>
select ?dobj ?fileName where {
	${specsFilter}
	?dobj cpmeta:hasObjectSpec ?${SPECCOL} .
	?dobj cpmeta:hasName ?fileName .
	FILTER EXISTS{ ?dobj cpmeta:wasSubmittedBy/prov:endedAtTime []}
}
offset ${offset || 0} limit ${limit || 50}`;
}


