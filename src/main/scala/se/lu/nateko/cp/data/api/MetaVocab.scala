package se.lu.nateko.cp.data.api

import java.net.URI

import se.lu.nateko.cp.meta.core.data.EnvriConfig
import se.lu.nateko.cp.meta.core.crypto.Sha256Sum

abstract class MetaVocab(baseUri: URI) {

	def getRelative(local: String): URI =
		new URI(baseUri.getScheme, baseUri.getAuthority, baseUri.getPath + local, null, null)

}

object CpMetaVocab extends MetaVocab(new URI("http://meta.icos-cp.eu/ontologies/cpmeta/")){

	object ObjectFormats{
		val asciiEtcTimeSer = getRelative("asciiEtcTimeSer")
		val asciiAtcProdTimeSer = getRelative("asciiAtcProductTimeSer")
		val asciiAtcFlaskTimeSer = getRelative("asciiAtcFlaskTimeSer")
		val asciiEtcHalfHourlyProdTimeSer = getRelative("asciiEtcHalfHourlyProductTimeSer")
		val asciiOtcSocatTimeSer = getRelative("asciiOtcSocatTimeSer")
		val asciiOtcProductCsv = getRelative("asciiOtcProductCsv")
		val asciiWdcggTimeSer = getRelative("asciiWdcggTimeSer")
		val netCdfSpatial = getRelative("netcdf")
		val netCdfTimeSer = getRelative("netcdfTimeSeries")
		val csvWithIso8601tsFirstCol = getRelative("csvWithIso8601tsFirstCol")
		val etcRawTimeSerMultiZip = getRelative("etcRawTimeSerMultiZip")
		val multiImageZip = getRelative("multiImageZip")
		val arbitraryZip = getRelative("zipArchive")
		val excel = getRelative("excel")

		def isNonIngestedZip(objFormat: URI): Boolean = objFormat == arbitraryZip || objFormat == excel
		def isNetCdf(objFormat: URI): Boolean = objFormat == netCdfSpatial || objFormat == netCdfTimeSer
	}

	val float32 = getRelative("float32")
	val float64 = getRelative("float64")
	val int32 = getRelative("int32")
	val bmpChar = getRelative("bmpChar")
	val string = getRelative("string")
	val iso8601month = getRelative("iso8601month")
	val iso8601date = getRelative("iso8601date")
	val etcDate = getRelative("etcDate")
	val iso8601dateTime = getRelative("iso8601dateTime")
	val iso8601timeOfDay = getRelative("iso8601timeOfDay")
	val isoLikeLocalDateTime = getRelative("isoLikeLocalDateTime")
	val etcLocalDateTime = getRelative("etcLocalDateTime")
	val boolean = getRelative("boolean")

	val zipEncoding = getRelative("zipEncoding")
	val plainFile = getRelative("plainFileEncoding")
	val ccby4 = getRelative("icosLicence")
}

object CpMetaResourcesVocab extends MetaVocab(new URI("http://meta.icos-cp.eu/resources/cpmeta/")) {
	val longitudeValType = getRelative("longitude")
	val latitudeValType = getRelative("latitude")
}

object SitesMetaVocab extends MetaVocab(new URI("https://meta.fieldsites.se/ontologies/sites/")) {

	val sitesDelimitedHeaderCsvTimeSer = getRelative("delimitedHeaderCsv")
	val ccby4 = getRelative("sitesLicence")
}

object CcMetaVocab extends MetaVocab(new URI("https://creativecommons.org/")){
	val cc0 = getRelative("publicdomain/zero/1.0/")
}
