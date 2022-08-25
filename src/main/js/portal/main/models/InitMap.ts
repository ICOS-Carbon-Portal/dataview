import Select from 'ol/interaction/Select';
import * as condition from 'ol/events/condition';
import { Collection, Feature } from 'ol';
import {MapProps, State, StationPos4326Lookup} from './State';
import { Dict } from '../../../common/main/types';
import CompositeSpecTable from './CompositeSpecTable';
import { UrlStr } from '../backend/declarations';
import {difference} from '../utils';
import {Filter, Value} from './SpecTable';
import config from '../config';
import { Coordinate } from 'ol/coordinate';
import Point from 'ol/geom/Point';
import VectorLayer from 'ol/layer/Vector';
import { CountriesTopo, getCountriesGeoJson } from '../backend';
import { DrawFeature, StateStationUris, StationFilterControl } from './StationFilterControl';
import Map from 'ol/Map';
import {
	BaseMapId, Copyright, countryBorderStyle, countryStyle,
	EpsgCode, getLayerWrapper,
	esriBaseMapNames,
	getBaseMapLayers,
	getDefaultControls,
	getESRICopyRight, getLayerIcon, getLayerVisibility,
	getProjection,
	getTransformPointFn,
	LayerControl, LayerWrapper, LayerWrapperArgs,
	MapOptions,
	OLWrapper,
	PersistedMapProps, PointData,
	Popup, ProjectionControl,
	SupportedSRIDs
} from "icos-cp-ol";


export type UpdateMapSelectedSRID = (srid: SupportedSRIDs) => void
export type TransformPointFn = (lon: number, lat: number) => number[]
interface MapOptionsExpanded extends Partial<MapOptions> {
	center?: Coordinate
	hitTolerance: number
}
export interface PersistedMapPropsExtended<BMN = BaseMapId> extends PersistedMapProps<BMN> {
	drawFeatures?: DrawFeature[]
	isStationFilterCtrlActive?: boolean
	stateStationUris?: StateStationUris
}
interface Props extends UpdateProps {
	mapRootElement: HTMLElement
	persistedMapProps: PersistedMapPropsExtended
	updatePersistedMapProps: (persistedMapProps: PersistedMapPropsExtended) => void
	updateMapSelectedSRID: UpdateMapSelectedSRID
	updateStationFilterInState: (stationUrisToState: Filter) => void
}
interface UpdateProps {
	specTable: CompositeSpecTable
	allStations: UrlStr[],
	stationPos4326Lookup: StationPos4326Lookup
	labelLookup: State['labelLookup']
	spatialStationsFilter: Filter
	mapProps: MapProps
}
export type StationPosLookup = Dict<{ coord: number[], stationLbl: string }, UrlStr>

const countryBordersId = 'countryBorders';
const olMapSettings = config.olMapSettings;
const isIncludedStation = 'isIncluded';

export default class InitMap {
	public readonly olWrapper: OLWrapper;
	private appEPSGCode: EpsgCode;
	private mapOptions: MapOptionsExpanded;
	private popup: Popup;
	private readonly layerControl: LayerControl;
	private readonly stationFilterControl: StationFilterControl;
	private pointTransformer: TransformPointFn;
	private allStationUris: UrlStr[];
	private countriesTopo?: CountriesTopo;
	private persistedMapProps: PersistedMapPropsExtended<BaseMapId | 'Countries'>;
	private updateStationFilterInState: (stationUrisToState: Filter) => void;

