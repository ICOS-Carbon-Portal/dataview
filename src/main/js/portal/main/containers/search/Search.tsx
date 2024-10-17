import React, {Component, ReactNode} from 'react';
import { connect } from 'react-redux';
import {debounce, Events} from 'icos-cp-utils';
import Tabs from '../../components/ui/Tabs';
import SearchResultRegular from './SearchResultRegular';
import {updateCheckedObjectsInSearch, switchTab, filtersReset, setMapProps} from '../../actions/search';
import {getLastSegmentsInUrls, isSmallDevice} from '../../utils';
import {Sha256Str, UrlStr} from "../../backend/declarations";
import {PortalDispatch} from "../../store";
import {Route, State} from "../../models/State";
import {addToCart, updateRoute} from "../../actions/common";
import Filters from "./Filters";
import SearchResultCompact from "./SearchResultCompact";
import Advanced from "./Advanced";
import { SupportedSRIDs } from 'icos-cp-ol';
import config from '../../config';
import { PersistedMapPropsExtended } from '../../models/InitMap';
import { getPersistedMapProps } from '../../backend';
import { addingToCartProhibition } from '../../models/CartItem';

type StateProps = ReturnType<typeof stateToProps>;
type DispatchProps = ReturnType<typeof dispatchToProps>;
type OurProps = StateProps & DispatchProps & { HelpSection: ReactNode };
type OurState = {
	expandedFilters: boolean
	srid?: SupportedSRIDs
};

class Search extends Component<OurProps, OurState> {
	private events: typeof Events;
	private handleResize: Function;
	private persistedMapProps: PersistedMapPropsExtended;

	constructor(props: OurProps) {
		super(props);

		this.events = new Events();
		this.handleResize = debounce(() => {
			const expandedFilters = this.state.expandedFilters;
			const expanded = isSmallDevice()
				? expandedFilters
				: true;
			this.setState({expandedFilters: expanded});
		});
		this.events.addToTarget(window, "resize", this.handleResize);

		this.persistedMapProps = getPersistedMapProps() ?? {
			baseMap: config.olMapSettings.defaultBaseMap,
			srid: config.olMapSettings.defaultSRID
		};

		this.state = {
			expandedFilters: !isSmallDevice(),
			srid: this.persistedMapProps.srid
		};
	}

	handlePreview(urls: UrlStr[]){
		this.props.updateRoute('preview', getLastSegmentsInUrls(urls));
	}

	handleAddToCart(objInfo: UrlStr[]) {
		this.props.addToCart(objInfo);
		this.props.updateCheckedObjects([]);
	}

	handleAllCheckboxesChange() {
		if (this.props.checkedObjectsInSearch.length > 0) {
			this.props.updateCheckedObjects([]);
		} else {
			const checkedObjects = this.props.objectsTable
				.filter(o => addingToCartProhibition(o).allowCartAdd)
				.map(o => o.dobj);
			this.props.updateCheckedObjects(checkedObjects);
		}
	}

	handleFilterReset() {
		delete this.persistedMapProps.drawFeatures;
		this.props.filtersReset();
	}

	updatePersistedMapProps(persistedMapProps: PersistedMapPropsExtended) {
		this.persistedMapProps = { ...this.persistedMapProps, ...persistedMapProps };
		this.props.setMapProps(this.persistedMapProps);
	}

	updateMapSelectedSRID(srid: SupportedSRIDs) {
		const { isStationFilterCtrlActive, baseMap, visibleToggles } = this.persistedMapProps;
		this.persistedMapProps = {
			isStationFilterCtrlActive,
			baseMap,
			visibleToggles,
			srid
		};
		// Using srid as key for SearchResultMap forces React to recreate the component when it changes
		this.setState({ srid });
	}

	toggleFilters() {
		this.setState({expandedFilters: !this.state.expandedFilters});
	}

	componentWillUnmount(){
		this.events.clear();
	}

	render(){
		const { HelpSection, tabs, switchTab } = this.props;
		const { srid } = this.state;
		const expandedFilters = this.state.expandedFilters ? {} : {height: 0, overflow: 'hidden'};
		const filterIconClass = this.state.expandedFilters ? "fas fa-angle-up float-end" : "fas fa-angle-down float-end";

		return (
			<div className="row" style={{ position: 'relative' }}>
				<div style={{ display:'inline-block' }}>
					{HelpSection}
				</div>

				<div className="col-sm-4 col-md-3" style={{ marginBottom: 20 }}>

					<button className="btn btn-outline-secondary w-100 d-block d-sm-none" type="button" onClick={this.toggleFilters.bind(this)} style={{marginBottom: 10}}>
						Filters<span className={filterIconClass} aria-hidden="true" style={{marginTop: 2}} />
					</button>

					<div style={expandedFilters}>
						<Tabs tabName="searchTab" selectedTabId={tabs.searchTab} switchTab={switchTab}>
							<Filters tabHeader="Filters" handleFilterReset={this.handleFilterReset.bind(this)} />
							<Advanced tabHeader="Advanced" />
						</Tabs>
					</div>

				</div>

				<div className="col-sm-8 col-md-9">
					<Tabs tabName="resultTab" selectedTabId={tabs.resultTab} switchTab={switchTab}>
						<SearchResultRegular
							tabHeader="Search results"
							handlePreview={this.handlePreview.bind(this)}
							handleAddToCart={this.handleAddToCart.bind(this)}
							handleAllCheckboxesChange={this.handleAllCheckboxesChange.bind(this)}
						/>
						<SearchResultCompact
							tabHeader="Compact view"
							handlePreview={this.handlePreview.bind(this)}
						/>
					</Tabs>
				</div>
			</div>
		);
	}
}

function stateToProps(state: State){
	return {
		checkedObjectsInSearch: state.checkedObjectsInSearch,
		objectsTable: state.objectsTable,
		tabs: state.tabs
	};
}

function dispatchToProps(dispatch: PortalDispatch){
	return {
		updateRoute: (route: Route, previewPids: Sha256Str[]) => dispatch(updateRoute(route, previewPids)),
		addToCart: (ids: UrlStr[]) => dispatch(addToCart(ids)),
		updateCheckedObjects: (ids: UrlStr[] | UrlStr) => dispatch(updateCheckedObjectsInSearch(ids)),
		switchTab: (tabName: string, selectedTabId: number) => dispatch(switchTab(tabName, selectedTabId)),
		setMapProps: (mapProps: PersistedMapPropsExtended) => dispatch(setMapProps(mapProps)),
		filtersReset: () => dispatch(filtersReset)
	};
}

export default connect(stateToProps, dispatchToProps)(Search);
