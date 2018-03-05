
//var endpoint = 'http://127.0.0.1:9094/sparql';
var endpoint = 'https://meta.icos-cp.eu/sparql';

const host = location.host.replace('data', 'meta');
const envri = location.host.indexOf('fieldsites.se') >= 0 ? 'SITES' : 'ICOS';

export default {
	sparqlEndpoint: endpoint,
	cpmetaOntoUri: 'http://meta.icos-cp.eu/ontologies/cpmeta/',
	cpmetaResUri: 'http://meta.icos-cp.eu/resources/cpmeta/',
	cpmetaObjectUri: `https://${host}/objects/`,
	envri: envri,
}
