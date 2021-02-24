package se.lu.nateko.cp.data.services.upload

import java.util.concurrent.ExecutionException

import scala.util.control.NoStackTrace
import se.lu.nateko.cp.data.api.CpDataException
import se.lu.nateko.cp.data.api.MetadataObjectIncomplete
import se.lu.nateko.cp.meta.core.crypto.Sha256Sum
import se.lu.nateko.cp.meta.core.data.IngestionMetadataExtract

class UploadResult(val taskResults: Seq[UploadTaskResult]){

	def makeReport: Either[String, String] = {
		val failures = taskResults.collect{
			case result: UploadTaskFailure => result
		}

		if(failures.isEmpty) {

			taskResults.collectFirst{
				case UploadCompletionSuccess(info) => Right(info)
			}.getOrElse(
				Left("No errors encountered, but upload completion success info was not found")
			)

		} else Left(
			failures.map{f =>
				f.getClass.getSimpleName + ": " + UploadResult.extractMessage(f.error)
			}.mkString("\n")
		)
	}

}

object UploadResult{
	def extractMessage(error: Throwable): String = error match {
		case boxed: ExecutionException => extractMessage(boxed.getCause)
		case nst: NoStackTrace => nst.getMessage
		case otherError => otherError.getMessage +
			otherError.getStackTrace.map(_.toString).mkString("\n")
	}
}

sealed trait UploadTaskResult

sealed trait UploadTaskSuccess extends UploadTaskResult
sealed trait UploadTaskCancellation extends UploadTaskResult
sealed trait UploadTaskFailure extends UploadTaskResult{
	val error: Throwable
}

case class UnexpectedTaskFailure(val error: Throwable) extends UploadTaskFailure

case class NotImplementedFailure(message: String) extends UploadTaskFailure{
	val error = new CpDataException(message)
}
case class IncompleteMetadataFailure(objLabel: Option[String], message: String) extends UploadTaskFailure{
	val error = new MetadataObjectIncomplete(objLabel, message)
}
case class CancelledBecauseOfOthers(errors: Seq[UploadTaskFailure]) extends UploadTaskCancellation

case class HashsumCheckSuccess(actual: Sha256Sum) extends UploadTaskSuccess
case class HashsumCheckFailure(expected: Sha256Sum, actual: Sha256Sum) extends UploadTaskFailure{
	val error = new CpDataException(s"Expected ${expected.id}, got ${actual.id}")
}

case class ByteCountingSuccess(bytes: Long) extends  UploadTaskSuccess
case class ByteCountingFailure(error: Throwable) extends UploadTaskFailure

case class IrodsSuccess(hash: Sha256Sum) extends UploadTaskSuccess
case class IrodsFailure(error: Throwable) extends UploadTaskFailure
case class IrodsHashsumFailure(failure: HashsumCheckFailure) extends UploadTaskFailure{
	val error = new CpDataException(s"IRODS upload hashsum check error: expected ${failure.expected.id}, got ${failure.actual.id}")
}

case object B2StageSuccess extends UploadTaskSuccess
case class B2SafeFailure(error: Throwable) extends UploadTaskFailure

case class FileWriteSuccess(bytesWritten: Long) extends UploadTaskSuccess
case class FileWriteFailure(error: Throwable) extends UploadTaskFailure
case object FileExists extends UploadTaskCancellation

case class IngestionSuccess(extract: IngestionMetadataExtract) extends UploadTaskSuccess
case class IngestionFailure(error: Throwable) extends UploadTaskFailure
case class UploadCompletionSuccess(response: String) extends UploadTaskSuccess

case object DummySuccess extends UploadTaskSuccess
case object NotApplicable extends UploadTaskCancellation
