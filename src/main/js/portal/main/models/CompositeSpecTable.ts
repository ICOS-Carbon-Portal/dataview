import {
	SpecBasicsQuery,
	SpecVarMetaQuery,
	DobjOriginsAndCountsQuery,
	SPECCOL
} from '../sparqlQueries';
import SpecTable, {Value, Filter, Row, TableSerialized} from "./SpecTable";
import {AsyncResult} from "../backend/declarations";
import {fetchBoostrapData} from "../backend";
import { QueryResultColumns } from '../backend/sparql';


type JsonCompositeSpecTable = AsyncResult<typeof fetchBoostrapData>['specTables'];
export type BasicsColNames = QueryResultColumns<SpecBasicsQuery>;
export type VariableMetaColNames = QueryResultColumns<SpecVarMetaQuery>;
export type OriginsColNames = QueryResultColumns<DobjOriginsAndCountsQuery>;
export type ColNames = BasicsColNames | VariableMetaColNames | OriginsColNames;

const tableNames = ['basics', 'columnMeta', 'origins'] as const;
type TableNames = typeof tableNames[number];
export type SpecTableSerialized = {
	basics: TableSerialized<BasicsColNames>
	columnMeta: TableSerialized<VariableMetaColNames>
	origins: TableSerialized<OriginsColNames>
}

export default class CompositeSpecTable{
	constructor(readonly basics: SpecTable<BasicsColNames>, readonly columnMeta: SpecTable<VariableMetaColNames>, readonly origins: SpecTable<OriginsColNames>){}

	static fromTables(tables: SpecTable[]){
		return new CompositeSpecTable(
			tables[0] as SpecTable<BasicsColNames>,
			tables[1] as SpecTable<VariableMetaColNames>,
			tables[2] as SpecTable<OriginsColNames>
		);
	}

	get serialize(): SpecTableSerialized {
		return {
			basics: this.basics.serialize,
			columnMeta: this.columnMeta.serialize,
			origins: this.origins.serialize
		}
	}

	static deserialize(tables: SpecTableSerialized) {
		const {basics, columnMeta, origins} = tables;

		const basicsTbl = new SpecTable(basics.colNames, basics.rows, basics.filters || {});
		const columnMetaTbl = new SpecTable(columnMeta.colNames, columnMeta.rows, columnMeta.filters || {});
		const originsTbl = new SpecTable(origins.colNames, origins.rows, origins.filters || {});

		return new CompositeSpecTable(basicsTbl, columnMetaTbl, originsTbl).withFilterReflection;
	}

	get tables(){
		return [this.basics, this.columnMeta, this.origins];
	}

	getTable(name: TableNames): SpecTable {
		switch (name){
			case "basics": return this.basics;
			case "columnMeta": return this.columnMeta;
			case "origins": return this.origins;
		}
	}

	getTableRows(name: TableNames): Row<string>[]{
		return this.getTable(name).rows;
	}

	get basicsRows(){
		return this.basics.rows;
	}

	get columnMetaRows(){
		return this.columnMeta.rows;
	}

	get originsRows(){
		return this.origins.rows;
	}

	get names(): Array<ColNames>{
		const toFlatMap = this.tables.map(tbl => tbl.names);
		return Array.prototype.concat.apply([], toFlatMap);
	}

	get tableNames(): TableNames[]{
		return tableNames.slice();
	}

	findTable(columnName: ColNames): SpecTable<string> | undefined{
		return this.tables.find(tbl =>
			(tbl.names as ColNames[]).includes(columnName)
		);
	}

	withFilter(colName: ColNames, filter: Filter): CompositeSpecTable{
		const table = this.findTable(colName);
		if(table === undefined) return this;

		return CompositeSpecTable.fromTables(
			this.tables.map(tbl => tbl === table ? table.withFilter(colName, filter) : tbl)
		).withFilterReflection;
	}

	get withFilterReflection(): CompositeSpecTable {

		const specFilter0 = Filter.and([
			this.basics.ownSpecFilter,
			this.columnMeta.ownSpecFilter,
			this.origins.implicitOwnSpecFilter
		]);

		const specFilter: Filter = specFilter0 === null
			? null
			: specFilter0.length < this.basics.specsCount
				? specFilter0
				: null;

		const reflectedTables = this.tables.map(t => t.withExtraSpecFilter(specFilter));
		return CompositeSpecTable.fromTables(reflectedTables);
	}

	withResetFilters(){
		return new CompositeSpecTable(this.basics.withResetFilters(), this.columnMeta.withResetFilters(), this.origins.withResetFilters());
	}

	withOriginsTable(origins: JsonCompositeSpecTable['origins'] | CompositeSpecTable['origins']){
		const newOrigins = new SpecTable<OriginsColNames>(origins.colNames, origins.rows, this.origins.filters);

		return new CompositeSpecTable(this.basics, this.columnMeta, newOrigins).withFilterReflection;
	}

	getFilter(colName: ColNames): Filter {
		return this.findTable(colName)?.getFilter(colName) ?? null;
	}

	get hasActiveFilters(): boolean{
		return this.tables.some(tbl => tbl.hasActiveFilters);
	}

	getDistinctAvailableColValues(colName: ColNames): Value[]{
		return this.findTable(colName)?.getDistinctAvailableColValues(colName) ?? [];
	}

	getAllDistinctAvailableColValues(colName: ColNames): Value[]{
		const table = this.findTable(colName);
		return table
			? table.getAllColValues(colName)
			: [];
	}

	getColumnValuesFilter(colName: ColNames): Filter {
		return this.findTable(colName)?.getColumnValuesFilter(colName) ?? null;
	}

}
