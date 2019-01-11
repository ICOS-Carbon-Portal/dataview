import 'babel-polyfill';
import {getTableFormatNrows, getBinTable} from './backend';
import {logError, saveToRestheart} from '../../common/main/backend';
import UrlSearchParams from '../../common/main/models/UrlSearchParams';
import config from '../../portal/main/config';
import Dygraph from 'dygraphs';
import './Dygraphs.css';
import CollapsibleSection from './CollapsibleSection';


const spinnerDelay = 100;
const errMsg = `
<div>
	<h2>Invalid request</h2>
	
	<div style="font-weight:bold;">Required parameters:</div>
	<ul style="margin:0;">
		<li>objId: List (comma separated) of data object ids.</li>
		<li>x: Parameter name for X axis.</li>
		<li>y: Parameter name for Y axis.</li>
	</ul>
	
	<div style="font-weight:bold;margin-top:30px;">Optional parameters:</div>
	<ul style="margin:0;">
		<li>linking: Defaults to <i>overlap</i>. Use <i>concatenate</i> to display data objects as one series.</li>
		<li>legendLabels: List (comma separated matching order of objId) of labels for legend. Defaults to file name.</li>
		<li>legendClosed: Start with legend collapsed. Defaults to legend open.</li>
	</ul>
	
	<div style="margin-top:30px;">
		<a href="?objId=-xQ2wgAt-ZjdGaCEJnKQIEIu,0EwfR9LutvnBbvgW-KJdq2U0&x=TIMESTAMP&linking=overlap&y=co2&legendLabels=HPB 93.0,SMR 67.2&legendClosed">Example</a>
	</div>
</div>`;

export default class App {
	constructor(config, params){
		this.config = config;
		this.params = params;
		this.graph = undefined;
		this.tableFormat = undefined;
		this.labels = [];

		if (window.frameElement) {
			this.showSpinner(false);
			window.onmessage = event => {
				const urlParams = new URL(event.data).search;
				this.params = new UrlSearchParams(urlParams, ['objId', 'x', 'y']);
				if (this.params.isValidParams) {
					hideError();
					this.graph = undefined;
					this.labels = [];
					this.main();
				} else {
					presentError(`Please choose a value for ${this.params.missingParams.join(', ')}.`);
				}
			}
		} else {
			if (params.isValidParams) {
				this.main();
			} else {
				presentError(errMsg);
			}
		}

		const styles = {
			details: 'position:absolute; z-index:999; background-color:white; border:1px solid black; padding:5px;' +
				' border-radius:5px; box-shadow: 9px 8px 20px -18px rgba(0,0,0,0.75);',
			summary: "font-weight:bold; cursor:pointer;",
			anchor: "margin-top: 7px;"
		};
		this.legend = new CollapsibleSection('legend', 'Legend', styles, this.params.get('legendClosed'), true);
	}

	main(){
		const params = this.params;
		saveToRestheart(formatData(params));

		const ids = params.get('objId').split(',');
		const legendLabels = params.has('legendLabels') ? params.get('legendLabels').split(',') : [];

		return getTableFormatNrows(this.config, ids)
		.then(
			([tableFormat, objects]) => {
				if(!isColNameValid(tableFormat, params.get('x')))
					return fail(`Parameter x (${params.get('x')}) does not exist in data`);
				else if(!isColNameValid(tableFormat, params.get('y')))
					return fail(`Parameter y (${params.get('y')}) does not exist in data`);
				else {
					if (typeof this.graph === "undefined") {
						const title = window.frameElement ? null : `${objects[0].specLabel} - ${params.get('y')}`;
						this.initGraph(tableFormat, title);
						this.tableFormat = tableFormat;
						this.labels.push(getColInfoParam(tableFormat, params.get('x'), 'label'));

						if (params.get('linking') === 'concatenate'){
							this.labels.push(params.has('legendLabels') && params.get('legendLabels').length
								? params.get('legendLabels').split(',')[0]
								: getYLabel(tableFormat, params.get('y')));

						} else {
							objects.forEach((object, idx) => {
								const filename = object.filename;
								const yLabel = legendLabels.length > idx && legendLabels[idx].length > 0
									? legendLabels[idx]
									: filename.slice(0, filename.lastIndexOf('.'));
								this.labels.push(yLabel);
							})
						}
					}

					return [tableFormat, objects];
				}
			}
		)
		.then(
			([tableFormat, objects]) => {
				return Promise.all(
					objects.map(object =>
						getBinTable(params.get('x'), params.get('y'), object.id, tableFormat, object.nRows))
				)
			}
		)
		.then(binTables => {
			if (binTables.length > 1) {
				this.graph.updateOptions({ labels: this.labels });
			}
			this.drawGraph(binTables)
		})
		.catch(err => {
			this.showSpinner(false);
			presentError(err.message);
		});
	}

