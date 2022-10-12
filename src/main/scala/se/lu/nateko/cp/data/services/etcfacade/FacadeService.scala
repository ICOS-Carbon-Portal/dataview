package se.lu.nateko.cp.data.services.etcfacade

import java.io.File
import java.nio.charset.StandardCharsets
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.Paths
import java.nio.file.StandardCopyOption.REPLACE_EXISTING
import java.nio.file.StandardOpenOption
import java.time.Duration
import java.time.Instant
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.LocalTime
import java.time.ZoneOffset

import scala.concurrent.ExecutionContext
import scala.concurrent.Future
import scala.util.Failure
import scala.util.Success
import scala.util.Try

import akka.Done
import akka.NotUsed
import akka.stream.Materializer
import akka.stream.scaladsl.FileIO
import akka.stream.scaladsl.Flow
import akka.stream.scaladsl.Keep
import akka.stream.scaladsl.Sink
import akka.stream.scaladsl.Source
import akka.util.ByteString
import se.lu.nateko.cp.data.EtcFacadeConfig
import se.lu.nateko.cp.data.api.ChecksumError
import se.lu.nateko.cp.data.api.CpDataException
import se.lu.nateko.cp.data.api.Utils.iterateChildren
import se.lu.nateko.cp.data.formats.TimeSeriesStreams
import se.lu.nateko.cp.data.formats.zip
import se.lu.nateko.cp.data.services.upload.UploadResult
import se.lu.nateko.cp.data.services.upload.UploadService
import se.lu.nateko.cp.data.streams.DigestFlow
import se.lu.nateko.cp.data.utils.Akka.done
import se.lu.nateko.cp.meta.core.crypto.Md5Sum
import se.lu.nateko.cp.meta.core.crypto.Sha256Sum
import se.lu.nateko.cp.meta.core.etcupload.DataType
import se.lu.nateko.cp.meta.core.etcupload.EtcUploadMetadata
import se.lu.nateko.cp.meta.core.etcupload.StationId
import se.lu.nateko.cp.data.streams.ZipEntryFlow
import se.lu.nateko.cp.data.streams.ZipEntrySource

//TODO Consider write-locking per filename and "debouncing" EC archive upload for a few minutes upon completion of the full daily package:
//	it's possible more files are coming right after the package completion. In this case, we don't want to initiate the upload immediately,
//	and we want to avoid two uploads happening in parallel, too (they will not deprecate each other)

/**
 * Encodes the behaviour and logic of the ETC logger data upload facade.
 * Main features:
 * 	- integrity control with MD5 checksums
 * 	- staging area for files uploaded from the loggers
 * 	- upload to CP, if the ETC metadata for the filename is available on the meta service
 * 	- packaging EC half-hourly files into daily packages (zip archives)
 * 	- version handling in the case of re-uploads of files with the same filename
 * 	- automatic upload retries for all the files in staging
 *
 * EC file packaging and submission is done in the following way.
 * 	1) If upon upload of a half-hourly file a certain daily package becomes complete (48 files for a particular station, logger, and file number),
 * and if no previous uploads of this daily package were recently performed (during last {@code FacadeService.OldFileMaxAge}),
 * then the package is uploaded and the half-hourly files are moved into a subfolder called {@code uploaded}.
 * 	2) At {@code FacadeService.ForceEcUploadTime} time of day, all previous-day half-hourly EC files in staging are packaged, uploaded,
 * and moved into {@code uploaded} subfolder, replacing any previously-uploaded files with the same names there, if any.
 * 	3) Subsequent forced uploads of EC files are only performed if there are "fresh" files, but the files in {@code uploaded}
 * are included, and versioning is used, so that the latest uploaded file is the most complete and up to date.
 * 	4) After the daily forced EC upload, old files (older than {@code FacadeService.OldFileMaxAge}) are purged from staging.
 */
class FacadeService(val config: EtcFacadeConfig, upload: UploadService)(implicit mat: Materializer) {
	import FacadeService._
	import mat.executionContext

	private val metaClient = upload.meta
	private val log = upload.log

	Files.createDirectories(Paths.get(config.folder))

	private[this] val retries = new RetryLogic(this, log).schedule()
	sys.addShutdownHook(retries.cancel())

	def getFilePath(file: EtcFilename) = getStationFolder(file.station).resolve(file.toString)
	def getFileUploadedPath(file: EtcFilename) = getStationUploadedFolder(file.station).resolve(file.toString)

	def getStationFolder(station: StationId) = Paths.get(config.folder, station.id)
	def getStationUploadedFolder(station: StationId) = getStationFolder(station).resolve("uploaded")

	def getObjectSource(station: StationId, hash: Sha256Sum): Path =
		getStationFolder(station).resolve(hash.id)

