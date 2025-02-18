package se.lu.nateko.cp.data.test.formats.netcdf.viewing

import akka.actor.ActorSystem
import akka.stream.scaladsl.Sink
import akka.stream.scaladsl.Source
import org.scalatest.funspec.AsyncFunSpec
import se.lu.nateko.cp.data.formats.ColumnsMeta
import se.lu.nateko.cp.data.formats.PlainColumn
import se.lu.nateko.cp.data.formats.TimeSeriesToBinTableConverter
import se.lu.nateko.cp.data.formats.ValueFormat.FloatValue
import se.lu.nateko.cp.data.formats.ValueFormat.Iso8601DateTime
import se.lu.nateko.cp.data.formats.ValueFormat.Utf16CharValue
import se.lu.nateko.cp.data.formats.bintable.BinTableRowReader
import se.lu.nateko.cp.data.formats.bintable.BinTableSink
import se.lu.nateko.cp.data.formats.bintable.CpbHandler
import se.lu.nateko.cp.data.formats.netcdf.ObspackNcToBinTable
import se.lu.nateko.cp.data.utils.io.withSuffix

import java.nio.file.Files
import java.nio.file.Path
import scala.concurrent.ExecutionContextExecutor
import scala.concurrent.Future
import java.net.URI

class ObspackNcToBinTableTest extends AsyncFunSpec {

	private given system: ActorSystem = ActorSystem("ObspackNcToBinTableTest")
	given dispatcher: ExecutionContextExecutor = system.dispatcher

	type Rows = IndexedSeq[IndexedSeq[String]]

	def readNCFile(path: Path, columnsMeta: ColumnsMeta, debug: String): Future[Rows] =
		import ObspackNcToBinTable.TypedVar

		val parser = ObspackNcToBinTable(path, columnsMeta).get
		val tmpFile = CpbHandler.cpbWriteStagingFile(path)
		
		var resFut = Source(parser.readRows()).runWith(BinTableSink(tmpFile.toFile, true))
			.flatMap{_ =>

				val nRows = parser.schema.size.toInt
				val readSchema = TimeSeriesToBinTableConverter.getReadingSchema(None, None, nRows, columnsMeta)
				val rowsSrc = new BinTableRowReader(tmpFile.toFile, readSchema.binSchema)
					.rows(readSchema.fetchIndices, 0L, nRows)
					.map{row =>
						row.indices.map{i =>
							readSchema.serializers(i)(row(i))
						}
					}
				
				rowsSrc.runWith(Sink.collection)
			}.andThen{
				case _ =>
					parser.close()
					Files.deleteIfExists(tmpFile)
			}

		resFut

	def test[T <: String | Float](description: String, data: Future[Rows], getActualVal: Rows => T, expectedVal: T) =
		it(description) {
			data map { rows => assert(getActualVal(rows) == expectedVal) }
		}

	val ValueIndex = 0
	val TimestampIndex = 1
	val LatIndex = 2
	val LonIndex = 3
	val dummyURI = URI("https://meta.icos-cp.eu")

	describe("Read values from first file") {

		val columnsMeta = new ColumnsMeta(Seq(
			PlainColumn(FloatValue, "value", false, dummyURI, None),
			PlainColumn(Iso8601DateTime, "time", false, dummyURI, None),
			PlainColumn(FloatValue, "latitude", false, dummyURI, None),
			PlainColumn(FloatValue, "longitude", false, dummyURI, None)
		))

		val path = Path.of(getClass.getResource("/co2_con_aircraft-insitu_42_allvalid_small.nc").getPath)
		val data = readNCFile(path, columnsMeta, s" path: $path")

		it("Reads correct number of rows") {
			data map { rows => assert(rows.length == 318) }
		}

		test("First value", data, _(0)(ValueIndex).toFloat, "0.00038232992".toFloat)
		test("Last value", data, _(317)(ValueIndex).toFloat, "0.00038731386".toFloat)

		test("First timestamp", data, _(0)(TimestampIndex), "2005-11-05T02:23:04Z")
		test("Last timestamp", data, _(317)(TimestampIndex), "2005-11-05T21:07:34Z")

		test("First latitude", data, _(0)(LatIndex), "35.925")
		test("Last latitude", data, _(317)(LatIndex), "35.618")

		test("First longitude", data, _(0)(LonIndex), "140.3")
		test("Last longitude", data, _(317)(LonIndex), "140.47")

	}

	describe("Read values from second file") {

		val columnsMeta = new ColumnsMeta(Seq(
			PlainColumn(FloatValue, "value", false, dummyURI, None),
			PlainColumn(Iso8601DateTime, "time", false, dummyURI, None)
		))

		val path = Path.of(getClass.getResource("/co2_ssl_tower-insitu_23_allvalid-12magl_small.nc").getPath)
		val data = readNCFile(path, columnsMeta, s" path: $path")


		it("Reads correct number of rows") {
			data map { rows => assert(rows.length == 94) }
		}

		test("First value", data, _(0)(ValueIndex).toFloat, "0.000384392".toFloat)
		test("Last value", data, _(93)(ValueIndex).toFloat, "0.00038229".toFloat)

		test("First timestamp", data, _(0)(TimestampIndex), "2005-01-01T03:00:00Z")
		test("Last timestamp", data, _(93)(TimestampIndex), "2005-01-05T00:00:00Z")

	}

	describe("Read qc flag from third file") {
		val columnsMeta = new ColumnsMeta(Seq(
			PlainColumn(Iso8601DateTime, "time", false, dummyURI, None),
			PlainColumn(Utf16CharValue, "qc_flag", false, dummyURI, None)
		))

		val path = Path.of(getClass.getResource("/co2_htm_tower-insitu_424_allvalid-150magl_small.nc").getPath)
		val data = readNCFile(path, columnsMeta, s" path: $path")

		it("Reads correct number of rows") {
			data map { rows => assert(rows.length == 100) }
		}

		it("QC Flag") {
			data map { rows =>
				assert(rows(0)(1) == "O")
				assert(rows(99)(1) == "O")
			}
		}
	}
}
