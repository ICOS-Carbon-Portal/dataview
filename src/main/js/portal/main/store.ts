import 'babel-polyfill';
import {createStore, applyMiddleware, Middleware, AnyAction, Action, compose} from 'redux';
import thunkMiddleware, {ThunkAction, ThunkDispatch} from 'redux-thunk';
import reducer from './reducers/mainReducer';
import {ActionPayload, init, IPortalPlainAction} from './actions';
import State from "./models/State";


// const logger = store => next => action => {
// 	console.log('dispatching', action);
// 	// Call the next dispatch method in the middleware chain.
// 	let returnValue = next(action);
// 	console.log('state after dispatch', store.getState());
// 	return returnValue;
// };
export type PortalAction = IPortalPlainAction | IPortalThunkAction | ActionPayload;
export interface IPortalThunkAction extends ThunkAction<void, State, undefined, PortalAction & Action<string>>{}
export type PortalDispatch = ThunkDispatch<State, undefined, PortalAction & Action<string>>

const payloadMiddleware: Middleware<PortalDispatch, State, PortalDispatch> = store => next => action => {
	const finalAction: AnyAction = (action instanceof ActionPayload)
		? createAction(action)
		: action;
	return next(finalAction);
};

const composeEnhancers = (window as any)['__REDUX_DEVTOOLS_EXTENSION_COMPOSE__'] as typeof compose || compose;

const enhancer = composeEnhancers(
	applyMiddleware(payloadMiddleware, thunkMiddleware)	//, logger)
);

export default function(){
	const store = createStore(
		reducer,
		undefined,
		enhancer
	);
	store.dispatch(init);
	return store;
}

function createAction(payload: ActionPayload): IPortalPlainAction {
	return {
		type: payload.constructor.name,
		payload
	};
}