	constructor(props: Props) {
		const {
			mapRootElement,
			updateMapSelectedSRID,
			persistedMapProps,
			updatePersistedMapProps,
			updateStationFilterInState
		} = props;

		this.persistedMapProps = persistedMapProps;
		this.fetchCountriesTopo();

		this.allStationUris = props.allStations
		this.updateStationFilterInState = updateStationFilterInState;

		const srid = persistedMapProps.srid === undefined
			? olMapSettings.defaultSRID
			: persistedMapProps.srid;
		this.appEPSGCode = `EPSG:${srid}` as EpsgCode;
		const projection = getProjection(this.appEPSGCode);
		this.pointTransformer = getTransformPointFn("EPSG:4326", this.appEPSGCode);

		this.mapOptions = {
			center: persistedMapProps.center,
			zoom: persistedMapProps.zoom,
			fitView: persistedMapProps.center === undefined && persistedMapProps.zoom === undefined,
			hitTolerance: 5
		};

		const selectedBaseMap = persistedMapProps.baseMap ?? olMapSettings.defaultBaseMap;
		const tileLayers = getBaseMapLayers(selectedBaseMap, olMapSettings.baseMapFilter);
		this.popup = new Popup('popover');

		const controls = getDefaultControls(projection);

		this.stationFilterControl = new StationFilterControl({
			element: document.getElementById('stationFilterCtrl') ?? undefined,
			isActive: persistedMapProps.isStationFilterCtrlActive ?? false,
			updatePersistedMapProps,
			updateStationFilterInState: this.updateStationFilterInState.bind(this)
		});
		controls.push(this.stationFilterControl);

		this.layerControl = new LayerControl({
			element: document.getElementById('layerCtrl') ?? undefined,
			selectedBaseMap,
			updateCtrl: this.updateLayerCtrl
		});
		this.layerControl.on('change', e => {
			const layerCtrl = e.target as LayerControl;
			updatePersistedMapProps({
				baseMap: layerCtrl.selectedBaseMap,
				visibleToggles: layerCtrl.visibleToggleLayerIds
			});
		});
		controls.push(this.layerControl);

		if (Object.keys(olMapSettings.sridsInMap).length > 1)
			controls.push(this.createProjectionControl(persistedMapProps, updateMapSelectedSRID));

		const olProps = {
			mapRootElement,
			projection,
			tileLayers,
			mapOptions: this.mapOptions,
			popupTemplate: this.popup,
			controls
		};

		// Create map component in OLWrapper. Anything that uses map must be handled after map creation
		this.olWrapper = new OLWrapper(olProps);
		this.addInteractivity();

		this.olWrapper.map.on("moveend", e => {
			const map = e.target as Map;
			const view = map.getView();
			updatePersistedMapProps({ center: view.getCenter(), zoom: view.getZoom() });
		});

		const minWidth = 600;
		const width = document.getElementsByTagName('body')[0].getBoundingClientRect().width;
		if (width < minWidth) return;

		getESRICopyRight(esriBaseMapNames).then(attributions => {
			this.olWrapper.attributionUpdater = new Copyright(attributions, projection, 'baseMapAttribution', minWidth);
		});
	}

	private async fetchCountriesTopo() {
		// countriesTopo has geometric problems in SWEREF99 TM so skip it for SITES
		if (config.envri === 'SITES')
			return;
		
		this.countriesTopo = await getCountriesGeoJson();

		const countriesTopoBM: LayerWrapper = this.getLayerWrapper({
			id: 'countries',
			label: 'Countries',
			layerType: 'baseMap',
			geoType: 'geojson',
			data: this.countriesTopo,
			style: countryStyle,
			zIndex: 100,
			interactive: false
		});
		this.olWrapper.addGeoJson(countriesTopoBM, 'EPSG:4326', this.olWrapper.projection, this.olWrapper.viewParams.extent);

		const countriesTopoToggle: LayerWrapper = this.getLayerWrapper({
			id: countryBordersId,
			label: 'Country borders',
			layerType: 'toggle',
			geoType: 'geojson',
			data: this.countriesTopo,
			style: countryBorderStyle,
			zIndex: 100,
			interactive: false
		});
		this.olWrapper.addToggleLayers([countriesTopoToggle]);
	}

	private toggleLayerVisibility(layerId: string) {
		const visibleToggles = this.persistedMapProps.visibleToggles;
		return visibleToggles === undefined || visibleToggles.includes(layerId)
	}

	private createProjectionControl(persistedMapProps: PersistedMapPropsExtended, updateMapSelectedSRID: UpdateMapSelectedSRID) {
		return new ProjectionControl({
			element: document.getElementById('projSwitchCtrl') ?? undefined,
			supportedSRIDs: olMapSettings.sridsInMap,
			selectedSRID: persistedMapProps.srid ?? olMapSettings.defaultSRID,
			switchProjAction: updateMapSelectedSRID
		});
	}

