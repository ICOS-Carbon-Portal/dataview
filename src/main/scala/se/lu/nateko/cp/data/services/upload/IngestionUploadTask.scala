package se.lu.nateko.cp.data.services.upload

import java.io.File

import scala.concurrent.ExecutionContext
import scala.concurrent.Future

import akka.Done
import akka.NotUsed
import akka.stream.scaladsl.Flow
import akka.stream.scaladsl.Keep
import akka.stream.scaladsl.Sink
import akka.util.ByteString
import se.lu.nateko.cp.data.api.CpDataException
import se.lu.nateko.cp.data.api.CpMetaVocab
import se.lu.nateko.cp.data.api.SparqlClient
import se.lu.nateko.cp.data.formats.{ ColumnFormats, ColumnValueFormats, TimeSeriesStreams, ValueFormat }
import se.lu.nateko.cp.data.formats.bintable.BinTableRow
import se.lu.nateko.cp.data.formats.bintable.BinTableSink
import se.lu.nateko.cp.data.formats.bintable.FileExtension
import se.lu.nateko.cp.data.streams.KeepFuture
import se.lu.nateko.cp.data.streams.ZipEntryFlow
import se.lu.nateko.cp.meta.core.data.EnvriConfig
import se.lu.nateko.cp.meta.core.crypto.Sha256Sum
import se.lu.nateko.cp.meta.core.data.{ DataObject, IngestionMetadataExtract }
import se.lu.nateko.cp.meta.core.data.UriResource
import se.lu.nateko.cp.meta.core.sparql.BoundLiteral
import se.lu.nateko.cp.meta.core.sparql.BoundUri

