package se.lu.nateko.cp.data.routes

import akka.http.scaladsl.marshallers.sprayjson.SprayJsonSupport._
import akka.http.scaladsl.model.ContentTypes
import akka.http.scaladsl.model.HttpEntity
import akka.http.scaladsl.model.HttpMethods
import akka.http.scaladsl.model.StatusCodes
import akka.http.scaladsl.model.headers._
import akka.http.scaladsl.server.Directives._
import akka.http.scaladsl.server.Route
import akka.stream.scaladsl.Source
import akka.util.ByteString
import se.lu.nateko.cp.cpauth.core.CsvDownloadInfo
import se.lu.nateko.cp.cpauth.core.DownloadEventInfo
import se.lu.nateko.cp.data.api.PortalLogClient
import se.lu.nateko.cp.data.api.RestHeartClient
import se.lu.nateko.cp.data.services.fetch.BinTableCsvReader
import se.lu.nateko.cp.data.services.upload.UploadService
import se.lu.nateko.cp.meta.core.crypto.Sha256Sum
import se.lu.nateko.cp.meta.core.data.Envri
import se.lu.nateko.cp.meta.core.data.Envri.Envri
import se.lu.nateko.cp.meta.core.data.Envri.EnvriConfigs

import java.nio.charset.StandardCharsets
import java.time.Instant

import DownloadRouting.respondWithAttachment


class CsvFetchRouting(
	upload: UploadService,
	restHeart: RestHeartClient,
	logClient: PortalLogClient,
	authRouting: AuthRouting
)(implicit envriConf: EnvriConfigs) {
	import UploadRouting.requireShaHash
	import DownloadRouting.getClientIp
	import authRouting.user
	private val fetcher = new BinTableCsvReader(upload)

	val extractEnvri = UploadRouting.extractEnvriDirective

	val route: Route = (pathPrefix("csv") & get & extractEnvri){implicit envri =>
		requireShaHash{hash =>
			user{uid =>
				onSuccess(restHeart.getUserLicenseAcceptance(uid)){accepted =>
					if(accepted) fetchCsvRoute(hash)
					else complete(StatusCodes.Forbidden -> "Accepting data licence in your user profile is required for CSV downloads")
				}
			} ~
			complete(StatusCodes.Unauthorized -> "Carbon/data portal login is required for CSV downloads")
		}
	}

	private def fetchCsvRoute(hash: Sha256Sum)(implicit envri: Envri): Route = getClientIp{ip =>
		parameters("col".repeated, "offset".as[Long].optional, "limit".as[Int].optional){(cols, offsetOpt, limitOpt) =>

			val onlyColumnsOpt = Option(cols.toArray.reverse).filterNot(_.isEmpty)

			onSuccess(fetcher.csvSource(hash, onlyColumnsOpt, offsetOpt, limitOpt)){case (src, fileName) =>
				val csvSelect = DownloadEventInfo.CsvSelect(onlyColumnsOpt.map(_.toIndexedSeq), offsetOpt, limitOpt)
				val dlInfo = CsvDownloadInfo(Instant.now(), ip, hash.id, csvSelect)
				logClient.logDownload(dlInfo)
				respondWithAttachment(fileName){
					complete(
						HttpEntity(
							ContentTypes.`text/csv(UTF-8)`,
							src.map(s => ByteString(s))
						)
					)
				}
			}
		}
	}
}
