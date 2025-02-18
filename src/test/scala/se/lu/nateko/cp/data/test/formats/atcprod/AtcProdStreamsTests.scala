package se.lu.nateko.cp.data.test.formats.atcprod

import java.io.File

import scala.concurrent.Await
import scala.concurrent.duration.DurationInt

import org.scalatest.BeforeAndAfterAll
import org.scalatest.funsuite.AnyFunSuite

import akka.actor.ActorSystem
import akka.stream.Materializer
import akka.stream.scaladsl.*
import se.lu.nateko.cp.data.formats.*
import se.lu.nateko.cp.data.formats.ValueFormat.*
import se.lu.nateko.cp.data.formats.atcprod.AtcProdStreams.*
import se.lu.nateko.cp.data.formats.bintable.*
import java.net.URI

class AtcProdStreamsTests extends AnyFunSuite with BeforeAndAfterAll{

	private implicit val system: ActorSystem = ActorSystem("atccsvstreamstest")

	import system.dispatcher

	override def afterAll(): Unit = {
		Await.ready(system.terminate(), 3.seconds)
	}

	def outFile(fileName: String) = new File(getClass.getResource("/").getFile + fileName)

	val dummyURI = URI("https://meta.icos-cp.eu")

	val formats = ColumnsMetaWithTsCol(
		new ColumnsMeta(Seq(
			PlainColumn(Iso8601DateTime, "TIMESTAMP", isOptional = false, dummyURI, None),
			PlainColumn(FloatValue, "co2", isOptional = false, dummyURI, None),
			PlainColumn(FloatValue, "Stdev", isOptional = false, dummyURI, None)
		)),
		"TIMESTAMP"
	)

	private val rowsSource = StreamConverters
		.fromInputStream(() => getClass.getResourceAsStream("/ICOS_ATC_NRT_GAT_2018-04-12CO2.csv"))
		.via(TimeSeriesStreams.linesFromUtf8Binary)
		.via(atcProdParser(formats, None))

	val binTableSink = BinTableSink(outFile("/atcCsvBinTest.cpb"), overwrite = true)

	test("Parsing of an example ATC product time series data set"){

		val rowsFut = rowsSource.runWith(Sink.seq)
		val rows = Await.result(rowsFut, 3.second)

		assert(rows.size === 24)
		assert(rows(2).cells(0) === "2018-04-12T02:00:00Z") //stick-test
		assert(rows(2).cells(8) === "2018.27694064") //stick-test
	}

	test("Null value gets replaced by an empty string") {
		val rowsFut = rowsSource.runWith(Sink.seq)
		val rows = Await.result(rowsFut, 3.second)

		assert(rows(23).cells(9) === "")
	}

	test("Parsing of an example ATC product time series data set and streaming to BinTable"){
		val converter = new TimeSeriesToBinTableConverter(formats.colsMeta)
		val g = rowsSource
			.wireTapMat(Sink.head[TableRow])(_ zip _)
			.map(converter.parseRow)
			.toMat(binTableSink)(_ zip _)

		val ((readResult, firstRow), nRowsWritten) = Await.result(g.run(), 3.second)

		assert(readResult.count === 5007)
		assert(nRowsWritten === 24)
		assert(formats.colsMeta.plainCols.keySet.diff(firstRow.header.columnNames.toSet) === Set())

	}

}