	initGraph(tableFormat, title){
		this.showSpinner(true);

		const params = this.params;
		const xlabel = getColInfoParam(tableFormat, params.get('x'), 'label');
		const ylabel = getYLabel(tableFormat, params.get('y'));
		const labelCount = params.get('linking') === 'concatenate' ? 2 : params.get('objId').split(',').length + 1;
		const labels = Array(labelCount).fill('');
		const valueFormatX = getColInfoParam(tableFormat, params.get('x'), 'valueFormat');
		const formatters = getFormatters(xlabel, valueFormatX);
		const drawPoints = params.get('type') !== 'line';

		this.graph = new Dygraph(
			'graph',
			[Array(labels.length).fill(0)],
			{
				title: title,
				strokeWidth: 0,
				drawPoints,
				legend: 'always',
				labelsDiv: 'legend',
				labelsSeparateLines: true,
				legendFormatter: this.legendFormatter,
				xlabel,
				ylabel,
				labels: labels,
				xRangePad: 5,
				connectSeparatedPoints: true,
				digitsAfterDecimal: 4,
				axes: {
					x: {
						drawGrid: false,
						axisLabelWidth: 80,
						valueFormatter: formatters.valueFormatter,
						axisLabelFormatter: formatters.axisLabelFormatter,
						pixelsPerLabel: 100
					},
					y: {
						axisLabelWidth: 100
					}
				}
			}
		);
	}

	legendFormatter(data){
		return `${data.x === undefined ? '' : data.xHTML}<br><table>` + data.series.map(series =>
			`<tr style="color:${series.color}"><td>${series.labelHTML}:</td>` +
			`<td>${isNaN(series.yHTML) ? '' : series.yHTML}</td></tr>`
		).join('') + '</table>';
	}

	drawGraph(binTables){
		const data = () => {
			if (this.params.get('linking') === 'concatenate') {
				// Concatenation
				const valueFormatX = getColInfoParam(this.tableFormat, this.params.get('x'), 'valueFormat');
				return isTimestamp(valueFormatX)
					? binTables.flatMap(binTable => binTable.values([0, 1], (subrow) => [new Date(subrow[0]), subrow[1]]))
					: binTables.flatMap(binTable => binTable.values([0, 1], subrow => subrow)
				).sort((d1, d2) => d1[0] - d2[0]);
			} else {
				// Overlap
				const dates = binTables.flatMap(binTable => binTable.values([0], v => v[0]));
				const uniqueDates = Array.from(new Set(dates));
				let dateList = new Map(uniqueDates.map(i => [i, Array(binTables.length).fill(NaN)]));

				binTables.map((binTable, index) => {
					binTable.values([0, 1], subrow => {
						let v = dateList.get(subrow[0]);
						v[index] = subrow[1];
						dateList.set(subrow[0], v);
					});
				});

				return Array.from(dateList).map(k => k.flatten()).sort((d1, d2) => d1[0] - d2[0]);
			}
		};

		const strokeWidth = this.params.get('type') !== 'line' ? 0 : 1;

		this.graph.updateOptions( { file: data, strokeWidth } );
		this.showLegend();
		this.showSpinner(false);
	}

	showLegend(){
		const xAxisRange = this.graph.xAxisExtremes();
		const xCoord = this.graph.toDomXCoord(xAxisRange[0]);
		const titleHeight = this.graph.getOption('titleHeight');
		const graphStyle = window.getComputedStyle(document.getElementById("graph"));
		const top = parseInt(graphStyle.top);
		const left = parseInt(graphStyle.left);

		this.legend.setPosition(top + titleHeight + 2, left + xCoord + 2);
		this.legend.show();
	}