	def getFileSink(fn: EtcFilename, md5: Md5Sum): Sink[ByteString, Future[Done]] = {
		val tmpPath = Files.createTempFile(fn.toString + ".", "")
		val targetFile = getFilePath(fn)

		def transactUpload(): Done = {
			val uploadedPath = getFileUploadedPath(fn)
			Files.createDirectories(uploadedPath.getParent)
			Files.deleteIfExists(uploadedPath)
			Files.move(tmpPath, targetFile, REPLACE_EXISTING)
			Done
		}

		val preprocessing: Flow[ByteString, ByteString, NotUsed] = fn.dataType match{
			case DataType.SAHEAT =>
				TimeSeriesStreams.linesFromUtf8Binary.map{line =>
					val stationId = fn.station.hashCode
					ByteString(s"$line,$stationId\r\n" , ByteString.UTF_8)
				}
			case DataType.PHEN =>
				ZipEntryFlow.singleEntryUnzip
			case _ =>
				Flow.apply[ByteString]
		}

		Flow.apply[ByteString]
			.viaMat(DigestFlow.md5)(Keep.right)
			.via(preprocessing)
			.toMat(FileIO.toPath(tmpPath)){
				(md5Fut, ioFut) => {
					for(
						md5Actual <- md5Fut;
						_ <- ioFut;
						done <- if(md5Actual == md5) Future(transactUpload()) else Future.failed(
							new ChecksumError(s"Expected MD5 checksum $md5, got $md5Actual")
						)
					) yield done
				}.andThen{
					case Success(_) =>
						logExternalUpload(fn)
						performUploadIfNotTest(targetFile, fn, false)
					case Failure(_) => Files.deleteIfExists(tmpPath)
				}
			}
	}

	def cleanupVeryOldFiles(station: StationId): Unit = {
		deleteOldEtcFiles(getStationFolder(station))
		deleteOldEtcFiles(getStationUploadedFolder(station))
	}

	private[etcfacade] def performUploadIfNotTest(file: Path, fn: EtcFilename, forceDaily: Boolean): Future[Done] =
		if(fn.station == config.testStation) done else performUpload(file, fn, forceDaily)


	private def performUpload(file: Path, fn: EtcFilename, forceDaily: Boolean): Future[Done] =

		fn.toDaily.fold(performEtcUpload(file, fn, None)){ daily =>

			getUploadedHalfHourlies(daily).flatMap{uploaded =>

				val stationFolder = getStationFolder(fn.station)
				val fresh = getZippableDailies(stationFolder, daily)

				val filePackage = uploaded ++ fresh
				val isFullPackage: Boolean = packageIsComplete(filePackage)

				if(!Files.exists(file)) done
				else if(isFullPackage && uploaded.isEmpty || forceDaily && isFromBeforeToday(daily)){

					zipToArchive(filePackage, daily).flatMap{
						(zipFile, hash) =>
							performEtcUpload(zipFile, daily, Some(hash)).andThen{
								case Success(_) =>
									fresh.foreach{(hhFn, _) =>
										val hhFile = stationFolder.resolve(hhFn.toString)
										Files.deleteIfExists(hhFile)
									}

								case Failure(_) => Files.deleteIfExists(zipFile)
							}
					}
				}
				else done //no uploads for incomplete or previously incomplete packages, unless forced
			}

		}.andThen(handleErrors(fn.toString))

	private def performEtcUpload(
		file: Path,
		fn: EtcFilename,
		hashOpt: Option[Sha256Sum],
	): Future[Done] = hashOpt
		.map(Future.successful)
		.getOrElse(FileIO
			.fromPath(file)
			.viaMat(DigestFlow.sha256)(Keep.right)
			.to(Sink.ignore)
			.run()
		)
		.map(getUploadMeta(fn, _))
		.flatMap(etcMeta => metaClient.registerEtcUpload(etcMeta).map(_ => etcMeta))
		.flatMap{etcMeta =>
			Files.move(file, getObjectSource(fn.station, etcMeta.hashSum), REPLACE_EXISTING)
			uploadDataObject(fn.station, etcMeta.hashSum)
		}

	private def uploadDataObject(station: StationId, hash: Sha256Sum): Future[Done] = upload
		.getEtcSink(hash)
		.flatMap{sink =>
			val srcPath = getObjectSource(station, hash)
			FileIO.fromPath(srcPath).runWith(sink)
		}
		.flatMap{res =>
			res.makeReport.fold(
				errMsg => Future.failed(new CpDataException(errMsg)),
				_ => done
			)
		}
		.transform(
			ok => {Files.delete(getObjectSource(station, hash)); ok},
			err => new Exception(s"ETC facade failure during internal object upload. Station $station, object $hash", err)
		)

	private[etcfacade] def uploadDataObjectHandleErrors(station: StationId, hash: Sha256Sum): Future[Done] =
		uploadDataObject(station, hash).andThen(
			handleErrors(hash.base64Url)
		)

