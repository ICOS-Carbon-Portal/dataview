package se.lu.nateko.cp.data.formats.ecocsv

import java.time._
import java.util.Locale

import akka.stream.scaladsl.{Flow, Keep, Sink}
import se.lu.nateko.cp.data.formats.TimeSeriesStreams._
import se.lu.nateko.cp.data.formats._
import se.lu.nateko.cp.meta.core.data.{IngestionMetadataExtract, TimeInterval, TimeSeriesUploadCompletion}

import scala.concurrent.{ExecutionContext, Future}

object EcoCsvStreams {

	protected val valueFormatParser = new ValueFormatParser(Locale.UK)

	def ecoCsvParser(nRows: Int, format: ColumnsMetaWithTsCol)(implicit ctxt: ExecutionContext)
	: Flow[String, ProperTableRow, Future[IngestionMetadataExtract]] = {
		val parser = new EcoCsvParser(nRows)

		Flow.apply[String]
			.scan(parser.seed)(parser.parseLine(format.colsMeta))
			.exposeParsingError
			.keepGoodRows
			.map(acc =>
				ProperTableRow(
					ProperTableRowHeader(format.timeStampColumn +: acc.columnNames, acc.nRows),
					makeTimeStamp(acc.cells(0), acc.cells(1), acc.offsetFromUtc).toString +: replaceNullValues(acc.cells, acc.formats)
				)
			)
  		.alsoToMat(ecoCsvUploadCompletionSink)(Keep.right)
	}

	def ecoCsvUploadCompletionSink(implicit ctxt: ExecutionContext): Sink[ProperTableRow, Future[TimeSeriesUploadCompletion]] = {
		Flow.apply[ProperTableRow]
			.wireTapMat(Sink.head)(Keep.right)
			.toMat(Sink.last)(getCompletionInfo)
	}

	private def getCompletionInfo(
		firstRowFut: Future[ProperTableRow],
		lastRowFut: Future[ProperTableRow]
	)(implicit ctxt: ExecutionContext): Future[TimeSeriesUploadCompletion] =
		for (
			firstRow <- firstRowFut;
			lastRow <- lastRowFut
		) yield {
			val start = Instant.parse(firstRow.cells(0))
			val stop = Instant.parse(lastRow.cells(0))
			TimeSeriesUploadCompletion(TimeInterval(start, stop), None)
		}

	private def makeTimeStamp(localDate: String, localTime: String, offsetFromUtc: Int): Instant = {
		val date = valueFormatParser.parse(localDate, EtcDate).asInstanceOf[Int]
		val time = valueFormatParser.parse(localTime, Iso8601TimeOfDay).asInstanceOf[Int]
		val locDate = LocalDate.ofEpochDay(date.toLong)

		val dt =
			if(time >= 86400){
				val locTime = LocalTime.ofSecondOfDay((time - 86400).toLong)
				LocalDateTime.of(locDate, locTime).plusHours((24 - offsetFromUtc).toLong)
			} else {
				val locTime = LocalTime.ofSecondOfDay(time.toLong)
				LocalDateTime.of(locDate, locTime).minusHours(offsetFromUtc.toLong)
			}
		dt.toInstant(ZoneOffset.UTC)
	}

	private def replaceNullValues(cells: Array[String], formats: Array[Option[ValueFormat]]): Array[String] = {
		import EcoCsvParser._

		cells.zip(formats).map {
			case (cell, None) => cell
			case (cell, Some(valueFormat)) => if (isNull(cell, valueFormat)) "" else cell
		}
	}

}
