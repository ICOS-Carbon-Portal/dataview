package se.lu.nateko.cp.data.test.formats.otc

import java.io.File

import akka.actor.ActorSystem
import akka.stream.Materializer
import akka.stream.scaladsl.*
import org.scalatest.BeforeAndAfterAll
import org.scalatest.funsuite.AnyFunSuite
import se.lu.nateko.cp.data.formats.*
import se.lu.nateko.cp.data.formats.ValueFormat.*
import se.lu.nateko.cp.data.formats.bintable.*
import se.lu.nateko.cp.data.formats.otc.OtcCsvStreams.*
import se.lu.nateko.cp.data.streams.KeepFuture

import scala.concurrent.Await
import scala.concurrent.duration.DurationInt
import java.net.URI
import se.lu.nateko.cp.meta.core.data.SpatialTimeSeriesExtract
import se.lu.nateko.cp.meta.core.data.IngestionMetadataExtract
import se.lu.nateko.cp.meta.core.data.GeoTrack
import se.lu.nateko.cp.meta.core.data.Position
import se.lu.nateko.cp.data.api.CpMetaResourcesVocab

class OtcCsvStreamsTests extends AnyFunSuite with BeforeAndAfterAll{

	private implicit val system: ActorSystem = ActorSystem("otccsvstreamstest")
	import system.dispatcher

	override def afterAll(): Unit = {
		Await.ready(system.terminate(), 3.seconds)
	}

	def outFile(fileName: String) = new File(getClass.getResource("/").getFile + fileName)
	val nRows = 526
	val dummyURI = URI("https://meta.icos-cp.eu")

	val formats = ColumnsMetaWithTsCol(
		new ColumnsMeta(Seq(
			PlainColumn(Iso8601DateTime, "TIMESTAMP", isOptional = false, dummyURI, None),
			PlainColumn(DoubleValue, "Latitude", isOptional = false, CpMetaResourcesVocab.latitudeValType, Some("Latitude QC Flag")),
			PlainColumn(DoubleValue, "Longitude", isOptional = false, CpMetaResourcesVocab.longitudeValType, Some("Longitude QC Flag")),
			PlainColumn(FloatValue, "Depth water [m]", isOptional = false, dummyURI, None),
			PlainColumn(FloatValue, "Temp [°C]", isOptional = false, dummyURI, None),
			PlainColumn(FloatValue, "fCO2water_SST_wet [µatm] (Recomputed after SOCAT (Pfeil...)", isOptional = false, dummyURI, None),
		)),
		"TIMESTAMP"
	)

	private val rowsSource = StreamConverters
		.fromInputStream(() => getClass.getResourceAsStream("/26NA20050107_CO2_underway_SOCATv3.tab"))
		.via(TimeSeriesStreams.linesFromUtf8Binary)
		.viaMat(socatTsvParser(nRows, formats))(KeepFuture.left)

	val binTableSink = BinTableSink(outFile("/socatTsvBinTest.cpb"), overwrite = true)

	test("Parsing of an example Socat time series data set"){

		val rowsFut = rowsSource.toMat(Sink.seq)(KeepFuture.right).run()
		val rows = Await.result(rowsFut, 3.second)

		assert(rows.size === nRows)
		assert(rows(2).cells(3) === "-42.94501") //stick-test
	}

	test("Parsing of an example Socat time series data set and streaming to BinTable"){
		val converter = new TimeSeriesToBinTableConverter(formats.colsMeta)
		val g = rowsSource
			.wireTapMat(Sink.head[TableRow])(_ zip _)
			.map(converter.parseRow)
			.toMat(binTableSink)(_ zip _)

		val ((readResult, firstRow), nRowsWritten) = Await.result(g.run(), 3.second)

		assert(readResult.count === 72067)
		assert(nRowsWritten === nRows)
		assert(formats.colsMeta.plainCols.keySet.diff(firstRow.header.columnNames.toSet) === Set())
	}

	test("Parser preserves the amount of rows"){
		val converter = new TimeSeriesToBinTableConverter(formats.colsMeta)
		val countFut = rowsSource
			.map(converter.parseRow)
			.toMat(Sink.fold(0)((count, _) => count + 1))(KeepFuture.right)
		val count = Await.result(countFut.run(), 3.second)
		assert(count === nRows)
	}

	val otcRows = 8
	val otcFormats = ColumnsMetaWithTsCol(
		new ColumnsMeta(Seq(
			PlainColumn(Iso8601DateTime, "TIMESTAMP", isOptional = false, dummyURI, None),
			PlainColumn(DoubleValue, "Latitude", isOptional = false, CpMetaResourcesVocab.latitudeValType, Some("Latitude QC Flag")),
			PlainColumn(DoubleValue, "Longitude", isOptional = false, CpMetaResourcesVocab.longitudeValType, Some("Longitude QC Flag")),
			PlainColumn(FloatValue, "Depth [m]", isOptional = false, dummyURI, None),
		)),
		"TIMESTAMP"
	)

	private def getOtcRowsSource(filePath: String) =
		StreamConverters
			.fromInputStream(() => getClass.getResourceAsStream(filePath))
			.via(TimeSeriesStreams.linesFromUtf8Binary)
			.viaMat(otcProductParser(otcRows, otcFormats))(KeepFuture.right)

	// See test files otc_quality_flags.csv and otc_no_quality_flags.csv
	val pointsWithBadQuality = Seq(
		Position(37.2897, -51.1605, None, None, None),
		Position(37.2898, -51.1606, None, None, None),
		Position(37.2899, -51.1607, None, None, None))

	test("Parsing of an OTC time series data set with latitute/longitude bad quality flags"){
		val otcRowsSource = getOtcRowsSource("/otc_quality_flags.csv")

		val futureExtract = otcRowsSource.toMat(Sink.seq)(KeepFuture.left).run()
		val extract = Await.result(futureExtract, 3.second)

		val geoTrack = getGeoTrack(extract).getOrElse(fail("GeoTrack could not be extracted"))
		val points = geoTrack.points
		assert(points.size === otcRows - pointsWithBadQuality.size)
		assert(!points.containsSlice(pointsWithBadQuality))

		val rowsFut = otcRowsSource.toMat(Sink.seq)(KeepFuture.right).run()
		val rows = Await.result(rowsFut, 3.second)
		assert(rows.size === otcRows)
	}

	test("Parsing of an OTC time series data set without latitute/longitude bad quality flags"){
		val otcRowsSource = getOtcRowsSource("/otc_no_quality_flags.csv")

		val futureExtract = otcRowsSource.toMat(Sink.seq)(KeepFuture.left).run()
		val extract = Await.result(futureExtract, 3.second)

		val geoTrack = getGeoTrack(extract).getOrElse(fail("GeoTrack could not be extracted"))
		val points = geoTrack.points
		assert(points.size === otcRows)
		assert(points.containsSlice(pointsWithBadQuality))

		val rowsFut = otcRowsSource.toMat(Sink.seq)(KeepFuture.right).run()
		val rows = Await.result(rowsFut, 3.second)

		assert(rows.size === otcRows)
	}

	private def getGeoTrack(extract: IngestionMetadataExtract) =
		extract match
			case SpatialTimeSeriesExtract(ingestionExtract, spatial) =>
				spatial match
					case geoTrack: GeoTrack => Some(geoTrack)
					case _ => None
			case _ => None

}
