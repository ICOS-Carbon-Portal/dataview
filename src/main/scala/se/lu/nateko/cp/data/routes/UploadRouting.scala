package se.lu.nateko.cp.data.routes

import scala.concurrent.Future
import scala.util.Success
import scala.util.Try

import LicenceRouting.LicenceCookieName
import LicenceRouting.licenceUri
import LicenceRouting.parseLicenceCookie
import akka.http.scaladsl.marshallers.sprayjson.SprayJsonSupport._
import akka.http.scaladsl.model.ContentType
import akka.http.scaladsl.model.HttpEntity
import akka.http.scaladsl.model.HttpMethods
import akka.http.scaladsl.model.HttpResponse
import akka.http.scaladsl.model.MediaTypes
import akka.http.scaladsl.model.StatusCodes
import akka.http.scaladsl.model.Uri
import akka.http.scaladsl.model.headers._
import akka.http.scaladsl.server.Directive
import akka.http.scaladsl.server.Directive0
import akka.http.scaladsl.server.Directive1
import akka.http.scaladsl.server.Directives._
import akka.http.scaladsl.server.ExceptionHandler
import akka.http.scaladsl.server.Route
import akka.http.scaladsl.server.directives.ContentTypeResolver
import akka.http.scaladsl.unmarshalling.Unmarshaller
import akka.stream.Materializer
import akka.stream.scaladsl.Source
import akka.util.ByteString
import se.lu.nateko.cp.cpauth.core.UserId
import se.lu.nateko.cp.data.api.PortalLogClient
import se.lu.nateko.cp.data.api.RestHeartClient
import se.lu.nateko.cp.data.api.UnauthorizedUpload
import se.lu.nateko.cp.data.api.UploadUserError
import se.lu.nateko.cp.data.services.upload.DownloadService
import se.lu.nateko.cp.data.services.upload.UploadResult
import se.lu.nateko.cp.data.services.upload.UploadService
import se.lu.nateko.cp.meta.core.MetaCoreConfig
import se.lu.nateko.cp.meta.core.crypto.JsonSupport._
import se.lu.nateko.cp.meta.core.crypto.Sha256Sum
import se.lu.nateko.cp.meta.core.data.DataObject
import se.lu.nateko.cp.meta.core.data.Envri
import se.lu.nateko.cp.meta.core.data.Envri.Envri
import se.lu.nateko.cp.meta.core.data.Envri.EnvriConfigs


