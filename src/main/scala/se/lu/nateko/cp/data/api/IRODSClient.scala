package se.lu.nateko.cp.data.api

import scala.concurrent.Future
import scala.concurrent.duration.DurationInt
import scala.util.Failure
import scala.util.Success
import scala.util.Try

import akka.Done
import akka.NotUsed
import akka.http.scaladsl.HttpExt
import akka.http.scaladsl.model.ContentTypes
import akka.http.scaladsl.model.HttpEntity
import akka.http.scaladsl.model.HttpMethods
import akka.http.scaladsl.model.HttpRequest
import akka.http.scaladsl.model.HttpResponse
import akka.http.scaladsl.model.StatusCodes
import akka.http.scaladsl.model.Uri
import akka.http.scaladsl.model.headers
import akka.http.scaladsl.model.headers.BasicHttpCredentials
import akka.http.scaladsl.model.headers.Location
import akka.http.scaladsl.unmarshalling.Unmarshal
import akka.stream.Materializer
import akka.stream.scaladsl.Flow
import akka.stream.scaladsl.Framing
import akka.stream.scaladsl.Keep
import akka.stream.scaladsl.Sink
import akka.stream.scaladsl.Source
import akka.util.ByteString
import se.lu.nateko.cp.data.IRODSConfig
import se.lu.nateko.cp.data.streams.DigestFlow
import se.lu.nateko.cp.data.streams.SourceReceptacleAsSink
import se.lu.nateko.cp.data.utils.akka.done
import se.lu.nateko.cp.meta.core.crypto.Sha256Sum
import spray.json.DefaultJsonProtocol
import spray.json.JsNull
import spray.json.JsValue
import spray.json.RootJsonFormat
import spray.json.enrichString
import akka.http.scaladsl.marshallers.sprayjson.SprayJsonSupport.given
import akka.http.scaladsl.model.FormData
import akka.http.scaladsl.model.Multipart
import akka.http.scaladsl.model.HttpEntity.IndefiniteLength
import akka.http.scaladsl.model.HttpEntity.Strict
import akka.http.scaladsl.model.ContentType
import akka.http.scaladsl.model.MediaRanges
import akka.http.scaladsl.model.headers.ProductVersion

