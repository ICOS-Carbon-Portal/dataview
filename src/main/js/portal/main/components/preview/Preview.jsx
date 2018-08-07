import React, { Component } from 'react';
import PreviewTimeSerie from './PreviewTimeSerie.jsx';
import PreviewNetCDF from './PreviewNetCDF.jsx';
import CopyValue from '../controls/CopyValue.jsx';
import config from '../../config';

export default class Preview extends Component {
	constructor(props){
		super(props);
		this.state = {
			iframeSrc: undefined
		};
		window.onmessage = event => this.handleIframeSrcChange(event); 
	}

	handleIframeSrcChange(event){
		const iframeSrc = event instanceof MessageEvent ? event.data : event.target.src;
		this.setState({iframeSrc});
		this.props.setPreviewUrl(iframeSrc);
	}

	render(){
		const {preview, closePreviewAction} = this.props;

		return (
			<div>
				{preview
					? <div>
						<div className="panel panel-default">

							<div className="panel-heading">
								<span className="panel-title">
									{preview.items.map(item => {
										return (
											<span key={item.id} style={{marginRight: 10}}>
												<span style={{marginRight: 10}}>
													{item.itemName}
												</span>
												<a href={item.id} title="View metadata" target="_blank">
													<span className="glyphicon glyphicon-info-sign" />
												</a>
											</span>
										);
									})}
								</span>
								<CloseBtn closePreviewAction={closePreviewAction} />
							</div>

							<div className="panel-body">
								<div className="row">
									<div className="col-md-12">
										<CopyValue
											btnText="Copy preview chart URL"
											copyHelpText="Click to copy preview chart URL to clipboard"
											valToCopy={previewUrl(preview.items[0], preview.type, this.state.iframeSrc)}
										/>
									</div>
								</div>
							</div>

							<PreviewRoute iframeSrcChange={this.handleIframeSrcChange.bind(this)} {...this.props} />

						</div>
					</div>
					: null
				}</div>
		);
	}
}

const PreviewRoute = props => {
	switch (props.preview.type){

		case config.TIMESERIES:
			return <PreviewTimeSerie {...props} />;

		case config.NETCDF:
			return <PreviewNetCDF {...props} />;

		default:
			return (
				<div className="panel-body">
					This type of preview is not yet implemented
				</div>
			);
	}
};

const CloseBtn = props => {
	if (props.closePreviewAction){
		return <span
			className="glyphicon glyphicon-remove-sign"
			style={{float: 'right', fontSize: '170%', cursor: 'pointer'}}
			title="Close preview"
			onClick={props.closePreviewAction}
		/>;
	} else {
		return <span />;
	}
};

const previewUrl = (item, type, iframeSrc) => {
	switch (type) {

		case config.TIMESERIES:
			return (item && item.getUrlSearchValue('x') && item.getUrlSearchValue('y')) ? iframeSrc : '';

		default:
			return (item) ? iframeSrc : '';
	}
};
