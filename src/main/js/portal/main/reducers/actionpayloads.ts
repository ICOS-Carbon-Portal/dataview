import {Action} from "redux";
import {MetaDataObject, SearchOptions, State, WhoAmI} from "../models/State";
import {Sha256Str, ThenArg, UrlStr} from "../backend/declarations";
import {
	fetchAllSpecTables,
	fetchDobjOriginsAndCounts,
	fetchKnownDataObjects,
	getExtendedDataObjInfo,
	TsSettings
} from "../backend";
import {ColNames} from "../models/CompositeSpecTable";
import {SearchOption} from "../actions";
import {Value} from "../models/SpecTable";
import {DataObject} from "../models/CartItem";
import {Item} from "../models/HelpStorage";
import Cart from "../models/Cart";
import FilterTemporal from "../models/FilterTemporal";


export abstract class ActionPayload{}
export abstract class BackendPayload extends ActionPayload{}
export abstract class MiscPayload extends ActionPayload{}
export abstract class PreviewPayload extends ActionPayload{}
export abstract class UiPayload extends ActionPayload{}
export abstract class Filters extends ActionPayload{}


export interface PortalPlainAction extends Action<string>{
	payload: ActionPayload
}

export class BackendUserInfo extends BackendPayload{
	constructor(readonly user: WhoAmI, readonly profile: object){super();}
}

export class BackendTables extends BackendPayload{
	constructor(readonly allTables: ThenArg<typeof fetchAllSpecTables>){super();}
}

export class BackendOriginsTable extends BackendPayload{
	constructor(readonly dobjOriginsAndCounts: ThenArg<typeof fetchDobjOriginsAndCounts>){super();}
}

export class BackendUpdateSpecFilter extends BackendPayload{
	constructor(readonly varName: ColNames, readonly values: Value[]){super();}
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

type ObjectsTable = ThenArg<typeof fetchKnownDataObjects>['rows'] | DataObject[];
export class BackendObjectsFetched extends BackendPayload{
	constructor(readonly objectsTable: ObjectsTable, readonly cacheSize: number, readonly isDataEndReached: boolean){super();}
}

export class MiscError extends MiscPayload{
	constructor(readonly error: Error){super();}
}

export class MiscLoadError extends MiscPayload{
	constructor(readonly state: State, readonly cart: Cart){super();}
}

export class MiscInit extends MiscPayload{
	constructor(){super();}
}

export class MiscRestoreFromHistory extends MiscPayload{
	constructor(readonly historyState: State){super();}
}

export class MiscResetFilters extends MiscPayload{
	constructor(){super();}
}

export class MiscRestoreFilters extends MiscPayload{
	constructor(){super();}
}

export class MiscUpdateSearchOption extends MiscPayload{
	constructor(readonly oldSearchOptions: SearchOptions, readonly newSearchOption: SearchOption){super();}
}

export class RestorePreview extends PreviewPayload{
	constructor(){super();}
}

export class SetPreviewFromCart extends PreviewPayload{
	constructor(readonly id: UrlStr[]){super();}
}

export class SetPreviewItem extends PreviewPayload{
	constructor(readonly url: UrlStr){super();}
}

export class UiToggleSorting extends UiPayload{
	constructor(readonly varName: string){super();}
}

export class UiStepRequested extends UiPayload{
	constructor(readonly direction: -1 | 1){super();}
}

export class UiUpdateRoute extends UiPayload{
	constructor(readonly route: string){super();}
}

export class UiSwitchTab extends UiPayload{
	constructor(readonly tabName: string, readonly selectedTabId: string){super();}
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

export class FiltersTemporal extends Filters{
	constructor(readonly filterTemporal: FilterTemporal){super();}
}

export class FiltersPids extends Filters{
	constructor(){super();}
}

export class FiltersUpdatePids extends Filters{
	constructor(readonly selectedPids: Sha256Str[]){super();}
}
