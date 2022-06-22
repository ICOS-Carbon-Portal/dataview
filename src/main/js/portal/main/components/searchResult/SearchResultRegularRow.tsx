import React, { Component, MouseEvent, CSSProperties } from 'react';
import CheckBtn from '../buttons/ChechBtn';
import { isSmallDevice, getLastSegmentInUrl, linesToShowStyle, getUrlWithEnvironmentPrefix } from '../../utils';
import {LinkifyText} from '../LinkifyText';
import config from '../../config';
import { ObjectsTable, ExtendedDobjInfo, LabelLookup } from "../../models/State";
import Preview from '../../models/Preview';
import CartItem, { addingToCartProhibition } from '../../models/CartItem';
import { UrlStr } from '../../backend/declarations';
import CollectionBtn from '../buttons/CollectionBtn';


const truncateStyle: CSSProperties = {
	maxWidth: '100%',
	whiteSpace: 'nowrap',
	overflow: 'hidden',
	textOverflow: 'ellipsis'
};

const iconStation = '//static.icos-cp.eu/images/icons/station.svg';
const iconArrows = '//static.icos-cp.eu/images/icons/arrows-alt-v-solid.svg';
const iconTime = '//static.icos-cp.eu/images/icons/time.svg';
const iconFile = '//static.icos-cp.eu/images/icons/file.svg';
const iconCalendar = '//static.icos-cp.eu/images/icons/calendar-alt-regular.svg';

interface OurProps {
	objInfo: ObjectsTable | CartItem
	extendedInfo: ExtendedDobjInfo
	preview: Preview
	updateCheckedObjects: (ids: string) => void
	isChecked: boolean
	checkedObjects?: ObjectsTable[]
	labelLookup: LabelLookup
	isCartView: Boolean
}

export default class SearchResultRegularRow extends Component<OurProps> {

	render(){
		const props = this.props;
		const objInfo = props.objInfo;
		const extendedInfo = props.extendedInfo.theme && props.extendedInfo.themeIcon
				? props.extendedInfo
				: { ...props.extendedInfo, theme: 'Other data', themeIcon: 'https://static.icos-cp.eu/images/themes/oth.svg' }
		const specLabel = props.labelLookup[objInfo.spec]?.label ?? "Undefined data type";
		const title = extendedInfo.title ?? stationSpecificTitle(extendedInfo, objInfo.level, specLabel);
		const samplingHeight = extendedInfo.samplingHeight ? extendedInfo.samplingHeight + ' meters' : undefined;
		const {allowCartAdd, uiMessage} = addingToCartProhibition(objInfo);
		const checkBtnTitle = uiMessage ?? `Select to preview or download`;

		return(
			<div className='d-flex border-bottom py-3'>
				<div className='pe-3'>
					<label style={{margin:-5, padding:5}}>
						<CheckBtn
							onClick={() => props.updateCheckedObjects(objInfo.dobj)}
							title={checkBtnTitle}
							isChecked={props.isChecked}
							checkboxDisabled={props.isCartView ? false : !allowCartAdd}
							/>
					</label>
				</div>
				<div>
					<h4 className="fs-5">
						<a title="View metadata" href={getUrlWithEnvironmentPrefix(objInfo.dobj)}>{title}</a>
					</h4>
					<Description extendedInfo={extendedInfo} truncateStyle={truncateStyle} />
					<div className="extended-info" style={{ marginTop: 4 }}>
						<ExtendedInfoItem item={extendedInfo.theme} icon={extendedInfo.themeIcon} iconHeight={14} iconRightMargin={4} />
						<CollectionLinks dois={extendedInfo.dois} />
						{config.features.displayStationInExtendedInfo && extendedInfo.station &&
						<ExtendedInfoItem item={extendedInfo.station.trim()} icon={iconStation} iconHeight={16} />
						}
						{config.features.displayFileNameInExtendedInfo && objInfo.fileName &&
						<ExtendedInfoItem item={objInfo.fileName} icon={iconFile} iconHeight={16} title="File name" />
						}
						<ExtendedInfoItem item={samplingHeight} icon={iconArrows} iconHeight={15} title="Sampling height" />
						<ExtendedInfoItem item={objInfo.temporalResolution} icon={iconTime} iconHeight={16} title="Time resolution" />
						{extendedInfo.biblioInfo &&
						<ExtendedInfoItem item={extendedInfo.biblioInfo.temporalCoverageDisplay} icon={iconCalendar} iconHeight={12} iconRightMargin={2} title="Temporal coverage" />
						}
					</div>
				</div>
			</div>
		);
	}
}

function stationSpecificTitle(extendedInfo: ExtendedDobjInfo, dataLevel: number, specLabel: String): string {
	const location = extendedInfo.samplingPoint ?? extendedInfo.site ?? extendedInfo.station?.trim();

	const spec = (config.features.shortenDataTypeLabel && specLabel.includes(','))
		? specLabel.substring(0, specLabel.indexOf(','))
		: specLabel;

	const preposition = (config.envri === 'ICOS' && dataLevel > 2) ? "for" : "from";

	return `${spec} ${preposition} ${location}`
}

export const getMetadataHash = (dobj: string) => {
	const hashObj = {
		route: 'metadata',
		id: getLastSegmentInUrl(dobj)
	};

	return "#" + encodeURIComponent(JSON.stringify(hashObj));
};

const Description: React.FunctionComponent<{
	extendedInfo: Partial<ExtendedDobjInfo> | undefined,
	truncateStyle: CSSProperties
}> = ({ extendedInfo, truncateStyle}) => {
	if (!(extendedInfo && extendedInfo.description)) return null;

	return isSmallDevice()
		? <div style={truncateStyle} title={extendedInfo.description}>{extendedInfo.description}</div>
		: <LinkifyText text={extendedInfo.description} style={linesToShowStyle(5)} />;
};
interface ExtendedInfoItemProps {
	item?: string,
	icon?: string,
	iconHeight?: number,
	iconRightMargin?: number,
	title?: string
}
const ExtendedInfoItem: React.FunctionComponent<ExtendedInfoItemProps> = ({ item, icon, iconHeight = 18, iconRightMargin = 0, title = "" }) => {
	const imgStyle = {height: iconHeight, marginRight: iconRightMargin};

	return (item && icon
		? <span className="extended-info-item" >
			<img src={icon} title={title} style={imgStyle}/> <span style={{verticalAlign: 'middle'}}>{item}</span>
		</span>
		: null
	);
};

const CollectionLinks: React.FunctionComponent<{ dois?: UrlStr[] }> = ({ dois }) => {
	if (dois === undefined) return null;

	return (
		<>
			{dois.map((doi, i) =>
				<span key={i} className="extended-info-item">
					<CollectionBtn />
					<a href={config.doiBaseUrl + doi} style={{ marginLeft: 7 }} target="_blank">{doi}</a>
				</span>
			)}
		</>
	);
};
