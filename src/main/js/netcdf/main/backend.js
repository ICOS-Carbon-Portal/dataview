import 'whatwg-fetch';
import {getBinRaster} from '../../common/main/backend/binRaster';
import {getJson} from '../../common/main/backend/json';
import {feature} from 'topojson';

export function getRaster(service, variable, date, elevation, gamma){
	const basicIdRaster = getBinRaster(null, '/netcdf/getSlice', ['service', service], ['varName', variable], ['date', date], ['elevation', elevation]);
	return basicIdRaster.then(raster => {
		raster.basicId = raster.id;
		raster.id = raster.basicId + gamma;
		return raster;
	});
}

export function getServices(){
	return getJson('/netcdf/listNetCdfFiles');
}

export function getVariablesAndDates(service){
	const vars = getJson('/netcdf/listVariables', ['service', service]);
	const dates = getJson('/netcdf/listDates', ['service', service]);
	return Promise.all([vars, dates]).then(([variables, dates]) => {return {variables, dates};});
}

export function getElevations(service, variable){
	return getJson('/netcdf/listElevations', ['service', service], ['varName', variable]);
}

export function getCountriesGeoJson(){
	return getJson('https://static.icos-cp.eu/js/topojson/readme-world.json')
		.then(topo => feature(topo, topo.objects.countries));
}
