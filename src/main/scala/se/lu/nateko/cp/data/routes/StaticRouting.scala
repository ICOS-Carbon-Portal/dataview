package se.lu.nateko.cp.data.routes

import akka.http.scaladsl.server.Directives._
import akka.http.scaladsl.marshalling.ToResponseMarshaller
import akka.http.scaladsl.model.StatusCodes
import play.twirl.api.Html
import akka.http.scaladsl.marshalling.Marshaller
import akka.http.scaladsl.model.HttpCharset
import akka.http.scaladsl.model.HttpResponse
import akka.http.scaladsl.marshalling.Marshalling.WithOpenCharset
import akka.http.scaladsl.model.MediaTypes

import scala.concurrent.Future
import akka.http.scaladsl.model.HttpEntity
import akka.http.scaladsl.model.ContentType
import akka.http.scaladsl.server.PathMatcher1
import se.lu.nateko.cp.cpauth.core.PublicAuthConfig
import se.lu.nateko.cp.meta.core.data.Envri.EnvriConfigs
import se.lu.nateko.cp.meta.core.data.Envri.Envri

class StaticRouting(authConfigs: Map[Envri, PublicAuthConfig])(implicit val envriConfigs: EnvriConfigs) {
	import StaticRouting.pageMarshaller
	import UploadRouting.Sha256Segment
	private type PageFactory = PartialFunction[(String, Envri), Html]
	private val NetCdfProj = "netcdf"
	private val MapGraphProj = "map-graph"

	val projects = Set(NetCdfProj, "portal", "wdcgg", "dygraph-light", "stats", "etcfacade", MapGraphProj, "dashboard", "lastDownloads")
	private val jsAppFolder = "frontendapps"

	private[this] val standardPageFactory: PageFactory = {
		case ("wdcgg", _) => views.html.WdcggPage()
		case ("portal", envri) => views.html.PortalPage(authConfigs(envri))(envri)
		case ("stats", envri) => views.html.StatsPage()(envri)
		case ("etcfacade", envri) => views.html.EtcFacadePage(authConfigs(envri))
		case ("dygraph-light", envri) => views.html.DygraphLight()(envri)
		case ("dashboard", _) => views.html.Dashboard()
	}

	private def maybeDobjVis(proj: String): PathMatcher1[PageFactory] = proj match {
		case NetCdfProj =>
			(Slash ~ Sha256Segment).?.tmap(x => x._1 match {
				case Some(_) =>
					Tuple1{case (NetCdfProj, _) => views.html.NetCDFPage(true)}
				case None =>
					Tuple1{case (NetCdfProj, _) => views.html.NetCDFPage(false)}
			})
		case MapGraphProj =>
			(Slash ~ Sha256Segment).?.tmap(_ =>
				Tuple1{case (MapGraphProj, _) => views.html.MapGraph()}
			)
		case _ =>
			Neutral.tmap(_ => Tuple1(standardPageFactory))
	}

	private val extractEnvri = UploadRouting.extractEnvriDirective

	val route = (pathPrefix(Segment) & extractEnvri){case prEnvri @ (proj, _) =>

		if(!projects.contains(proj)) reject else {
			pathEnd{
				redirect("/" + proj + "/", StatusCodes.Found)
			} ~
			rawPathPrefix(maybeDobjVis(proj)){pageFactory =>
				pathEndOrSingleSlash{
					if(pageFactory.isDefinedAt(prEnvri)) complete(pageFactory(prEnvri))
					else getFromResource(s"$jsAppFolder/$proj/$proj.html")
				} ~
				getFromResourceDirectory(s"$jsAppFolder/$proj")
			}
		}
	} ~
	path("robots.txt"){
		getFromResource("robots.txt")
	}
}

object StaticRouting {
	implicit val pageMarshaller: ToResponseMarshaller[Html] = Marshaller(
		_ => html => Future.successful(
			WithOpenCharset(MediaTypes.`text/html`, getHtml(html, _)) :: Nil
		)
	)

	private def getHtml(html: Html, charset: HttpCharset) = HttpResponse(
		entity = HttpEntity(
			ContentType.WithCharset(MediaTypes.`text/html`, charset),
			html.body
		)
	)
}
