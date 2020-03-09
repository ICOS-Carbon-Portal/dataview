import React, {ChangeEvent, Component} from "react";
import HelpButton from "../../containers/help/HelpButton";
import {FilterNumber} from "../../models/FilterNumbers";


interface OurProps {
	isEnabled?: boolean
	filterNumber: FilterNumber
	action: (val: FilterNumber) => void
}

interface OurState {
	isValid: boolean
	val?: string
}

export default class NumberFilter extends Component<OurProps, OurState> {
	constructor(props: OurProps){
		super(props);

		this.state = {
			val: undefined,
			isValid: true
		};
	}

	handleChange(ev: ChangeEvent<HTMLInputElement>) {
		const filterNumber = this.props.filterNumber.validate(ev.target.value);

		this.setState({
			isValid: filterNumber.isValid,
			val: filterNumber.txt
		});

		if (filterNumber.isValid) {
			this.props.action(filterNumber);
		}
	}

	render() {
		const {isEnabled = true, filterNumber} = this.props;
		if (!isEnabled) return null;

		const {isValid, val} = this.state;
		const style = isValid ? {} : {backgroundColor: '#ebccd1'};
		const value = val ?? filterNumber.txt;

		return (
			<div className="row" style={{marginTop: 10}}>
				<div className="col-md-12">
					<label style={{marginBottom: 0}}>{filterNumber.label}</label>

					<HelpButton
						name={filterNumber.category}
						title="Click to toggle help"
					/>

					<input
						type="text"
						className="form-control"
						onChange={this.handleChange.bind(this)}
						disabled={!isEnabled}
						style={style}
						value={value}
					/>

				</div>
			</div>
		);
	}
};
