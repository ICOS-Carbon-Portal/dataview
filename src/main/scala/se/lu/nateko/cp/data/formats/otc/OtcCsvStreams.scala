package se.lu.nateko.cp.data.formats.otc

import akka.NotUsed
import akka.stream.scaladsl.Flow
import akka.stream.scaladsl.Keep
import akka.stream.scaladsl.Sink
import se.lu.nateko.cp.data.api.CpDataParsingException
import se.lu.nateko.cp.data.formats.TimeSeriesStreams.*
import se.lu.nateko.cp.data.formats.*
import se.lu.nateko.cp.data.formats.csv.CsvParser
import se.lu.nateko.cp.data.services.upload.IngestionUploadTask.RowParser
import se.lu.nateko.cp.data.streams.geo.GeoFeaturePointSink
import se.lu.nateko.cp.data.streams.geo.Point
import se.lu.nateko.cp.meta.core.data.*

import java.time.*
import java.time.format.DateTimeFormatter
import scala.concurrent.ExecutionContext
import scala.concurrent.Future
import scala.util.Success
import scala.util.Try
import java.net.URI
import se.lu.nateko.cp.data.api.CpMetaResourcesVocab

object OtcCsvStreams {

	// TODO Read these from the ontology
	val GoodFlagValues = Set("2", "9")

	private val csvParser = CsvParser.default

	def socatTsvParser(nRows: Int, format: ColumnsMetaWithTsCol)(using ExecutionContext): RowParser = Flow[String]
		.dropWhile(line => !line.contains("*/"))
		.drop(1)
		.map(_.trim.split("\t", -1))
		.scan(TableRow.empty(nRows)) {
			(row, cells) =>
				if (row.header.columnNames.length == 0) {
					TableRow(
						TableRowHeader(format.timeStampColumn +: cells, nRows),
						format.timeStampColumn +: cells
					)
				} else {
					TableRow(row.header, makeSocatTimeStamp(cells(0)).toString +: cells)
				}
		}
		.drop(2)
		.alsoToMat(uploadCompletionSink(format.colsMeta))(Keep.right)

	def otcProductParser(nRows: Int, format: ColumnsMetaWithTsCol)(using ExecutionContext): RowParser = Flow[String]
		.scan(CsvParser.seed)((acc, line) => csvParser.parseLine(acc, line))
		.collect{
			case acc if acc.lastState == CsvParser.Init && acc.cells.length > 0 => acc.cells
		}
		.scan(TableRow.empty(nRows)) {
			(row, cells) =>
				if (row.header.columnNames.length == 0) {
					TableRow(
						TableRowHeader(format.timeStampColumn +: cells.tail, nRows), //first column is the ISO UTC timestamp
						cells
					)
				} else TableRow(row.header, cells)
		}
		.drop(2)
		.alsoToMat(uploadCompletionSink(format.colsMeta))(Keep.right)

	def uploadCompletionSink(columnsMeta: ColumnsMeta)(using ExecutionContext): Sink[TableRow, Future[IngestionMetadataExtract]] = {
		val tabularExtractSink = digestSink(getCompletionInfo(columnsMeta))

		val latLonColsOpt = for
			latCol <- columnsMeta.lookupSinglePlainColumn(CpMetaResourcesVocab.latitudeValType)
			lonCol <- columnsMeta.lookupSinglePlainColumn(CpMetaResourcesVocab.longitudeValType)
		yield (latCol, lonCol)

		latLonColsOpt match

			case None => Flow.apply[TableRow].toMat(tabularExtractSink)(Keep.right)

			case Some((latCol, lonCol)) => Flow.apply[TableRow]
				.alsoToMat(tabularExtractSink)(Keep.right)
				.toMat(coverageSink(latCol, lonCol)): (tsUplComplFut, coverageFut) =>
					for (
						tsUplCompl <- tsUplComplFut;
						coverage <- coverageFut
					) yield
						SpatialTimeSeriesExtract(tsUplCompl.tabular, coverage)
	}

	private def coverageSink(latCol: PlainColumn, lonCol: PlainColumn)(using ExecutionContext): Sink[TableRow, Future[GeoFeature]] =
		val parser = getLatLonParser(latCol, lonCol)

		Flow.apply[TableRow].filterNot(getBadGeoFlagTest(latCol, lonCol))
			.mapConcat(tableRow => parser(tableRow).toOption)
			.toMat(GeoFeaturePointSink.sink)(Keep.right)


	private def makeSocatTimeStamp(timestamp: String): Instant = {
		val timestampFormatter: DateTimeFormatter = DateTimeFormatter.ISO_LOCAL_DATE_TIME
		LocalDateTime.parse(timestamp, timestampFormatter).toInstant(ZoneOffset.UTC)
	}

	def getLatLonParser(latCol: PlainColumn, lonCol: PlainColumn): TableRow => Try[Point] = row =>
		val latPos = row.header.columnNames.indexOf(latCol.title)
		val lonPos = row.header.columnNames.indexOf(lonCol.title)

		if (lonPos < 0 || latPos < 0)
			parseFail(s"Expected both longitude and latitude columns to be present in row $row")
		else
			try
				val lon = row.cells(lonPos).toDouble
				val lat = row.cells(latPos).toDouble
				Success(Point(lon, lat))
			catch
				case err: Throwable =>
					parseFail(s"Problem parsing lat/lon values in row $row\nError message: ${err.getMessage}")

	def parseFail(msg: String) = scala.util.Failure(new CpDataParsingException(msg))

	private def getBadGeoFlagTest(latCol: PlainColumn, lonCol: PlainColumn): TableRow => Boolean =
		val flagColNames = Seq(latCol, lonCol).flatMap(_.flagColumnTitle)
		if flagColNames.isEmpty then row => false
		else row => flagColNames.exists: flagColName =>
			val pos = row.header.columnNames.indexOf(flagColName)
			if pos < 0 then false else !GoodFlagValues.contains(row.cells(pos))

}