	private def getUploadedHalfHourlies(daily: EtcFilename): Future[DailyPackage] =
		EtcFilename
			.dailyFileFormats
			.get(daily.dataType)
			.fold(
				Future.failed(CpDataException(s"Not a daily file: $daily"))
			)(dailyFormat =>
				metaClient.getSameFilenameInfo(daily.toString).map(
					_.foldLeft(Map.empty){(acc, sfi) =>
						if sfi.format != dailyFormat then acc
						else
							val zipFile = upload.getFile(Some(sfi.format), sfi.hash)
							val halfHourlies = zip.listEntryIds(zipFile).get
								.flatMap(zid => EtcFilename.parse(zid).toOption.map(_ -> zid))
								.collect{
									case (fn, zid) if !acc.contains(fn) =>
										fn -> ZipEntrySource.source(zipFile, zid)
								}
							acc ++ halfHourlies
					}
				)
			)

	private def appendError(msg: String): Unit = appendLogMsgToFile(msg, "errorLog.txt")
	private def logExternalUpload(fn: EtcFilename): Unit = appendLogMsgToFile(fn.toString, "externalUploadsLog.txt")

	private def appendLogMsgToFile(msg: String, fileName: String): Unit = {
		val msgFile = Paths.get(config.folder, fileName)
		val msgBytes = s"${Instant.now}\t$msg\n".getBytes(StandardCharsets.UTF_8)
		Files.write(msgFile, msgBytes, StandardOpenOption.APPEND, StandardOpenOption.CREATE)
	}

	private def handleErrors(uploadedObj: String): PartialFunction[Try[Done], Unit] =
		case Failure(err) =>
			appendError(s"Error while uploading $uploadedObj : " + UploadResult.extractMessage(err))
			log.error(err, s"ETC facade error while uploading $uploadedObj")

}

object FacadeService{
	import ZipEntryFlow._

	type EtcFileInfo = (Path, EtcFilename)
	type DailyPackage = Map[EtcFilename, FileLikeSource]

	val ForceEcUploadTime = LocalTime.of(4, 0) //is to be interpreted as UTC time
	val OldFileMaxAge = Duration.ofDays(30)

	def getUploadMeta(file: EtcFilename, hashSum: Sha256Sum) = EtcUploadMetadata(
		hashSum = hashSum,
		fileName = file.toString,
		station = file.station,
		logger = file.loggerNumber,
		dataType = file.dataType,
		fileId = file.fileNumber,

		acquisitionStart = file.time
			.map(LocalDateTime.of(file.date, _).minusMinutes(30))
			.getOrElse(LocalDateTime.of(file.date, LocalTime.MIN)),

		acquisitionStop = file.time
			.map(LocalDateTime.of(file.date, _))
			.getOrElse(LocalDateTime.of(file.date.plusDays(1), LocalTime.MIN))
	)

	private def getEtcFiles(folder: Path): Vector[EtcFileInfo] = iterateChildren(folder){_
		.flatMap(p => EtcFilename.parse(p.getFileName.toString).toOption.map((p, _)))
		.toVector
	}

	def deleteOldEtcFiles(folder: Path): Unit = {
		val now = LocalDateTime.now(ZoneOffset.UTC)

		getEtcFiles(folder).foreach{
			case (path, filename) =>
				val age = Duration.between(LocalDateTime.of(filename.date, LocalTime.MAX), now)
				if(age.compareTo(OldFileMaxAge) > 0) Files.deleteIfExists(path)
		}
	}

	def getZippableDailies(folder: Path, dailyFile: EtcFilename): DailyPackage =
		getEtcFiles(folder).collect{
			case (path, fn) if fn.toDaily.contains(dailyFile) =>
				fn -> FileIO.fromPath(path)
		}.toMap

	def zipToArchive(files: DailyPackage, fn: EtcFilename)(using Materializer, ExecutionContext): Future[(Path, Sha256Sum)] = {

		val tmpFile = Files.createTempFile(fn.toString, "")

		val fileEntries: Seq[FileEntry] = files.toSeq.map{
			(fn, src) => fn.toString -> src
		}.sortBy(_._1)

		val alreadyCompressed = fileEntries.forall{ (fname, _) =>
			val ext = fname.split(".").lastOption.map(_.toLowerCase)
			ext.fold(false)(compressedExtensions.contains)
		}

		val compression: Option[Compression] = if(alreadyCompressed) Some(0) else None

		getMultiEntryZipStream(Source(fileEntries), compression)
			.viaMat(DigestFlow.sha256)(Keep.right)
			.toMat(FileIO.toPath(tmpFile))(Keep.both)
			.mapMaterializedValue{
				case (hashFut, ioFut) => {
					for(
						hash <- hashFut;
						_ <- ioFut
					) yield tmpFile -> hash
				}.andThen{
					case Failure(_) =>
						Files.deleteIfExists(tmpFile)
				}
			}
			.run()
	}

	val compressedExtensions = Set("zip", "jpg", "jpeg", "gz")

	def isFromBeforeToday(fn: EtcFilename): Boolean = LocalDate.now(ZoneOffset.UTC).compareTo(fn.date) > 0

	private def packageIsComplete(pack: DailyPackage): Boolean =
		pack.keysIterator.flatMap(_.slot).toSet.size == 48
}