	updatePoints(includedStationUris: Value[], allSpecTableStationUris: Value[]) {
		const stationUrisDiff = difference(allSpecTableStationUris, includedStationUris);
		const excludedStations = createPointData(stationUrisDiff, this.stationFilterControl.stationPosLookup, {[isIncludedStation]: false});
		const includedStations = createPointData(includedStationUris, this.stationFilterControl.stationPosLookup, {[isIncludedStation]: true});

		const excludedStationsToggle: LayerWrapper = this.getLayerWrapper({
			id: 'excludedStations',
			label: 'Station filtered out',
			layerType: 'toggle',
			geoType: 'point',
			data: excludedStations,
			style: olMapSettings.iconStyles.excludedStation,
			zIndex: 110,
			interactive: true
		});
		const includedStationsToggle: LayerWrapper = this.getLayerWrapper({
			id: 'includedStations',
			label: 'Station',
			layerType: 'toggle',
			geoType: 'point',
			data: includedStations,
			style: olMapSettings.iconStyles.includedStation,
			zIndex: 120,
			interactive: true
		});

		this.olWrapper.addToggleLayers([includedStationsToggle, excludedStationsToggle]);
		this.layerControl.updateCtrl();
	}

	getLayerWrapper({id, label, layerType, geoType, data, style, zIndex, interactive}: Omit<LayerWrapperArgs, 'visible'>): LayerWrapper {
		const visible = layerType === 'toggle'
			? getLayerVisibility(this.olWrapper.map, id, this.toggleLayerVisibility(id))
			: getLayerVisibility(this.olWrapper.map, id, this.persistedMapProps.baseMap === id);

		return getLayerWrapper({
			id,
			label,
			layerType,
			visible,
			geoType,
			data,
			style,
			zIndex,
			interactive
		});
	}

	incomingPropsUpdated(props: UpdateProps) {
		const { specTable, stationPos4326Lookup, labelLookup, spatialStationsFilter, mapProps } = props;
		this.allStationUris = props.allStations
		const isStationPosLookupEmpty = () => this.stationFilterControl.stationPosLookup.hasOwnProperty("empty");
		const isReadyForStationPosLookup = isStationPosLookupEmpty()
			&& this.allStationUris.length > 0
			&& Object.keys(labelLookup).length > 0;

		if (isReadyForStationPosLookup) {
			this.stationFilterControl.stationPosLookup = getStationPosLookup(this.allStationUris, stationPos4326Lookup, this.pointTransformer, labelLookup);
			this.stationFilterControl.restoreDrawFeaturesFromMapProps(mapProps);
		}

		if (!isStationPosLookupEmpty()) {
			const stationUris = this.stationFilterControl.updateStationUris(specTable, this.allStationUris, spatialStationsFilter);

			if (stationUris.hasChanged) {
				this.updatePoints(stationUris.includedStationUris, this.allStationUris);
				this.stationFilterControl.restoreDrawFeaturesFromMapProps(mapProps);
			}
		}
	}

