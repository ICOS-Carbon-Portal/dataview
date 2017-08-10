package se.lu.nateko.cp.data.routes

import scala.concurrent.Future
import scala.util.Failure
import scala.util.Success

import akka.http.scaladsl.marshallers.sprayjson.SprayJsonSupport._
import akka.http.scaladsl.model.ContentType
import akka.http.scaladsl.model.HttpEntity
import akka.http.scaladsl.model.HttpResponse
import akka.http.scaladsl.model.MediaTypes
import akka.http.scaladsl.model.StatusCodes
import akka.http.scaladsl.model.headers.`Content-Disposition`
import akka.http.scaladsl.model.headers.ContentDispositionTypes
import akka.http.scaladsl.model.headers.`X-Forwarded-For`
import akka.http.scaladsl.server.Directive
import akka.http.scaladsl.server.Directive0
import akka.http.scaladsl.server.Directive1
import akka.http.scaladsl.server.Directives._
import akka.http.scaladsl.server.ExceptionHandler
import akka.http.scaladsl.server.MissingHeaderRejection
import akka.http.scaladsl.server.RejectionHandler
import akka.http.scaladsl.server.Route
import akka.http.scaladsl.server.directives.ContentTypeResolver
import akka.stream.Materializer
import akka.stream.scaladsl.Source
import akka.util.ByteString
import se.lu.nateko.cp.cpauth.core.UserId
import se.lu.nateko.cp.data.api.RestHeartClient
import se.lu.nateko.cp.data.api.UnauthorizedUpload
import se.lu.nateko.cp.data.api.UploadUserError
import se.lu.nateko.cp.data.services.upload.DownloadService
import se.lu.nateko.cp.data.services.upload.UploadResult
import se.lu.nateko.cp.data.services.upload.UploadService
import se.lu.nateko.cp.meta.core.crypto.Sha256Sum
import se.lu.nateko.cp.meta.core.data.DataObject


class UploadRouting(authRouting: AuthRouting, uploadService: UploadService, restHeart: RestHeartClient)(implicit mat: Materializer) {
	import LicenceRouting.LicenceCookieName
	import UploadRouting._
	import authRouting._

	private implicit val ex = mat.executionContext
	private val log = uploadService.log
	private val downloadService = new DownloadService(uploadService, log)

	private val upload: Route = path(Sha256Segment){ hashsum =>
		forbidAuthenticationFailures{
			user{ uid =>
				extractRequest{ req =>
					val resFuture: Future[UploadResult] = uploadService
						.getSink(hashsum, uid)
						.flatMap(req.entity.dataBytes.runWith)

					onSuccess(resFuture)(res => res.makeReport match{
						case Right(report) => complete(report)
						case Left(errorMsg) =>
							log.warning(errorMsg)
							complete((StatusCodes.InternalServerError, errorMsg))
					})
				}
			}
		}
	} ~ requireShaHash

	private val download: Route = pathPrefix(Sha256Segment){ hashsum =>
		onSuccess(uploadService.lookupPackage(hashsum)){dobj =>
			cookie(LicenceCookieName){licCookie =>
				deleteCookie(LicenceCookieName){
					if(licCookie.value == hashsum.base64Url) (accessRoute(dobj))
					else reject
				}
			} ~
			user{uid =>
				onComplete(restHeart.getUserLicenseAcceptance(uid)){
					case Success(true) => accessRoute(dobj)
					case _ => reject
				}
			} ~
			redirect("/licence/" + hashsum.base64Url, StatusCodes.Found)
		}
	} ~ requireShaHash

	private val batchDownload: Route = pathEnd{
		parameter(('ids.as[Seq[Sha256Sum]], 'fileName)){ (hashes, fileName) =>
			user{uid =>
				onComplete(restHeart.getUserLicenseAcceptance(uid)){
					case Failure(err) =>
						throw err

					case Success(false) =>
						complete((StatusCodes.Forbidden, "You need to accept CP data licence on your 'My CP' page"))

					case Success(true) =>
						getClientIp{ip =>
							respondWithAttachment(fileName + ".zip"){
								val src = downloadService.getZipSource(
									hashes,
									logDownload(_, ip, Some(uid))
								)
								completeWithSource(src, ContentType(MediaTypes.`application/zip`))
							}
						}
				}
			} ~
			complete((StatusCodes.Unauthorized, "You need to be logged in to CP to perform batch downloads"))
		} ~
		complete((StatusCodes.BadRequest, "Expected js array of SHA256 hashsums in 'ids' URL param and a 'fileName' param"))
	}

	val route = pathPrefix("objects"){
		handleExceptions(errHandler){
			put{ upload } ~
			get{ batchDownload ~ download}
		}
	}

	private def accessRoute(dobj: DataObject): Route = optionalFileName{pathFileNameOpt =>
		getClientIp{ip =>
			extractLog{ log =>
				userOpt{uidOpt =>

					val fileName = dobj.fileName
					val contentType = getContentType(fileName)
					val file = uploadService.getFile(dobj)

					respondWithAttachment(fileName){
						if(file.exists){
							logDownload(dobj, ip, uidOpt)
							getFromFile(file, contentType)
						} else {
							val src = uploadService.getRemoteStorageSource(dobj)
							logDownload(dobj, ip, uidOpt)
							completeWithSource(src, contentType)
						}
					}
				}
			}
		}
	}

	private def logDownload(dobj: DataObject, ip: String, uidOpt: Option[UserId]): Unit = {
		restHeart.logDownload(dobj, ip).failed.foreach(
			log.error(_, s"Failed logging download of ${dobj.hash} from $ip to RestHeart")
		)
		for(uid <- uidOpt){
			restHeart.saveDownload(dobj, uid).failed.foreach(
				log.error(_, s"Failed saving download of ${dobj.hash} to ${uid.email}'s user profile")
			)
		}
	}
}

object UploadRouting{

	val Sha256Segment = Segment.flatMap(Sha256Sum.fromString(_).toOption)

	private val requireShaHash =
		complete((StatusCodes.BadRequest, s"Expected base64Url- or hex-encoded SHA-256 hash"))

	private val optionalFileName: Directive1[Option[String]] = Directive{nameToRoute =>
		pathEndOrSingleSlash{
			nameToRoute(Tuple1(None))
		} ~
		path(Segment.?){segmOpt =>
			nameToRoute(Tuple1(segmOpt))
		}
	}

	private val errHandler = ExceptionHandler{
		//TODO Handle the case of data object metadata not found, and the case of metadata service being down
		case authErr: UnauthorizedUpload =>
			complete((StatusCodes.Unauthorized, authErr.getMessage))
		case userErr: UploadUserError =>
			complete((StatusCodes.BadRequest, userErr.getMessage))
		case err => throw err
	}

	def getContentType(fileName: String): ContentType = implicitly[ContentTypeResolver].apply(fileName)

	def respondWithAttachment(fileName: String): Directive0 = respondWithHeader(
		`Content-Disposition`(ContentDispositionTypes.attachment, Map("filename" -> fileName))
	)

	def completeWithSource(src: Source[ByteString, Any], contentType: ContentType): Route =
		complete(HttpResponse(entity = HttpEntity.CloseDelimited(contentType, src)))

	val getClientIp: Directive1[String] = {

		val errMsg = "Missing 'X-Forwarded-For' header, bad reverse proxy configuration on the server"

		val rejHandler = RejectionHandler.newBuilder().handle{
			case MissingHeaderRejection(_) => complete((StatusCodes.BadRequest, errMsg))
		}.result()

		handleRejections(rejHandler) & headerValueByType[`X-Forwarded-For`](()).map(_.value)
	}

}
