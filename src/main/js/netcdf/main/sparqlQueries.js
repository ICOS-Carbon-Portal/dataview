export function objectSpecification(config, objId){
	return `prefix cpmeta: <${config.cpmetaOntoUri}>
select * where{
	<${config.cpmetaObjectUri}${objId}> cpmeta:hasObjectSpec ?objSpec .
	?objSpec rdfs:label ?specLabel ;
}`;
}