	updateLayerCtrl(self: LayerControl): () => void {
		return () => {
			if (self.map === undefined)
				return;
			
			self.layersDiv.innerHTML = '';
			const baseMaps = self.baseMaps;
			const toggles = self.toggles;

			if (baseMaps.length) {
				const root = document.createElement('div');
				root.setAttribute('class', 'ol-layer-control-basemaps');
				const lbl = document.createElement('label');
				lbl.innerHTML = 'Base maps';
				root.appendChild(lbl);

				baseMaps.forEach(bm => {
					const row = document.createElement('div');
					const id = self.createId('radio', bm.get('id'));

					const radio = document.createElement('input');
					radio.setAttribute('id', id);
					radio.setAttribute('name', 'basemap');
					radio.setAttribute('type', 'radio');
					radio.setAttribute('style', 'margin:0px 5px 0px 0px;');
					if (bm.getVisible()) {
						radio.setAttribute('checked', 'true');
					}
					radio.addEventListener('change', () => self.toggleBaseMaps(bm.get('id')));
					row.appendChild(radio);

					const lbl = document.createElement('label');
					lbl.setAttribute('for', id);
					lbl.innerHTML = bm.get('label');
					row.appendChild(lbl);

					root.appendChild(row);
				});

				self.layersDiv.appendChild(root);
			}

			if (toggles.length) {
				const addToggleLayer = (toggleLayer: VectorLayer) => {
					const legendItem = getLayerIcon(toggleLayer);
					const row = document.createElement('div');
					row.setAttribute('style', 'display:table;');
					const id = self.createId('toggle', toggleLayer.get('id'));

					const toggle = document.createElement('input');
					toggle.setAttribute('id', id);
					toggle.setAttribute('type', 'checkbox');
					toggle.setAttribute('style', 'display:table-cell;');
					if (toggleLayer.getVisible()) {
						toggle.setAttribute('checked', 'true');
					}
					toggle.addEventListener('change', () => self.toggleLayers(toggleLayer.get('id'), toggle.checked));
					row.appendChild(toggle);

					if (legendItem) {
						const legendItemContainer = document.createElement('span');
						legendItemContainer.setAttribute('style', 'display:table-cell; width:21px; text-align:center;');						
						legendItem.id = id.replace('toggle', 'canvas');
						legendItem.setAttribute('style', 'vertical-align:sub; margin-right:unset;');
						legendItemContainer.appendChild(legendItem);
						row.appendChild(legendItemContainer);
					} else {
						const emptyCell = document.createElement('span');
						emptyCell.setAttribute('style', 'display:table-cell; width:5px;');
						row.appendChild(emptyCell);
					}

					const lbl = document.createElement('label');
					lbl.setAttribute('for', id);
					lbl.setAttribute('style', 'display:table-cell;');

					const lblTxt = document.createElement('span');
					lblTxt.innerHTML = toggleLayer.get('label');
					lbl.appendChild(lblTxt);
					row.appendChild(lbl);

					root.appendChild(row);
				};

				const root = document.createElement('div');
				root.setAttribute('class', 'ol-layer-control-toggles');
				const lbl = document.createElement('label');
				lbl.innerHTML = 'Layers';
				root.appendChild(lbl);

				toggles
					.filter(toggleLayer => toggleLayer.get('id') === countryBordersId)
					.forEach(toggleLayer => addToggleLayer(toggleLayer as VectorLayer));
				toggles
					.filter(toggleLayer => toggleLayer.get('id') !== countryBordersId)
					.forEach(toggleLayer => addToggleLayer(toggleLayer as VectorLayer));

				self.layersDiv.appendChild(root);
			}
		};
	}

	private addInteractivity() {
		const map = this.olWrapper.map;
		const popupOverlay = this.olWrapper.popupOverlay;
		const popup = this.popup;

		const select = new Select({
			condition: condition.pointerMove,
			layers: layer => layer.get('interactive'),
			multi: true,
			hitTolerance: this.mapOptions.hitTolerance
		});
		map.addInteraction(select);

		select.on('select', e => {
			if (popupOverlay === undefined) return;

			const features: Collection<Feature<Point>> = e.target.getFeatures();
			const numberOfFeatures = features.getLength();

			if (numberOfFeatures) {
				popup.resetContent();

				const feature = features.getArray()[0];
				const name = feature.get('stationLbl');
				const isIncluded = feature.get(isIncludedStation);

				popup.addContent(`${isIncluded ? 'Included' : 'Excluded'} station`, {
					Name: name
				});

				if (numberOfFeatures > 1)
					popup.addTxtToContent(`Zoom in to see ${numberOfFeatures - 1} more`);

				popupOverlay.setPosition(feature.getGeometry()?.getCoordinates() ?? e.mapBrowserEvent.coordinate);

			} else {
				popupOverlay.setPosition(undefined);
			}
		});
	}

	get appDisplayEPSGCode() {
		return this.appEPSGCode;
	}
}

const getStationPosLookup = (allStations: UrlStr[], lookup4326: StationPos4326Lookup, pointTransformer: TransformPointFn, labelLookup: State['labelLookup']) =>
	allStations.reduce<StationPosLookup>((acc, st) => {
		const latLon = lookup4326[st];
		if(latLon) acc[st] = {
			coord: pointTransformer(latLon.lon, latLon.lat),
			stationLbl: labelLookup[st].label ?? st
		};
		return acc;
	}, {});

function createPointData(stations: Value[], stationPosLookup?: StationPosLookup, additionalAttributes: PointData['attributes'] = {}): PointData[] {
	if (stationPosLookup === undefined) return [];

	return stations.reduce<PointData[]>((acc, st) => {
		if (st && stationPosLookup[st]) {
			const { coord, ...attributes } = stationPosLookup[st];
			acc.push({
				coord: coord,
				attributes: {
					id: st,
					...attributes,
					...additionalAttributes
				}
			});
		}
		return acc;
	}, []);
};
