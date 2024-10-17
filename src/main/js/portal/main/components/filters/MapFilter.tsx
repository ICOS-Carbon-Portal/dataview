import React, { useEffect, useRef, useState } from 'react';
import { connect } from 'react-redux';
import { State } from "../../models/State";
import { PersistedMapPropsExtended, UpdateMapSelectedSRID } from '../../models/InitMap';
import { PortalDispatch } from '../../store';
import { failWithError } from '../../actions/common';
import { Value } from '../../models/SpecTable';
import { Copyright } from 'icos-cp-copyright';


type StateProps = ReturnType<typeof stateToProps>;
type DispatchProps = ReturnType<typeof dispatchToProps>;
type incommingProps = {
	tabHeader: string
	persistedMapProps: PersistedMapPropsExtended
	updatePersistedMapProps: (mapProps: PersistedMapPropsExtended) => void
	updateMapSelectedSRID: UpdateMapSelectedSRID
}
type OurProps = StateProps & DispatchProps & incommingProps

function MapFilter(props: OurProps) {
	const [isModalOpen, setModalOpen] = useState(false);
	const [isMapLoaded, setMapLoaded] = useState(false);
	const modalRef = useRef<HTMLDialogElement | null>(null);

	async function handleMapClick() {
		setModalOpen(true);
	}

	async function handleDiablogCloseButtonClick() {
		setModalOpen(false);
	}

	useEffect(() => {
		const modalElement = modalRef.current;
		if (modalElement) {
			if (isModalOpen) {
				modalElement.showModal();
				if (!isMapLoaded) {
					loadMap('map-editable', true, props);
					setMapLoaded(true);
				}
			} else {
				modalElement.close();
			}
		}
	}, [isModalOpen]);

	useEffect(() => {
		loadMap('map-non-editable', false, props);
	}, [props])

	const handleCloseModal = () => {
		setModalOpen(false);
	};

	const handleKeyDown = (event: React.KeyboardEvent<HTMLDialogElement>) => {
		if (event.key === "Escape") {
			handleCloseModal();
		}
	};

	return(
		<>
			<div id="map-non-editable" className='map-non-editable'>
				<div className='map-overlay-wrapper position-absolute top-0 start-0 bottom-0 end-0 z-1' onClick={handleMapClick}>
					<div className='map-overlay'></div>
					<i className="map-overlay-icon fas fa-expand-arrows-alt position-absolute top-50 start-50 translate-middle z-2"></i>
				</div>
			</div>

			<div className="">
				<dialog ref={modalRef} className="modal-dialog modal-xl p-0 map-dialog" onKeyDown={handleKeyDown}>
					<div className="modal-content">
						<div className='modal-header'>
							<h1 className="modal-title fs-4">Select regions of interest</h1>
							<button type="button" className="btn-close" data-bs-dismiss="modal" aria-label="Close" onClick={handleDiablogCloseButtonClick}></button>
						</div>
						<div className='modal-body'>
							<div id="map-editable" className='map-editable'>
								<div id="stationFilterCtrl" className="ol-control ol-layer-control-ur" style={{ top: 70, fontSize: 20 }}></div>
								<div id="popover" className="ol-popup"></div>
								<div id="projSwitchCtrl" className="ol-layer-control ol-layer-control-lr" style={{ zIndex: 99, marginRight: 10, padding: 0 }}></div>
								<div id="layerCtrl" className="ol-layer-control ol-layer-control-ur"></div>
								<div id="attribution" className="ol-attribution ol-unselectable ol-control ol-uncollapsible" style={{ right: 15 }}>
									<ul>
										<li>
											<Copyright />
										</li>
									</ul>
									<ul>
										<li id="baseMapAttribution" />
									</ul>
								</div>
							</div>
						</div>
					</div>
				</dialog>
			</div>
		</>
	)
}

function loadMap(elementId: string, edit: boolean, props: OurProps) {
	(async () => {
		const { default: InitMap } = await import(
			/* webpackMode: "lazy" */
			/* webpackChunkName: "init-map" */
			'../../models/InitMap'
		);
		new InitMap({
			mapRootElement: document.getElementById(elementId)!,
			allStations: props.allStations,
			stationPos4326Lookup: props.stationPos4326Lookup,
			persistedMapProps: props.persistedMapProps,
			mapProps: props.mapProps,
			updateMapSelectedSRID: props.updateMapSelectedSRID,
			updatePersistedMapProps: props.updatePersistedMapProps,
			labelLookup: props.labelLookup,
			selectedStations: props.selectedStations,
			edit: edit
		});
	})()
		.catch(error => {
			props.failWithError(error);
		});
}

function stateToProps(state: State) {
	return {
		specTable: state.specTable,
		allStations: state.baseDobjStats.getAllColValues("station").filter(Value.isString),
		stationPos4326Lookup: state.stationPos4326Lookup,
		labelLookup: state.labelLookup,
		selectedStations: state.specTable.origins.getDistinctColValues("station").filter(Value.isString),
		mapProps: state.mapProps
	};
}

function dispatchToProps(dispatch: PortalDispatch) {
	return {
		failWithError: (error: Error) => failWithError(dispatch)(error),
	};
}

export default connect(stateToProps, dispatchToProps)(MapFilter);
