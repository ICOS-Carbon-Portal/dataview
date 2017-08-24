import {ERROR, COUNTRIES_FETCHED, SERVICES_FETCHED, VARIABLES_AND_DATES_FETCHED, ELEVATIONS_FETCHED, RASTER_FETCHED,
	SERVICE_SELECTED, VARIABLE_SELECTED, DATE_SELECTED, ELEVATION_SELECTED, GAMMA_SELECTED, DELAY_SELECTED,
	RASTER_VALUE_RECEIVED, PUSH_PLAY, INCREMENT_RASTER} from './actions';
import {Control} from './models/ControlsHelper';
import ColorMaker from '../../common/main/models/ColorMaker';
import RasterDataFetcher from './models/RasterDataFetcher';
import * as Toaster from 'icos-cp-toaster';

export default function(state, action){

	switch(action.type){

		case ERROR:
			return update({
				event: ERROR,
				toasterData: new Toaster.ToasterData(Toaster.TOAST_ERROR, action.error.message.split('\n')[0])
			});

		case COUNTRIES_FETCHED:
			return update({
				event: COUNTRIES_FETCHED,
				countriesTopo: {
					ts: Date.now(),
					data: action.countriesTopo
				}
			});

		case SERVICES_FETCHED:
			return update({
				event: SERVICES_FETCHED,
				controls: state.controls.withServices(new Control(action.services), state.controls.lastChangedControl)
			});

		case VARIABLES_AND_DATES_FETCHED:
			if (isFetched(state, action)){
				const controls = state.controls.withVariables(new Control(action.variables), state.controls.lastChangedControl)
					.withDates(new Control(action.dates), state.controls.lastChangedControl);

				return update({
					event: VARIABLES_AND_DATES_FETCHED,
					controls
				});
			} else {
				return state;
			}

		case ELEVATIONS_FETCHED:
			if (isElevationsFetched(state, action)) {
				const elevationCtrls = state.controls.withElevations(
					new Control(filterElevations(action.elevations)),
					state.controls.lastChangedControl
				);

				return update({
					event: ELEVATIONS_FETCHED,
					controls: elevationCtrls,
					rasterDataFetcher: new RasterDataFetcher(getDataObjectVariables(elevationCtrls))
				});
			} else {
				return state;
			}

		case SERVICE_SELECTED:
			return update({
				event: SERVICE_SELECTED,
				controls: state.controls.withSelectedService(action.idx)
			});

		case VARIABLE_SELECTED:
			return update({controls: state.controls.withSelectedVariable(action.idx)});

		case DATE_SELECTED:
			return update({controls: state.controls.withSelectedDate(action.idx)});

		case ELEVATION_SELECTED:
			return update({controls: state.controls.withSelectedElevation(action.idx)});

		case DELAY_SELECTED:
			const delayCtrls = state.controls.withSelectedDelay(action.idx);
			const rasterDataFetcher = new RasterDataFetcher(
				getDataObjectVariables(delayCtrls),
				{
					delay: delayCtrls.delays.selected
				}
			);

			return update({
				controls: delayCtrls,
				rasterDataFetcher
			});

		case GAMMA_SELECTED:
			const newGammaControls = state.controls.withSelectedGamma(action.idx);
			const selectedGamma = newGammaControls.gammas.selected;

			if(state.raster.data){
				state.raster.data.id = state.raster.data.basicId + selectedGamma;
			}

			return update({
				controls: newGammaControls,
				colorMaker: state.raster.data
					? new ColorMaker(state.raster.data.stats.min, state.raster.data.stats.max, selectedGamma)
					: null
			});

		case RASTER_FETCHED:
			return isRasterFetched(state, action)
				? update({
					event: RASTER_FETCHED,
					raster: {
						ts: Date.now(),
						data: action.raster
					},
					colorMaker: new ColorMaker(action.raster.stats.min, action.raster.stats.max, state.controls.gammas.selected)
				})
				: state;

		case RASTER_VALUE_RECEIVED:
			return update({
				event: RASTER_VALUE_RECEIVED,
				rasterVal: action.val
			});

		case PUSH_PLAY:
			const playingMovie = !state.playingMovie;
			const did = playingMovie
				? state.rasterDataFetcher.getDesiredId(state.controls.selectedIdxs)
				: state.desiredId;
			return update({playingMovie, desiredId: did});

		case INCREMENT_RASTER:
			const controls = state.controls.withIncrementedDate(action.increment);
			const desiredId = state.rasterDataFetcher.getDesiredId(controls.selectedIdxs);
			// console.log({state, action, controls, desiredId});

			return state.raster.data
				? update({controls, desiredId})
				: state;

		default:
			return update({event: undefined});
	}

	function update(){
		const updates = Array.from(arguments);
		return Object.assign.apply(Object, [{}, state].concat(updates));
	}
}

function filterElevations(elevations){
	//TODO: Remove this when backend filters elevations
	return elevations.length === 1 && elevations[0] === "null"
		? []
		: Array.from(new Set(elevations));
}

function isFetched(state, action){
	return action.service === state.controls.services.selected;
}

function isElevationsFetched(state, action){
	return action.controls.services.selected === state.controls.services.selected
		&& action.controls.variables.selected === state.controls.variables.selected;
}

function isRasterFetched(state, action){
	return action.controls.services.selected === state.controls.services.selected &&
		action.controls.variables.selected === state.controls.variables.selected &&
		action.controls.dates.selected === state.controls.dates.selected &&
		action.controls.elevations.selected === state.controls.elevations.selected;
}

function getDataObjectVariables(controls){
	return {
		dates: controls.dates.values,
		elevations: controls.elevations.values,
		gammas: controls.gammas.values,
		services: controls.services.values,
		variables: controls.variables.values
	};
}
