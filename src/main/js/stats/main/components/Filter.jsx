import React, { Component } from 'react';
import Multiselect from 'react-widgets/lib/Multiselect';

export const placeholders = {
	specification: 'Specification',
	dataLevel: 'Data level',
	format: 'Format',
	stations: 'Stations',
	contributors: 'Contributors',
	themes: 'Theme',
	countryCodes: 'Country codes'
};

export default class Filter extends Component {
	constructor(props) {
		super(props);
		this.state = { value: [] }
	}

	render() {
		const {filters, downloadStats, fetchDownloadStats} = this.props;

		const Row = ({filter}) => {
			return (
				<div className="row" key={filter.name} style={{marginTop: 10, alignItems: 'center'}}>
					<div className="col-md-4">
						<label style={{marginBottom: 0, lineHeight: '34px'}}>{placeholders[filter.name]}</label>
					</div>
					<div className="col-md-8">
						<Multiselect
							placeholder={placeholders[filter.name]}
							valueField="_id"
							textField="label"
							data={filter.values}
							value={downloadStats.getFilter(filter.name)}
							filter="contains"
							onChange={this.handleSelectionChange.bind(this, filter)}
						/>
					</div>
				</div>
			)
		};

		const showResetBtn = !!filters;

		return (
			<div className="panel panel-default">
				<div className="panel-heading">
					{showResetBtn
						? <ResetBtn resetFiltersAction={() => fetchDownloadStats({})} />
						: null
					}
					<h3 className="panel-title">Data object specification filter</h3>
				</div>
				<div className="panel-body">
					{ filters
						? filters.map((filter, idx) => <Row key={'row-'+idx} filter={filter} />)
						: null
					}
				</div>
			</div>
		)
	}

	handleSelectionChange(filter, values) {
		this.props.updateTableWithFilter(filter.name, values.map(value => value._id));
	}

	tagItem({item}) {
		return <span>{item.text}</span>;
	}

}

const ResetBtn = props => {
	return <div
		className="glyphicon glyphicon-ban-circle"
		style={{display: 'inline', float: 'right', fontSize: '150%', cursor: 'pointer'}}
		title="Clear all filters"
		onClick={props.resetFiltersAction}
		/>;
};