class UploadRouting(authRouting: AuthRouting, uploadService: UploadService,
	restHeart: RestHeartClient, logClient: PortalLogClient, coreConf: MetaCoreConfig
)(implicit mat: Materializer) {
	import UploadRouting._
	import authRouting._

	private implicit val ex = mat.executionContext
	private implicit val envriConfs = coreConf.envriConfigs
	private implicit val uriFSU = Unmarshaller[String, Uri](_ => s => Future.fromTry(Try(Uri(s))))

	private val log = uploadService.log
	private val downloadService = new DownloadService(coreConf, uploadService, log)
	val extractEnvri = extractEnvriDirective

	private val upload: Route = requireShaHash{ hashsum =>
		userRequired{ uid =>
			extractEnvri{implicit envri =>
				makeUpload(uploadService.getSink(hashsum, uid))
			}
		}
	}

	private val reIngest: Route = requireShaHash{ hashsum =>
		userRequired{ uid =>
			extractEnvri{implicit envri =>
				extractRequest{req =>
					req.discardEntityBytes()
					onSuccess(uploadService.reingest(hashsum, uid)){_ =>
						complete(StatusCodes.OK)
					}
				}
			}
		}
	}

	private val tryIngest: Route = parameters(('specUri.as[Uri], 'nRows.as[Int].?)){(specUri, nRowsOpt) =>
			extractEnvri{implicit envri =>
				makeUpload(uploadService.getTryIngestSink(specUri, nRowsOpt))
			}
		} ~
		complete(StatusCodes.BadRequest -> "Expected object species URI as 'specUri' query parameter, and optionally number of rows as 'nRows'")

	private def makeUpload(sink: Future[UploadService.DataObjectSink])(implicit envri: Envri): Route = extractRequest{ req =>
		val resFuture: Future[UploadResult] = sink.flatMap(req.entity.dataBytes.runWith)
		addAccessControlHeaders(envri){
			onSuccess(resFuture)(res => res.makeReport match{
				case Right(report) => complete(report)
				case Left(errorMsg) =>
					log.warning(errorMsg)
					complete((StatusCodes.InternalServerError, errorMsg))
			})
		}
	}

	private val uploadHttpOptions: Route = requireShaHash{ _ =>
		extractEnvri{implicit envri =>
			addAccessControlHeaders(envri){
				respondWithHeaders(
					`Access-Control-Allow-Methods`(HttpMethods.PUT),
					`Access-Control-Allow-Headers`(`Content-Type`.name)
				){
					complete(StatusCodes.OK)
				}
			}
		}
	}

	private val download: Route = requireShaHash{ hashsum =>
		extractEnvri{implicit envri =>
			onSuccess(uploadService.lookupPackage(hashsum)){dobj =>
				licenceCookieDobjList{dobjs =>
					deleteCookie(LicenceCookieName){
						if(dobjs.contains(hashsum)) (accessRoute(dobj))
						else reject
					}
				} ~
				user{uid =>
					onComplete(restHeart.getUserLicenseAcceptance(uid)){
						case Success(true) => accessRoute(dobj)
						case _ => reject
					}
				} ~
				redirect(licenceUri(Seq(hashsum), None), StatusCodes.Found)
			}
		}
	}

	private val batchDownload: Route = pathEnd{
		parameter(('ids.as[Seq[Sha256Sum]], 'fileName)){ (hashes, fileName) =>
			userOpt{uidOpt =>
				extractEnvri{implicit envri =>

					val ok = getClientIp{ip =>
						respondWithAttachment(fileName + ".zip"){
							val src = downloadService.getZipSource(
								hashes,
								logDownload(_, ip, uidOpt)
							)
							completeWithSource(src, ContentType(MediaTypes.`application/zip`))
						}
					}

					licenceCookieDobjList{dobjs =>
						if(hashes.diff(dobjs).isEmpty) ok else reject
					} ~
					onSome(uidOpt){uid =>
						onComplete(restHeart.getUserLicenseAcceptance(uid)){
							case Success(true) => ok
							case _ => reject
						}
					}
				}
			} ~
			redirect(licenceUri(hashes, Some(fileName)), StatusCodes.Found)
		} ~
		complete((StatusCodes.BadRequest, "Expected js array of SHA256 hashsums in 'ids' URL param and a 'fileName' param"))
	}

	val route = handleExceptions(errHandler){
		pathPrefix("objects"){
			put{ upload } ~
			post{ reIngest } ~
			options{ uploadHttpOptions } ~
			get{ batchDownload ~ download}
		} ~
		path("tryingest"){
			put{ tryIngest }
		}
	}

	private def accessRoute(dobj: DataObject)(implicit envri: Envri): Route = optionalFileName{pathFileNameOpt =>
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

	private def logDownload(dobj: DataObject, ip: String, uidOpt: Option[UserId])(implicit envri: Envri): Unit = {
		logClient.logDownload(dobj, ip).failed.foreach(
			log.error(_, s"Failed logging download of ${dobj.hash} from $ip to RestHeart")
		)
		for(uid <- uidOpt){
			restHeart.saveDownload(dobj, uid).failed.foreach(
				log.error(_, s"Failed saving download of ${dobj.hash} to ${uid.email}'s user profile")
			)
		}
	}

	private def addAccessControlHeaders(implicit envri: Envri): Directive0 = optionalHeaderValueByType[Origin](()).flatMap{
		case Some(origin) if envriConfs(envri).metaPrefix.toString.startsWith(origin.value) =>
			respondWithHeaders( //allowing uploads from meta-hosted browser web apps
				`Access-Control-Allow-Origin`(origin.value), `Access-Control-Allow-Credentials`(true)
			)
		case _ => pass
	}
}

object UploadRouting{

	val Sha256Segment = Segment.flatMap(Sha256Sum.fromString(_).toOption)

	val requireShaHash: Directive1[Sha256Sum] = path(Sha256Segment.?).flatMap{
		case Some(hash) => provide(hash)
		case None => complete(StatusCodes.BadRequest -> s"Expected base64Url- or hex-encoded SHA-256 hash")
	}

	private val optionalFileName: Directive1[Option[String]] = Directive{nameToRoute =>
		pathEndOrSingleSlash{
			nameToRoute(Tuple1(None))
		} ~
		path(Segment.?){segmOpt =>
			nameToRoute(Tuple1(segmOpt))
		}
	}

	val licenceCookieDobjList: Directive1[Seq[Sha256Sum]] = Directive{dobjsToRoute =>
		cookie(LicenceCookieName){licCookie =>
			extractMaterializer{implicit mat =>
				onComplete(parseLicenceCookie(licCookie.value)){
					case Success(dobjs) => dobjsToRoute(Tuple1(dobjs))
					case _ => reject
				}
			}
		}
	}

	def onSome[T](opt: Option[T]): Directive1[T] = provide(opt).flatMap{
		case Some(v) => provide(v)
		case None => reject
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

	val getClientIp: Directive1[String] = optionalHeaderValueByType[`X-Forwarded-For`](()).flatMap{
		case Some(xff) => provide(xff.value)
		case None => complete(
			StatusCodes.BadRequest -> "Missing 'X-Forwarded-For' header, bad reverse proxy configuration on the server"
		)
	}

	def extractEnvriDirective(implicit configs: EnvriConfigs): Directive1[Envri] = extractHost.flatMap{h =>
		Envri.infer(h) match{
			case None => complete(StatusCodes.BadRequest -> s"Unexpected host $h, cannot find corresponding ENVRI")
			case Some(envri) => provide(envri)
		}
	}

}
