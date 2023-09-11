from dataclasses import dataclass

from sparql import Binding, as_int, as_uri, as_string
from envri import EnvriConfig
from metacore import UriResource, DatasetType


@dataclass
class DobjSpecLite(UriResource):
	data_level: int
	dataset_type: DatasetType
	theme: UriResource
	project: UriResource

def dobj_spec_lite_list(conf: EnvriConfig) -> str:
	return f"""
prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#>
prefix cpmeta: <http://meta.icos-cp.eu/ontologies/cpmeta/>
prefix xsd: <http://www.w3.org/2001/XMLSchema#>
select * where{{
	?spec cpmeta:hasDataLevel ?level ;
		cpmeta:hasAssociatedProject ?project ;
		cpmeta:hasSpecificDatasetType ?dsType .
	FILTER NOT EXISTS {{?project cpmeta:hasHideFromSearchPolicy "true"^^xsd:boolean}}
	FILTER(STRSTARTS(str(?spec), "{conf.meta_instance_prefix}"))
	?spec rdfs:label ?specLabel ; cpmeta:hasDataTheme ?theme .
	?theme rdfs:label ?themeLabel .
	?project rdfs:label ?projectLabel .
}}"""

def parse_dobj_spec_lite(row: Binding) -> DobjSpecLite:
	dsType: DatasetType
	match as_uri("dsType", row):
		case "http://meta.icos-cp.eu/ontologies/cpmeta/stationTimeSeriesDataset":
			dsType = "StationTimeSeries"
		case "http://meta.icos-cp.eu/ontologies/cpmeta/spatioTemporalDataset":
			dsType = "SpatioTemporal"
		case bad:
			raise ValueError(f"Unexpected URI representing a dataset type: {bad}")

	return DobjSpecLite(
		uri = as_uri("spec", row),
		label = as_string("specLabel", row),
		comments = [],
		data_level = as_int("level", row),
		project = UriResource(
			uri = as_uri("project", row),
			label = as_string("projectLabel", row),
			comments = []
		),
		theme = UriResource(
			uri = as_uri("theme", row),
			label = as_string("themeLabel", row),
			comments = []
		),
		dataset_type = dsType
	)
