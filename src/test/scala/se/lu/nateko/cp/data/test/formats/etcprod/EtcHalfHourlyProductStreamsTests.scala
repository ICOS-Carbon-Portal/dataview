package se.lu.nateko.cp.data.test.formats.etcprod

import java.io.File

import akka.actor.ActorSystem
import akka.stream.Materializer
import akka.stream.scaladsl.{Sink, StreamConverters}
import org.scalatest.BeforeAndAfterAll
import org.scalatest.funsuite.AnyFunSuite
import se.lu.nateko.cp.data.formats.*
import se.lu.nateko.cp.data.formats.ValueFormat.*
import se.lu.nateko.cp.data.formats.bintable.BinTableSink
import se.lu.nateko.cp.data.formats.etcprod.EtcHalfHourlyProductStreams

import scala.concurrent.Await
import scala.concurrent.duration.DurationInt
import se.lu.nateko.cp.data.formats.bintable.BinTableRow
import java.net.URI

class EtcHalfHourlyProductStreamsTests extends AnyFunSuite with BeforeAndAfterAll {

	private implicit val system: ActorSystem = ActorSystem("etchalfhourlyproductstreamstest")
	import system.dispatcher

	override def afterAll(): Unit = {
		Await.ready(system.terminate(), 3.seconds)
	}

	private val nRows = 29
	private val binTableSink = BinTableSink(
		new File(getClass.getResource("/").getFile + "/etcProductCsvBinTest.cpb"),
		overwrite = true
	)

	val dummyURI = URI("https://meta.icos-cp.eu")

	private val formats = ColumnsMetaWithTsCol(
		new ColumnsMeta(Seq(
			PlainColumn(Iso8601DateTime, "TIMESTAMP", isOptional = false, dummyURI, None),
			PlainColumn(FloatValue, "TA_ERA", isOptional = false, dummyURI, None),
			PlainColumn(FloatValue, "TA_F", isOptional = false, dummyURI, None)
		)),
		"TIMESTAMP"
	)

	private val rowsSource = StreamConverters
		.fromInputStream(() => getClass.getResourceAsStream("/fluxnet_hh.csv"))
		.via(TimeSeriesStreams.linesFromUtf8Binary)
		.via(new EtcHalfHourlyProductStreams(2).standardCsvParser(nRows, formats))

	test("Parsing a daily ETC fluxnet product time series example") {
		val rowsFut = rowsSource.runWith(Sink.seq)
		val rows = Await.result(rowsFut, 1.second)

		assert(rows.size === nRows)
	}

	test("Timestamp column is injected into the table") {
		val rowFut = rowsSource.runWith(Sink.head[TableRow])
		val row = Await.result(rowFut, 1.second)

		assert(row.header.columnNames.contains(formats.timeStampColumn))
		assert(row.cells(0) === "2017-12-31T22:30:00Z")
	}

	test("Parsing a half-hourly ETC product example and streaming to bintable") {
		val converter = new TimeSeriesToBinTableConverter(formats.colsMeta)
		val graph = rowsSource
			.map(converter.parseRow)
			.wireTapMat(Sink.head[BinTableRow])(_ zip _)
			.toMat(binTableSink)(_ zip _)

		val ((readResult, firstRow), nRowsWritten) = Await.result(graph.run(), 1.second)

		assert(readResult.count === 33300)
		assert(firstRow.schema.size === nRows)
		assert(nRowsWritten === nRows)
		assert(firstRow.cells(0) === -9.154e-1f)
		assert(firstRow.cells(1) === -3.154f)
	}

}