	showSpinner(show){
		if (show) {
			this.timer = setTimeout(() => document.getElementById('cp-spinner').style.display = 'inline', spinnerDelay);
		} else {
			clearTimeout(this.timer);
			document.getElementById('cp-spinner').style.display = 'none';
		}
	}
}

const getFormatters = (xlabel, valueFormatX) => {
	const formatLbl = (val) => {
		return `<span style="font-weight: bold; color: rgb(0,128,128);">${xlabel}</span>: ${val}`
	};

	const parseDatetime = (converter, format, func) => {
		const pad = (number) => {
			return number < 10 ? '0' + number : number;
		};

		return (timeUnit) => {
			const fn = func ? func : (val) => val;
			const date = new Date(converter * timeUnit);

			switch(format){
				case "datetime":
					return date.getUTCFullYear() +
						'-' + pad(date.getUTCMonth() + 1) +
						'-' + pad(date.getUTCDate()) +
						' ' + pad(date.getUTCHours()) +
						':' + pad(date.getUTCMinutes()) +
						':' + pad(date.getUTCSeconds());

				case "date":
					return fn(date.getUTCFullYear() +
						'-' + pad(date.getUTCMonth() + 1) +
						'-' + pad(date.getUTCDate()));

				case "hms":
					return fn(pad(date.getUTCHours()) +
						':' + pad(date.getUTCMinutes()) +
						':' + pad(date.getUTCSeconds()));

				case "hm":
					return fn(pad(date.getUTCHours()) + ':' + pad(date.getUTCMinutes()));

				default:
					return fn(timeUnit);
			}
		}
	};

	switch (valueFormatX) {

		case 'http://meta.icos-cp.eu/ontologies/cpmeta/iso8601dateTime':
			return {valueFormatter: parseDatetime(1, "datetime"), axisLabelFormatter: parseDatetime(1, "date")};

		case 'http://meta.icos-cp.eu/ontologies/cpmeta/iso8601date':
			const days2ms = 24 * 3600 * 1000;
			return {valueFormatter: parseDatetime(days2ms, "date", formatLbl), axisLabelFormatter: parseDatetime(days2ms, "date")};

		case "http://meta.icos-cp.eu/ontologies/cpmeta/iso8601timeOfDay":
			const sec2ms = 1000;
			return {valueFormatter: parseDatetime(sec2ms, "hms", formatLbl), axisLabelFormatter: parseDatetime(sec2ms, "hm")};

		default:
			return {valueFormatter: formatLbl, axisLabelFormatter: (val) => val};
	}
};

const isTimestamp = (valueFormat) => {
	return valueFormat === 'http://meta.icos-cp.eu/ontologies/cpmeta/iso8601dateTime';
};

const isColNameValid = (tableFormat, colName) => {
	return tableFormat.getColumnIndex(colName) >= 0;
};

const getColInfoParam = (tableFormat, colName, param) => {
	return tableFormat.columns(tableFormat.getColumnIndex(colName))[param];
};

const getYLabel = (tableFormat, colName) => {
	const unit = getColInfoParam(tableFormat, colName, 'unit');
	const label = getColInfoParam(tableFormat, colName, 'label');
	return unit !== '?' ? `${label}, ${unit}` : label;
};

const fail = (message) => {
	logError(config.TIMESERIES, message);
	return Promise.reject(new Error(message));
};

const presentError = (errMsg) => {
	document.getElementById('cp-spinner').style.display = 'none';
	document.getElementById('error').style.display = 'flex';
	document.getElementById('error').innerHTML = errMsg;

	logError(config.TIMESERIES, errMsg);
};

const hideError = () => {
	document.getElementById('error').style.display = 'none';
};

const formatData = dataToSave => {
	return {
		previewTimeserie: {
			params: {
				objId: dataToSave.get('objId'),
				x: dataToSave.get('x'),
				y: dataToSave.get('y'),
				type: dataToSave.get('type')
			}
		}
	}
};