class IRODSClient(config: IRODSConfig, http: HttpExt)(using mat: Materializer):

	import mat.executionContext
	import IRODSClient.{_, given}

	val objUri = getUri("/data-objects")
	val collUri = getUri("/collections")
	val authUri = getUri("/authenticate")

	private var authToken: Future[String] =
		Future.failed(new CpDataException("not initialized yet"))

	def lpath(item: B2SafeItem): String = config.homePath + item.path

	private def getUri(pathSuffix: String) = Uri(config.baseUrl + pathSuffix)
	private def getUri(item: B2SafeItem): Uri = item match
		case _: IrodsColl => collUri
		case _: IrodsData => objUri

	def list(coll: IrodsColl): Future[Seq[String]] =
		val q = Uri.Query("op" -> "list", "lpath" -> lpath(coll))
		withAuth(HttpRequest(uri = collUri.withQuery(q)))
			.flatMap(analyzeResponse(_)(_.convertTo[EntryList]))
			.map(_.entries)

	def create(coll: IrodsColl, withIntermediates: Boolean): Future[Done] =
		if config.dryRun then done
		else withAuth:
			val form = FormData(
				"op" -> "create",
				"lpath" -> lpath(coll),
				"create-intermediates" -> (if withIntermediates then "1" else "0")
			)
			HttpRequest(uri = collUri, method = HttpMethods.POST, entity = form.toEntity)
		.flatMap(failIfNotSuccess)

	def uploadObject(obj: IrodsData, source: Source[ByteString, Any]): Future[Done] =
		if config.dryRun then
			source.toMat(Sink.ignore)(Keep.right).run()
		else
			val minFrameSize = 1 << 25 // 32 MB
			source
				.via(Flow[ByteString].groupedWeighted(minFrameSize)(_.size))
				.map(concatByteStrings)
				.scan(0L -> ByteString.empty):
					case ((offset, bs0), bs1) => (offset + bs0.size) -> bs1
				.runFoldAsync[Done](Done):
					case (_, (offset, bs)) =>
						withAuth(pagedUploadRequest(obj, bs, offset))
							.flatMap(failIfNotSuccess)

	def uploadFlow[T]: Flow[UploadRequest[T], UploadResponse[T], NotUsed] =
		val in = Flow.apply[UploadRequest[T]].map: ur =>
			objUploadHttpRequest(ur.obj, ur.src) -> (ur.context, ur.obj)

		val out = innerReqFlow[(T, IrodsData)].mapAsyncUnordered(1):
			case (respTry, (context, obj)) =>
				Future.fromTry(respTry)
					.flatMap(failIfNotSuccess)
					.flatMap(_ => getHashsum(obj))
					.transform:
						hashTry => Success(new UploadResponse[T](context, hashTry))
		in via out


	private def innerReqFlow[T]: Flow[(HttpRequest, T), (Try[HttpResponse], T), Any] = {
		val auth = Uri(config.baseUrl).authority
		val port = if(auth.port == 0) 443 else auth.port
		http.cachedHostConnectionPoolHttps[T](auth.host.toString, port)
	}

	private def objUploadHttpRequest(obj: IrodsData, source: Source[ByteString, Any]): HttpRequest =
		val bytesEntity = IndefiniteLength(ContentTypes.`application/octet-stream`, source)

		val op      = Multipart.FormData.BodyPart("op",    HttpEntity("write"))
		val lpathbp = Multipart.FormData.BodyPart("lpath", HttpEntity(lpath(obj)))
		val bytes   = Multipart.FormData.BodyPart("bytes", bytesEntity)

		val entity = Multipart.FormData(op, lpathbp, bytes).toEntity()
		HttpRequest(uri = objUri, method = HttpMethods.POST, entity = entity)


	private def pagedUploadRequest(obj: IrodsData, source: ByteString, offset: Long): HttpRequest =

		def bpart(name: String, ent: HttpEntity.Strict) = Multipart.FormData.BodyPart.Strict(name, ent)

		val op       = bpart("op",     HttpEntity("write"))
		val lpathbp  = bpart("lpath",  HttpEntity(lpath(obj)))
		val offsetbp = bpart("offset", HttpEntity(offset.toString))
		val bytes    = bpart("bytes",  HttpEntity(source))

		val formData: Multipart.FormData.Strict = Multipart.FormData(op, lpathbp, offsetbp, bytes)

		HttpRequest(
			uri = objUri,
			method = HttpMethods.POST,
			entity = formData.toEntity
		)


	def objectSink(obj: IrodsData): Sink[ByteString, Future[Done]] = SourceReceptacleAsSink(uploadObject(obj, _))

	def downloadObjectOnce(obj: IrodsData): Future[Source[ByteString, Any]] =
		val q = Uri.Query("op" -> "read", "lpath" -> lpath(obj))
		withAuth(HttpRequest(uri = objUri.withQuery(q))).flatMap: resp =>
			resp.status match
				case StatusCodes.OK =>
					Future.successful(resp.entity.withoutSizeLimit.dataBytes)
				case _ =>
					failIfNotSuccess(resp).map(_ => Source.empty)


	def downloadObjectReusable(obj: IrodsData): Source[ByteString, Future[Done]] = Source
		.lazyFutureSource(() => downloadObjectOnce(obj))
		.mapMaterializedValue(_.map(_ => Done))

	def delete(item: B2SafeItem): Future[Done] = if(config.dryRun) done else
		withAuth(deleteHttpRequest(item)).flatMap(failIfNotSuccess)

	def deleteFlow: Flow[IrodsData, Try[Done], NotUsed] =
		if(config.dryRun)
			Flow.apply[IrodsData].map(_ => Success(Done))
		else {
			val in = Flow.apply[IrodsData].map{obj =>
				deleteHttpRequest(obj) -> obj
			}

			val out = innerReqFlow[IrodsData].mapAsyncUnordered(1){
				case (resp, _) =>
					Future.fromTry(resp).flatMap(failIfNotSuccess).transform{
						doneTry => Success(doneTry)
					}
			}
			in via out
		}

	private def deleteHttpRequest(item: B2SafeItem) = HttpRequest(
		uri = getUri(item),
		method = HttpMethods.POST,
		entity = FormData(
			"op" -> "remove",
			"lpath" -> lpath(item),
			"no-trash" -> "1",
			"catalog-only" -> "0"
		).toEntity
	)

	def exists(item: B2SafeItem): Future[Boolean] =
		if config.dryRun then Future.successful(false)
		else
			val q = Uri.Query("op" -> "stat", "lpath" -> lpath(item))
			withAuth(HttpRequest(uri = getUri(item).withQuery(q)))
				.map: resp =>
					resp.discardEntityBytes()
					resp.status.isSuccess()


	def getHashsumOpt(data: IrodsData): Future[Option[Sha256Sum]] =
		if config.dryRun then Future.successful(None)
		else
			requestHashsum(data).flatMap: resp =>
				if resp.status == StatusCodes.NotFound then
					resp.discardEntityBytes()
					Future.successful(None)
				else parseHashsum(resp).map(Option(_))

	def getHashsum(data: IrodsData): Future[Sha256Sum] = requestHashsum(data).flatMap(parseHashsum(_))

	private def requestHashsum(data: IrodsData): Future[HttpResponse] =
		val form = FormData("op" -> "calculate_checksum", "lpath" -> lpath(data))
		withAuth(HttpRequest(uri = objUri, method = HttpMethods.POST, entity = form.toEntity))

	private def parseHashsum(resp: HttpResponse): Future[Sha256Sum] =
		analyzeResponse(resp): respJs =>
			val checksum = respJs.convertTo[Checksum]
			Sha256Sum.fromBase64(checksum.checksum.stripPrefix("sha2:")).get

	private val basicAuthHeader = headers.Authorization(
		BasicHttpCredentials(config.username, config.password)
	)

	def fetchToken(): Future[String] =
		val req = HttpRequest(uri = authUri, headers = Seq(basicAuthHeader), method = HttpMethods.POST)
		http.singleRequest(req).flatMap(extractTextResponse)

	private def withAuth(origReq: HttpRequest): Future[HttpResponse] =
		authToken.value.foreach: res =>
			if res.isFailure then authToken = fetchToken()

		def singleTry(): Future[HttpResponse] = authToken.flatMap: token =>
			val creds = headers.OAuth2BearerToken(token)
			val hdrs = origReq.headers :+ headers.Authorization(creds)
			http.singleRequest(origReq.withHeaders(hdrs))

		singleTry().flatMap: resp =>
			if resp.status.intValue == 401 then
				authToken = fetchToken()
				singleTry()
			else
				Future.successful(resp)
	end withAuth

	private def failIfNotSuccess(resp: HttpResponse): Future[Done] =
		analyzeResponse(resp)(_ => Done)

	private def extractTextResponse(resp: HttpResponse): Future[String] =
		Unmarshal(resp).to[String].flatMap: body =>
			if resp.status.isSuccess && !resp.status.isRedirection then
				Future.successful(body.trim)
			else
				val msg = if body.trim.isEmpty then resp.status.value else body.trim
				Future.failed(new CpDataException(s"iRODS error (HTTP ${resp.status.intValue}): $msg"))

	private def analyzeResponse[T](resp: HttpResponse)(payloadParser: JsValue => T): Future[T] =
		Unmarshal(resp).to[String].flatMap: body =>
			val respJs = Try(body.parseJson)
			val irodsStatus = respJs.map(_.convertTo[Response].irods_response)
			if resp.status.isSuccess && !resp.status.isRedirection && irodsStatus.fold(_ => false, _.status_code == 0) then
				Future.fromTry(respJs).map(payloadParser)
			else
				val irodsMsg = irodsStatus.toOption.flatMap(_.status_message).getOrElse("").trim
				val irodsCode = irodsStatus.map(_.status_code.toString).getOrElse("")
				val msg = if irodsMsg.nonEmpty then irodsMsg else if body.trim.isEmpty then resp.status.value else body.trim
				Future.failed[T](new CpDataException(s"iRODS error ${irodsCode} (HTTP ${resp.status.intValue}): $msg"))

