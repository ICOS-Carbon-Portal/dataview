import {Action} from "redux";
import {MetaDataObject, StateSerialized, TsSettings, WhoAmI} from "../models/State";
import {Sha256Str, ThenArg, UrlStr} from "../backend/declarations";
import {
	fetchBoostrapData,
	fetchDobjOriginsAndCounts,
	fetchKnownDataObjects,
	getExtendedDataObjInfo
} from "../backend";
import {ColNames} from "../models/CompositeSpecTable";
import {Filter} from "../models/SpecTable";
import {DataObject} from "../models/CartItem";
import {Item} from "../models/HelpStorage";
import Cart from "../models/Cart";
import FilterTemporal from "../models/FilterTemporal";
import {SearchOption} from "../actions/types";


export abstract class ActionPayload{}
export abstract class BootstrapRoutePayload extends ActionPayload{}
export abstract class BackendPayload extends ActionPayload{}
export abstract class MiscPayload extends ActionPayload{}
export abstract class PreviewPayload extends ActionPayload{}
export abstract class UiPayload extends ActionPayload{}
export abstract class FiltersPayload extends ActionPayload{}


export interface PortalPlainAction extends Action<string>{
	payload: ActionPayload
}

export class BootstrapRouteSearch extends BootstrapRoutePayload{
	constructor(){super();}
}

export class BootstrapRoutePreview extends BootstrapRoutePayload{
	constructor(
		readonly pids: Sha256Str[],
		readonly objectsTable: ObjectsTableLike,
		readonly extendedDobjInfo: ThenArg<typeof getExtendedDataObjInfo>
	){super();}
}

export class BootstrapRouteMetadata extends BootstrapRoutePayload{
	constructor(readonly metadata: MetaDataObject & {id: UrlStr}){super();}
}

export class BootstrapRouteCart extends BootstrapRoutePayload{
	constructor(readonly extendedDobjInfo: ThenArg<typeof getExtendedDataObjInfo>, readonly objectsTable: ObjectsTableLike){super();}
}

export class BackendUserInfo extends BackendPayload{
	constructor(readonly user: WhoAmI, readonly profile: object){super();}
}

export class BackendTables extends BackendPayload{
	constructor(readonly allTables: ThenArg<typeof fetchBoostrapData>){super();}
}

export class BackendOriginsTable extends BackendPayload{
	constructor(readonly dobjOriginsAndCounts: ThenArg<typeof fetchDobjOriginsAndCounts>, readonly resetPaging: boolean = false){super();}
}

export class BackendUpdateSpecFilter extends BackendPayload{
	constructor(readonly varName: ColNames, readonly filter: Filter){super();}
}

export class BackendObjectMetadataId extends BackendPayload{
	constructor(readonly id: UrlStr){super();}
}

export class BackendObjectMetadata extends BackendPayload{
	constructor(readonly metadata: MetaDataObject & {id: UrlStr}){super();}
}

export class BackendExtendedDataObjInfo extends BackendPayload{
	constructor(readonly extendedDobjInfo: ThenArg<typeof getExtendedDataObjInfo>){super();}
}

export class BackendTsSettings extends BackendPayload{
	constructor(readonly tsSettings: TsSettings){super();}
}

export class BackendUpdateCart extends BackendPayload{
	constructor(readonly cart: Cart){super();}
}

export class BackendBatchDownload extends BackendPayload{
	constructor(readonly isBatchDownloadOk: boolean, readonly user: WhoAmI){super();}
}

export type ObjectsTableLike = ThenArg<typeof fetchKnownDataObjects>['rows'] | DataObject[];
export class BackendObjectsFetched extends BackendPayload{
	constructor(readonly objectsTable: ObjectsTableLike, readonly isDataEndReached: boolean){super();}
}

export class MiscError extends MiscPayload{
	constructor(readonly error: Error){super();}
}

export class MiscLoadError extends MiscPayload{
	constructor(readonly state: StateSerialized, readonly cart: Cart){super();}
}

export class MiscInit extends MiscPayload{
	constructor(){super();}
}

export class MiscRestoreFromHistory extends MiscPayload{
	constructor(readonly historyState: StateSerialized){super();}
}

export class MiscResetFilters extends MiscPayload{
	constructor(){super();}
}

export class MiscRestoreFilters extends MiscPayload{
	constructor(){super();}
}

export class MiscUpdateSearchOption extends MiscPayload{
	constructor(readonly newSearchOption: SearchOption){super();}
}

export class RestorePreview extends PreviewPayload{
	constructor(){super();}
}

export class SetPreviewFromCart extends PreviewPayload{
	constructor(readonly ids: UrlStr[]){super();}
}

export class SetPreviewUrl extends PreviewPayload{
	constructor(readonly url: UrlStr){super();}
}

export class UiToggleSorting extends UiPayload{
	constructor(readonly varName: string){super();}
}

export class UiStepRequested extends UiPayload{
	constructor(readonly direction: -1 | 1){super();}
}

export class UiSwitchTab extends UiPayload{
	constructor(readonly tabName: string, readonly selectedTabId: string){super();}
}

export class UiAddHelpInfo extends UiPayload{
	constructor(readonly helpItem: Item){super();}
}

export class UiUpdateHelpInfo extends UiPayload{
	constructor(readonly helpItem: Item){super();}
}

export class UiUpdateCheckedObjsInSearch extends UiPayload{
	constructor(readonly checkedObjectInSearch: UrlStr | UrlStr[]){super();}
}

export class UiUpdateCheckedObjsInCart extends UiPayload{
	constructor(readonly checkedObjectInCart: UrlStr | UrlStr[]){super();}
}

export class FiltersTemporal extends FiltersPayload{
	constructor(readonly filterTemporal: FilterTemporal){super();}
}

export class FiltersUpdatePids extends FiltersPayload{
	constructor(readonly selectedPids: Sha256Str[]){super();}
}
