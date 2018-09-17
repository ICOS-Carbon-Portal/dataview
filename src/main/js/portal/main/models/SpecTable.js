import {SPECCOL} from '../sparqlQueries';

export default class SpecTable{
	constructor(colNames, rows, filters){
		this._colNames = colNames;

		if(filters) this._filters = filters;
		else {
			this._filters = {};
			this._colNames.forEach(col => this._filters[col] = []);
		}

		this._speciesCount = distinct(rows.map(row => row[SPECCOL])).length;
		this._rows = rows;
	}

	get serialize(){
		return {
			colNames: this._colNames,
			rows: this._rows,
			filters: this._filters
		};
	}

	get names(){
		return this._colNames.filter(col => col !== SPECCOL);
	}

	withFilter(colName, values){
		if(!this._colNames.includes(colName)) return this;
		const newFilters = Object.assign({}, this._filters, {[colName]: values});
		return new SpecTable(this._colNames, this._rows, newFilters);
	}

	getFilter(colName){
		return this._filters[colName] || [];
	}

	withResetFilters(){
		return new SpecTable(this._colNames, this._rows);
	}

	getDistinctAvailableColValues(colName){
		return distinct(this.rowsFilteredByOthers(colName).map(row => row[colName]));
	}

	getDistinctColValues(colName){
		return distinct(this.filteredRows.map(row => row[colName]));
	}

	rowsFilteredByOthers(excludedColumn){
		const filters = Object.assign({}, this._filters);
		filters[excludedColumn] = [];
		return filterRows(this._rows, filters);
	}

	get filteredRows(){
		return filterRows(this._rows, this._filters);
	}

	get speciesFilter(){
		if(this.names.every(name => this._filters[name].length === 0)) return [];
		const filter = this.getDistinctAvailableColValues(SPECCOL);
		return filter.length === this._speciesCount ? [] : filter;
	}

	getColumnValuesFilter(colName){
		return this._colNames.some(name => this._filters[name].length !== 0)
			? this.getDistinctColValues(colName)
			: [];
	}

}

function distinct(stringArray){
	return Array.from(new Set(stringArray).values());
}

function filterRows(rows, filters){
	const colNames = Object.keys(filters);
	return rows.filter(row => {
		return colNames.every(colName => {
			const filter = filters[colName];
			return !filter.length || filter.includes(row[colName]);
		});
	});
}

