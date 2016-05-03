const xColumn = 'TIMESTAMP';
const yColumn = 'PARAMETER';

function axisColumnIndices(tableFormat){
	return [xColumn, yColumn].map(idx => tableFormat.getColumnIndex(idx));
}

export function makeTableRequest(tableFormat, dataObjectInfo){
	const axisIndices = axisColumnIndices(tableFormat);

	return tableFormat.getRequest(dataObjectInfo.id, dataObjectInfo.nRows, axisIndices);
}

export function binTable2Dygraph(binTable){
	let dataArr = [];

	for (let i=0; i<binTable.length; i++){
		if (!isNaN(binTable.value(i, 0))) {
			dataArr.push([
				new Date(binTable.value(i, 0)),
				binTable.value(i, 1)
			]);
		}
	}

	return dataArr;
}

export function binTables2Dygraph(binTables, debug = false){

	function findMin(arr){
		let minVal = isNaN(arr[0])
			? (arr.length>1) ? Number.MAX_VALUE : arr[0]
			: arr[0];

		if (minVal == null){
			minVal = Number.MAX_VALUE;
		}

		for (let i=1; i<arr.length; i++){
			if (!isNaN(arr[i]) && arr[i] != null && arr[i] < minVal){
				minVal = arr[i];
			}
		}

		return minVal;
	}

	let idxs = new Array(binTables.length).fill(0);
	let doneIdxs = new Array(binTables.length).fill(0);
	let data = [];
	let breakLoop = false;

	// Loop through all rows in all binTables going to the largest index of them all
	while (!breakLoop ){
		let msDates = [];

		// For each binTable
		for (let bTIdx=0; bTIdx<binTables.length; bTIdx++){
			// debug ? console.log({rowIdx: idxs[bTIdx], date: new Date(binTables[bTIdx].value(idxs[bTIdx], 0)).toISOString(), isNotNumber: isNaN(binTables[bTIdx].value(idxs[bTIdx], 0))}) : null;

			// Do not exceed length of binTable and skip entries that cannot be parsed to a number
			if (idxs[bTIdx] < binTables[bTIdx].length && isNaN(binTables[bTIdx].value(idxs[bTIdx], 0))){
				// Skip this value since we do not know the date
				msDates.push(NaN);

			} else if (idxs[bTIdx] < binTables[bTIdx].length) {
				msDates.push(binTables[bTIdx].value(idxs[bTIdx], 0));

			} else {
				// No data in this binTable
				msDates.push(null);
			}
		}

		const smallest = findMin(msDates);

		if (!isNaN(smallest)) {
			let dataPoint = [new Date(smallest)];

			// debug ? console.log({msDates: msDates.map(d => new Date(d).toISOString()), smallest: new Date(smallest).toISOString()}) : null;

			for (let bTIdx = 0; bTIdx < binTables.length; bTIdx++) {
				if (isNaN(msDates[bTIdx])) {
					dataPoint.push(null);
					idxs[bTIdx]++;
				} else if (msDates[bTIdx] == null) {
					dataPoint.push(null);
				} else {
					if (msDates[bTIdx] <= smallest) {
						dataPoint.push(binTables[bTIdx].value(idxs[bTIdx], 1));
						idxs[bTIdx]++;
					} else {
						dataPoint.push(null);
					}
				}

				if (idxs[bTIdx] >= binTables[bTIdx].length){
					doneIdxs[bTIdx] = 1;
				}
			}

			data.push(dataPoint);
		} else {
			for (let bTIdx = 0; bTIdx < binTables.length; bTIdx++) {
				idxs[bTIdx]++;
			}
		}

		breakLoop = doneIdxs.reduce((prev, next) => { return prev * next; });
		debug ? console.log({breakLoop, dates: msDates.map(d => new Date(d).toISOString()), smallest}) : null;
	}

	return data;
}

export function getLabels(tableFormat){
	const axisIndices = axisColumnIndices(tableFormat);
	return axisIndices.map(i => tableFormat.columns(i).label);
}

function getUniqueLabels(dataObjId){
	return ["time instant", dataObjId];
}

export function addDataObject(chart, dataObjId, binTable, tableFormat){
	console.log({chart, dataObjId, binTable, tableFormat});
	const binTables = chart.binTables.concat(binTable);

	return (chart.dataObjectIds.includes(dataObjId))
		? chart
		: {
			dataObjectIds: chart.dataObjectIds.concat(dataObjId),
			binTables: binTables,
			data: binTables2Dygraph(binTables),
			labels: Array.from(new Set(chart.labels.concat(getUniqueLabels(dataObjId))))
		};
}