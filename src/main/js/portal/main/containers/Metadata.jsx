import React, { Component } from 'react';
import CartBtn from '../components/buttons/CartBtn.jsx';
import { formatBytes } from '../utils';
import commonConfig from '../../../common/main/config';

export default class Preview extends Component {
	constructor(props) {
		super(props);
	}

	handleAddToCart(objInfo) {
		this.props.addToCart(objInfo);
	}

	handleRemoveFromCart(objInfo) {
		this.props.removeFromCart(objInfo);
	}

	render() {
		const { metadata, cart } = this.props;
		const isInCart = cart.hasItem(metadata.id);
		const actionButtonType = isInCart ? 'remove' : 'add';
		const buttonAction = isInCart ? this.handleRemoveFromCart.bind(this) : this.handleAddToCart.bind(this);
		const station = metadata && metadata.specificInfo && metadata.specificInfo.acquisition.station;

		return (
			<div>
				{metadata && metadata.submission &&
					<div>
						<div className="row page-header">
							<div className="col-md-9">
								<h1>{metadata.specification.self.label}{station && <span> from {station.name}</span>}</h1>
								<h2 className="text-muted">{formatDate(new Date(metadata.specificInfo.acquisition.interval.start))} - {formatDate(new Date(metadata.specificInfo.acquisition.interval.stop))}</h2>
							</div>
							<div className="col-md-3 text-right" style={{ marginTop: 30 }}>
								<CartBtn
									style={{ float: 'right', marginBottom: 10 }}
									checkedObjects={[metadata.id]}
									clickAction={buttonAction}
									enabled={true}
									type={actionButtonType}
								/>
							</div>
						</div>
						<div className="row">
							<div className="col-md-8">
								{metadata.submission.stop ? null :
									<div className="alert alert-warning">Upload not complete, data is missing.</div>
								}
								{metadata.nextVersion &&
									<div className="alert alert-warning">A newer version of this data is availble: <a href={metadata.nextVersion} className="alert-link">{metadata.nextVersion}</a></div>
								}
								{metadata.doi &&
									metadataRow("DOI", doiLink(metadata.doi))
								}
								{metadataRow("PID", doiLink(metadata.pid))}
								{metadataRow("Affiliation", metadata.specification.project.label)}
								{metadataRow("Type", metadata.specification.self.label)}
								{metadataRow("Level", metadata.specification.dataLevel)}
								{metadataRow("File name", metadata.fileName)}
								{metadataRow("Size", formatBytes(metadata.size, 0))}
								<br />
								{metadataRow("Station", <a href={station.org.self.uri}>{station.name}</a>)}
								<br />
							</div>
							<div className="col-md-4">
								<div className="row">
									<div className="col-md-12">
										{map(metadata.specification.theme.markerIcon, metadata.coverageGeoJson)}
									</div>
								</div>
								<br />
								<div className="row">
									<div className="col-md-12">
										<label>Metadata download</label>
										{metadataDownload(metadata.id, metadata.fileName)}
									</div>
								</div>
								<br />
								<div className="row">
									<div className="col-md-12">
										<label>Technical metadata</label>
										<div><a href={metadata.id}>View metadata page <span className="glyphicon glyphicon-share"></span></a></div>
									</div>
								</div>
							</div>
						</div>
					</div>
				}
			</div>
		);
	}
}

const metadataRow = (label, value) => {
	return (
		<div className="row">
			<div className="col-md-2"><label>{label}</label></div>
			<div className="col-md-10">{value}</div>
		</div>
	);
};

const doiLink = (doi) => {
	return (
		<span>
			<a href={`https://doi.org/${doi}`}>{doi}</a>&nbsp;
			(<a target="_blank" href={`https://search.datacite.org/works/${doi}`}>metadata</a>)
		</span>
	);
};

const metadataDownload = (id, fileName) => {
	const json = `${id}/${fileName}.json`;
	const xml = `${id}/${fileName}.xml`;
	const turtle = `${id}/${fileName}.ttl`;
	return (
		<div>
			<a href={json}>JSON</a> &#8226; <a href={xml}>RDF/XML</a> &#8226; <a href={turtle}>RDF/TURTLE</a>
		</div>
	);
};

const map = (icon, coverage) => {
	const style = { border: '1px solid #ddd', width: '100%', height: '400px' };
	return (
		<iframe src={`${commonConfig.metaBaseUri}station/?icon=${icon}&coverage=${coverage}`} style={style}></iframe>
	);
};

function formatDate(d) {
	if (!d) return '';

	return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

function pad2(s) {
	return ("0" + s).substr(-2, 2);
}