class IngestionUploadTask(
	dataObj: DataObject,
	originalFile: File,
	formats: ColumnValueFormats
)(implicit ctxt: ExecutionContext) extends UploadTask{

	private val file = new File(originalFile.getAbsolutePath + FileExtension)

	def sink: Sink[ByteString, Future[UploadTaskResult]] = {
		val format = dataObj.specification.format

		import se.lu.nateko.cp.data.api.CpMetaVocab.{ asciiAtcProdTimeSer, asciiEtcTimeSer, asciiOtcSocatTimeSer, asciiWdcggTimeSer }
		import se.lu.nateko.cp.data.api.SitesMetaVocab.{ dailySitesCsvTimeSer, simpleSitesCsvTimeSer }

		val icosColumnFormats = ColumnFormats(formats, "TIMESTAMP")

		val ingestionSink = format.uri match {

			case `asciiWdcggTimeSer` =>
				import se.lu.nateko.cp.data.formats.wdcgg.WdcggStreams._
				val converter = wdcggToBinTableConverter(icosColumnFormats)
				makeFormatSpecificSink(linesFromBinary, wdcggParser, converter)

			case `asciiAtcProdTimeSer` =>
				import se.lu.nateko.cp.data.formats.atcprod.AtcProdStreams._
				val converter = atcProdToBinTableConverter(icosColumnFormats)
				makeFormatSpecificSink(TimeSeriesStreams.linesFromBinary, atcProdParser, converter)

			case `asciiEtcTimeSer` | `asciiOtcSocatTimeSer` | `simpleSitesCsvTimeSer` | `dailySitesCsvTimeSer` =>

				dataObj.specificInfo.right.toOption.flatMap(_.nRows) match{

					case None =>
						failedSink(IncompleteMetadataFailure(dataObj.hash, "Missing nRows (number of rows)"))

					case Some(nRows) =>
						if(format.uri == asciiEtcTimeSer) {
							import se.lu.nateko.cp.data.formats.ecocsv.EcoCsvStreams._
							val converter = ecoCsvToBinTableConverter(nRows, icosColumnFormats)
							makeFormatSpecificSink(TimeSeriesStreams.linesFromBinary, ecoCsvParser, converter)
						} else if (format.uri == asciiOtcSocatTimeSer) {
							import se.lu.nateko.cp.data.formats.socat.SocatTsvStreams._
							val converter = socatTsvToBinTableConverter(nRows, icosColumnFormats)
							makeFormatSpecificSink(TimeSeriesStreams.linesFromBinary, socatTsvParser, converter)
						} else if (format.uri == simpleSitesCsvTimeSer) {
							import se.lu.nateko.cp.data.formats.simplesitescsv.SimpleSitesCsvStreams._
							val converter = simpleSitesCsvToBinTableConverter(nRows, ColumnFormats(formats, "UTC_TIMESTAMP"))
							makeFormatSpecificSink(TimeSeriesStreams.linesFromBinary, simpleSitesCsvParser, converter)
						} else {
							import se.lu.nateko.cp.data.formats.dailysitescsv.DailySitesCsvStreams._
							val converter = dailySitesCsvToBinTableConverter(formats)
							makeFormatSpecificSink(TimeSeriesStreams.linesFromBinary, dailySitesCsvParser(nRows), converter)
						}
				}

			case _ =>
				failedSink(NotImplementedFailure(s"Ingestion of format ${format.label} is not supported"))
		}

		val decoderFlow = makeEncodingSpecificFlow(dataObj.specification.encoding)
		decoderFlow.toMat(ingestionSink)(Keep.right)
	}

	private def failedSink[T](result: UploadTaskResult) = Sink.cancelled[T].mapMaterializedValue(_ => Future.successful(result))

	private def makeFormatSpecificSink[R](
		lineParser: Flow[ByteString, String, NotUsed],
		rowParser: Flow[String, R, Future[Done]],
		toBinTableConverter: Flow[R, BinTableRow, Future[IngestionMetadataExtract]]
	): Sink[ByteString, Future[UploadTaskResult]] = {

		lineParser
			.viaMat(rowParser)(Keep.right)
			.viaMat(toBinTableConverter)(KeepFuture.right)
			.toMat(BinTableSink(file, overwrite = true))(KeepFuture.left)
			.mapMaterializedValue(
				_.map(IngestionSuccess(_)).recover{
					case exc: Throwable => IngestionFailure(exc)
				}
			)
	}

	private def makeEncodingSpecificFlow(encoding: UriResource): Flow[ByteString, ByteString, NotUsed] = {
		import se.lu.nateko.cp.data.api.CpMetaVocab.{ plainFile, zipEncoding }
		encoding.uri match{
			case `plainFile` => Flow.apply[ByteString]
			case `zipEncoding` => ZipEntryFlow.singleEntryUnzip
			case encUri => throw new CpDataException("Unsupported encoding " + encoding.label.getOrElse(encUri.toString))
		}
	}

	def onComplete(ownResult: UploadTaskResult, otherTaskResults: Seq[UploadTaskResult]) = {
		val relevantOtherErrors = otherTaskResults.collect{
			case failure: HashsumCheckFailure => failure
			case failure: UnexpectedTaskFailure => failure
		}

		UploadTask.revertOnAnyFailure(ownResult, relevantOtherErrors, () => Future{
			if(file.exists) file.delete()
			Done
		})
	}
}

object IngestionUploadTask{

	def apply(dataObj: DataObject, originalFile: File, sparql: SparqlClient)(implicit envri: EnvriConfig): Future[IngestionUploadTask] = {
		import sparql.materializer.executionContext
		getColumnFormats(dataObj.hash, sparql).map{formats =>
			new IngestionUploadTask(dataObj, originalFile, formats)
		}
	}

	def getColumnFormats(dataObjHash: Sha256Sum, sparql: SparqlClient)(implicit envri: EnvriConfig): Future[ColumnValueFormats] = {
		import sparql.materializer.executionContext
		val dataObjUri = CpMetaVocab.getDataObject(dataObjHash)

		val query = s"""prefix cpmeta: <http://meta.icos-cp.eu/ontologies/cpmeta/>
		|select ?colName ?valFormat where{
		|	<$dataObjUri> cpmeta:hasObjectSpec ?spec .
		|	?spec cpmeta:containsDataset ?dataSet .
		|	?dataSet cpmeta:hasColumn ?column .
		|	?column cpmeta:hasColumnTitle ?colName .
		|	?column cpmeta:hasValueFormat ?valFormat .
		|}""".stripMargin

		sparql.select(query).map{ssr =>
			ssr.results.bindings.map{binding =>
				val colName = binding.get("colName").collect{case BoundLiteral(col, _) => col}
				val valFormat = binding.get("valFormat").collect{
					case BoundUri(format) => ValueFormat.fromUri(format)
				}
				colName.zip(valFormat)
			}.flatten.toMap
		}
	}
}

