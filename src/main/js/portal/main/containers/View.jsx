import React, { Component } from 'react';
import ReactDOM from 'react-dom'
import { connect } from 'react-redux';
import {pinDataObject, addDataObject, removeDataObject, FETCHED_DATA, REMOVE_DATA, PIN_DATA} from '../actions';
import Chart from '../components/Chart.jsx'
import Leaflet from '../components/Leaflet.jsx'

class View extends Component {
	constructor(props){
		super(props);
		this.state = {secondRender: false};
	}

	componentDidMount(){
		if(this.state.secondRender) return;

		const chartDiv = ReactDOM.findDOMNode(this.refs.chartDiv);
		const chartDivWidth = chartDiv.getBoundingClientRect().width - 44;

		const mapDiv = ReactDOM.findDOMNode(this.refs.mapDiv);
		const mapDivWidth = mapDiv.getBoundingClientRect().width;

		this.setState({mapDivWidth, chartDivWidth, secondRender: true});
	}

	componentWillUnmount(){
		// console.log({status: this.props.status});
	}

	getMetaDataTableData(formats, labels){
		// console.log({formats, labels});
		let tableLabels = labels.slice(0);
		tableLabels.splice(0, 1);

		let tableData = [
			{
				label: '',
				values: tableLabels
			}
		];

		formats.forEach((format, idx) => {
			format.forEach(frm => {
				if (tableData.findIndex(td => td.label == frm.label) < 0){
					tableData.push({
						label: frm.label,
						values: new Array(formats.length)
					})
					tableData[tableData.length - 1].values[idx] = frm.value;
				} else {
					const tdIdx = tableData.findIndex(td => td.label == frm.label);
					tableData[tdIdx].values[idx] = frm.value;
				}
			});
		});

		// console.log({tableData});
		return tableData;
	}

	getTableRow(rowData, i){
		// console.log({rowData});

		if (rowData.label == 'LANDING PAGE'){
			return (
				<tr key={"lp" + i}>
					<th>{rowData.label}</th>
					{rowData.values.map((value, idx) => {
						return (
						<td key={"lp" + i + idx.toString()}>
							<a href={value} target="_blank">View landing page</a>
						</td>
						);
					})}
				</tr>
			);
		} else {
			return (
				<tr key={"rowL" + i}>
					<th>{rowData.label}</th>
					{rowData.values.map((value, idx) => {
						return (
							<td key={"rowD" + i + idx.toString()}>{value}</td>
						);
					})}
				</tr>
			);
		}
	}

	onLnkClick(dataObjectInfo){
		this.props.fetchData(dataObjectInfo);
	}

	onPinBtnClick(dataObjectInfo, event, classes){
		const btn = event.target;

		if (btn.className == classes.btnClass){
			btn.className = classes.btnClassActive;
		} else {
			btn.className = classes.btnClass;
		}

		this.props.pinData(dataObjectInfo);
	}

	onViewBtnClick(dataObjectInfo, event, classes){
		const btn = event.target;

		if (btn.className == classes.btnClass){
			btn.className = classes.btnClassActive;
			event.target.children[0].className = classes.viewIconOpen;

			this.props.addData(dataObjectInfo);
		} else {
			btn.className = classes.btnClass;
			event.target.children[0].className = classes.viewIconClosed;

			this.props.removeData(dataObjectInfo);
		}
	}

	render() {
		const props = this.props;
		const status = this.props.status;
		console.log({viewRender: props});

		const btnClass = "cp btn btn-default btn-xs";
		const btnClassActive = "cp btn btn-primary btn-xs active";

		const viewIconOpen = "glyphicon glyphicon-eye-open";
		const viewIconClosed = "glyphicon glyphicon-eye-close";

		return (
			<div id="cp_data_search" className="container-fluid">
				<h1>ICOS Data Service search result</h1>

				{props.filteredDataObjects && props.filteredDataObjects.length
					? (
						<div className="row">
							<div className="col-md-3">
								<label>Number of returned data objects:</label> <span>{props.filteredDataObjects.length}</span>
							</div>
						</div>
					)
					: null
					}

				<div className="row">
					<div className="col-md-3" style={{maxHeight: 430, overflow: 'auto'}}>
						{props.dataObjects
							? (
								<table className="table table-striped table-condensed table-bordered">
									<tbody>
									<tr>
										<th>Data object (sampling points)</th>
									</tr>
									{props.dataObjects.map((rowData, i) => {
										return (
											<tr key={"row" + i}>
												<td>
													<button className={rowData.pinned ? btnClassActive : btnClass}
															onClick={(event) => this.onPinBtnClick(rowData, event, {btnClass, btnClassActive})}
															title="Pin to save selection">
														<span className="glyphicon glyphicon-pushpin"></span>
													</button>
													<button className={rowData.view ? btnClassActive : btnClass}
															onClick={(event) => this.onViewBtnClick(rowData, event, {btnClass, btnClassActive, viewIconOpen, viewIconClosed})}
															title="Toggle visibility in multi graphs">
														<span className={rowData.view ? viewIconOpen : viewIconClosed}></span>
													</button>
													<span style={{marginLeft: 7}}>{rowData.fileName} ({rowData.nRows})</span>
												</td>
											</tr>
										);
									})}
									</tbody>
								</table>
							)
							: null
						}
					</div>
					<div ref="chartDiv" id="chartDiv" className="col-md-6">
						{props.forChart.data.length > 0 && this.state.secondRender//(status == FETCHED_DATA || status == REMOVE_DATA)
							? <Chart ref="chartComp" {...props.forChart} width={this.state.chartDivWidth} />
							: null
						}
					</div>
					<div ref="mapDiv" id="mapDiv" className="col-md-3">
						{props.forMap.geoms.length > 0 && this.state.secondRender//(status == FETCHED_DATA || status == REMOVE_DATA)
							? <Leaflet {...props.forMap} width={this.state.mapDivWidth} />
							: null
						}
					</div>

				</div>
				<div className="row">

				</div>
				<div className="row">
					<div ref="metaDiv" id="metaDiv" className="col-md-12">
						<table className="table table-striped table-condensed table-bordered">
							<tbody>
							{props.dataObjects.length > 0 && props.dataObjects.filter(dob => dob.view).length > 0
								? this.getMetaDataTableData(
									props.dataObjects.filter(dob => dob.metaData && dob.view).map(dob => dob.metaData.format),
									props.forChart.labels
								).map((rowData, idx) => this.getTableRow(rowData, idx))
								: null
							}
							</tbody>
						</table>
					</div>
				</div>
			</div>
		);
	}
}

function stateToProps(state){
	const dataObjSelected = (state.metaData != null);

	return Object.assign({},
		state,
		{
			metaTable: dataObjSelected
				? state.metaData.format
				: null
		}
	);
}

function dispatchToProps(dispatch){
	return {
		pinData(dataObjectInfo){
			dispatch(pinDataObject(dataObjectInfo));
		},

		addData(dataObjectInfo){
			dispatch(addDataObject(dataObjectInfo));
		},

		removeData(dataObjectInfo){
			dispatch(removeDataObject(dataObjectInfo));
		}
	};
}

export default connect(stateToProps, dispatchToProps)(View);

