package se.lu.nateko.cp.data.services.upload

import scala.annotation.implicitNotFound
import scala.concurrent.ExecutionContext
import scala.concurrent.Future

import akka.Done
import akka.stream.scaladsl.Sink
import akka.util.ByteString

trait UploadTask{

	def sink: Sink[ByteString, Future[UploadTaskResult]]

	def onComplete(ownResult: UploadTaskResult, otherTaskResults: Seq[UploadTaskResult]): Future[UploadTaskResult]

}

trait PostUploadTask{

	def perform(taskResults: Seq[UploadTaskResult]): Future[UploadTaskResult]

}


object UploadTask{

	def revertOnAnyFailure(
		ownResult: UploadTaskResult,
		otherTaskResults: Seq[UploadTaskResult],
		cleanup: () => Future[Done]
	)
	(implicit ctxt: ExecutionContext): Future[UploadTaskResult] = ownResult match {

		case _: UploadTaskFailure => cleanup().map(_ => ownResult)

		case _ =>
			val failures = otherTaskResults.collect{
				case result: UploadTaskFailure => result
			}
			if(failures.isEmpty) Future.successful(ownResult)
			else cleanup().map(_ => CancelledBecauseOfOthers(failures))
	}

}

