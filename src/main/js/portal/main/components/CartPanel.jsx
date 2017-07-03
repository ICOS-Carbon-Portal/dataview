import React, { Component } from 'react';
import CartIcon from './CartIcon.jsx';
import PreviewIcon from './PreviewIcon.jsx';
import EditablePanelHeading from './EditablePanelHeading.jsx';


export default class CartPanel extends Component {
	constructor(props){
		super(props);
		this.state = {
			selectedItemId: undefined
		};
	}

	handleClick(id){
		this.setState({selectedItemId: id});
	}

	render(){
		const {cart, removeFromCart, previewItemAction, previewLookup} = this.props;

		return (
			<div className="panel panel-default">
				<EditablePanelHeading
					cart={cart}
					iconClass="glyphicon glyphicon-edit"
					iconTooltip="Change name of cart"
				/>

				<div className="panel-body">{
					cart.count
						? <ul className="list-group">{
							cart.items.map((item, i) =>
								<Item
									item={item}
									previewLookup={previewLookup}
									selected={this.state.selectedItemId === item.id}
									removeFromCart={removeFromCart}
									previewItemAction={previewItemAction}
									clickAction={this.handleClick.bind(this)}
									key={'ci' + i}
								/>
							)}
						</ul>
						: <div>Your cart is empty</div>
				}</div>
			</div>
		);
	}
}

const Item = props => {
	const {item, previewLookup, selected, removeFromCart, previewItemAction, clickAction} = props;

	const action = () => {
		clickAction(props.item.id);
	};

	const previewType = previewLookup && previewLookup[item.spec]
		? previewLookup[item.spec].type
		: undefined;

	const className = selected
		? "list-group-item list-group-item-info"
		: "list-group-item";

	return (
		<li className={className} onClick={action}>
			<CartIcon id={item.id} removeFromCart={removeFromCart} isAddedToCart={true} />
			<PreviewIcon id={item.id} previewType={previewType} clickAction={previewItemAction} />
			<a href={item.id} target="_blank">{item.itemName}</a>
		</li>
	);
};