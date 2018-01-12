
export const getNewTimeseriesUrl = (item, xAxis) => {
	return item.getNewUrl({
		objId: item.id.split('/').pop(),
		x: xAxis,
		type: 'scatter'
	});
};

export const getRouteFromLocationHash = () => {
	return window.location.hash.substr(1).split('?')[0];
};

export const formatBytes = (bytes, decimals) => {
	if (isNaN(bytes)) return "";
	if(bytes === 0) return '0 Bytes';

	const k = 1024,
		dm = decimals || 2,
		sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'],
		i = Math.floor(Math.log(bytes) / Math.log(k));
	return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}
