package se.lu.nateko.cp.data.routes
import se.lu.nateko.cp.data.services.fetch.IntegrityControlService

import akka.http.scaladsl.server.Directives._
import akka.http.scaladsl.model.ContentTypes
import akka.util.ByteString
import java.nio.charset.StandardCharsets
import akka.http.scaladsl.model.HttpEntity

class IntegrityRouting(service: IntegrityControlService){
	import IntegrityControlService.ReportSource

	val route = pathPrefix("integrityControl"){
		parameter("fix".?){fix =>

			def respondWithReport(maker: Boolean => ReportSource) = onSuccess(maker(fix.contains("true"))){src =>
				val data = src.map(report => ByteString(s"${report.statement}\n", StandardCharsets.UTF_8))
				val entity = HttpEntity(ContentTypes.`text/plain(UTF-8)`, data)
				complete(entity)
			}

			path("local"){
				respondWithReport(service.getReportOnLocal)
			} ~
			path("remote"){
				respondWithReport(service.getReportOnRemote)
			}
		}
	}

}
