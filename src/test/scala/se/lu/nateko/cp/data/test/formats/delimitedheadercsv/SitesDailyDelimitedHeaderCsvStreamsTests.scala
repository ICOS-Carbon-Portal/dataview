package se.lu.nateko.cp.data.test.formats.delimitedheadercsv

import java.io.File

import akka.actor.ActorSystem
import akka.stream.Materializer
import akka.stream.scaladsl.{Sink, StreamConverters}
import org.scalatest.BeforeAndAfterAll
import org.scalatest.funsuite.AnyFunSuite
import se.lu.nateko.cp.data.formats._
import se.lu.nateko.cp.data.formats.bintable.BinTableSink
import se.lu.nateko.cp.data.formats.delimitedheadercsv.SitesDelimitedHeaderCsvStreams

import scala.concurrent.Await
import scala.concurrent.duration.DurationInt

class SitesDailyDelimitedHeaderCsvStreamsTests extends AnyFunSuite with BeforeAndAfterAll {

	private implicit val system: ActorSystem = ActorSystem("sitesdailydelimitedheadercsvstreamstest")

	import system.dispatcher

	override def afterAll(): Unit = {
		Await.ready(system.terminate(), 3.seconds)
	}

	private val nRows = 6
	private val binTableSink = BinTableSink(
		new File(getClass.getResource("/").getFile + "/sites_daily_delimiter.cpb"),
		overwrite = true
	)

	private val formats = ColumnsMetaWithTsCol(
		new ColumnsMeta(Seq(
			PlainColumn(Iso8601Date, "TIMESTAMP", isOptional = false),
			PlainColumn(FloatValue, "SR_IN", isOptional = false),
			PlainColumn(FloatValue, "PPFD", isOptional = false),
			PlainColumn(FloatValue, "TA", isOptional = true)
		)),
		"TEMP_UTC_TIMESTAMP_FOR_EXTRACTING_DATES"
	)

	private val rowsSource = StreamConverters
		.fromInputStream(() => getClass.getResourceAsStream("/sites_daily_delimiter.csv"))
		.via(TimeSeriesStreams.linesFromUtf8Binary)
		.via(SitesDelimitedHeaderCsvStreams.standardCsvParser(nRows, formats))

	test("Parsing a SITES time series with delimited header example") {
		val rowsFut = rowsSource.runWith(Sink.seq)
		val rows = Await.result(rowsFut, 1.second)

		assert(rows.size === nRows)
	}

	test("Timestamp column is injected into the table") {
		val rowFut = rowsSource
  		.runWith(Sink.head[TableRow])
		val row = Await.result(rowFut, 1.second)

		assert(row.header.columnNames.contains(formats.timeStampColumn))
		assert(row.cells.contains("2014-12-31T23:00:00Z"))
	}

	test("Parsing a SITES time series with delimited header example and streaming to bintable") {
		val converter = new TimeSeriesToBinTableConverter(formats.colsMeta)
		val graph = rowsSource
			.wireTapMat(Sink.head[TableRow])(_ zip _)
  		.map(converter.parseRow)
			.toMat(binTableSink)(_ zip _)

		val ((readResult, firstRow), nRowsWritten) = Await.result(graph.run(), 1.second)

		assert(readResult.count === 1135)
		assert(firstRow.header.nRows === nRows)
		assert(nRowsWritten === nRows)
		assert(formats.colsMeta.plainCols.keySet.diff(firstRow.header.columnNames.toSet) ===
			Set())
		assert(formats.colsMeta.findMissingColumns(firstRow.header.columnNames.toSeq).toSet === Set())
	}

}