end IRODSClient

object IRODSClient extends DefaultJsonProtocol:
	class UploadRequest[T](val context: T, val obj: IrodsData, val src: Source[ByteString, Any])
	class UploadResponse[T](val context: T, val result: Try[Sha256Sum])
	private case class EntryList(entries: Seq[String])
	private case class Checksum(checksum: String)
	private case class Status(status_code: Int, status_message: Option[String])
	private case class Response(irods_response: Status)

	private val vanillaStrSeqFmt = summon[RootJsonFormat[Seq[String]]]

	private given RootJsonFormat[EntryList] =
		given RootJsonFormat[Seq[String]] with
			def read(json: JsValue): Seq[String] = json match
				case JsNull => Nil
				case nonNull => vanillaStrSeqFmt.read(nonNull)
			def write(obj: Seq[String]): JsValue = vanillaStrSeqFmt.write(obj)
		jsonFormat1(EntryList.apply)
	private given RootJsonFormat[Checksum]  = jsonFormat1(Checksum.apply)
	private given RootJsonFormat[Status]    = jsonFormat2(Status.apply)
	private given RootJsonFormat[Response]  = jsonFormat1(Response.apply)

	def concatByteStrings(bss: Seq[ByteString]): ByteString =
		bss.foldLeft(ByteString.newBuilder)(_ ++= _).result

