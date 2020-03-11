import {NumberFilterCategories, numberFilterKeys} from "../config";
import {FilterNumber} from "./FilterNumbers";

export type FilterRequest = PidFilterRequest | TemporalFilterRequest | DeprecatedFilterRequest | NumberFilterRequest

export interface PidFilterRequest{
	category: "pids"
	pids: string[]
}
export interface TemporalFilterRequest{
	category: "dataTime" | "submission"
	from: Date | undefined
	fromDateTimeStr: string | undefined
	to: Date | undefined
	toDateTimeStr: string | undefined
}

export interface NumberFilterRequest extends FilterNumber {}

export interface DeprecatedFilterRequest{
	category: "deprecated"
	allow: boolean
}

export function isPidFilter(filter: FilterRequest): filter is PidFilterRequest{
	return filter.category === "pids";
}

export function isTemporalFilter(filter: FilterRequest): filter is TemporalFilterRequest{
	return filter.category === "dataTime" || filter.category === "submission";
}

export function isNumberFilter(filter: FilterRequest): filter is NumberFilterRequest{
	return numberFilterKeys.includes(filter.category as NumberFilterCategories);
}

export function isDeprecatedFilter(filter: FilterRequest): filter is DeprecatedFilterRequest{
	return filter.category === "deprecated";
}
