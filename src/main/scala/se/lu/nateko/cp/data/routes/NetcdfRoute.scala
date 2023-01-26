package se.lu.nateko.cp.data.routes

import akka.http.scaladsl.marshalling.ToResponseMarshaller
import akka.http.scaladsl.server.Directives.*
import akka.http.scaladsl.server.Route
import akka.http.scaladsl.unmarshalling.Unmarshaller
import se.lu.nateko.cp.data.formats.netcdf.Raster
import se.lu.nateko.cp.data.formats.netcdf.RasterMarshalling
import se.lu.nateko.cp.data.formats.netcdf.ViewServiceFactory
import se.lu.nateko.cp.meta.core.crypto.Sha256Sum

import scala.concurrent.Future

object NetcdfRoute extends SprayRouting:
	private given ToResponseMarshaller[Raster] = RasterMarshalling.marshaller

	def apply(factory: ViewServiceFactory): Route = {

		(get & pathPrefix("netcdf")){
			path("listNetCdfFiles"){
				complete(factory.getNetCdfFiles())
			} ~
			path("listDates"){
				parameter("service"){ service =>
					complete(factory.getNetCdfViewService(service).getAvailableDates.map(_.toString))
				}
			} ~
			path("listVariables"){
				parameter("service"){ service =>
					complete(factory.getNetCdfViewService(service).getVariables)
				}
			} ~
			path("listElevations"){
				parameter("service", "varName"){ (service, varName) =>
					complete(factory.getNetCdfViewService(service).getAvailableElevations(varName))
				}
			} ~
			path("getSlice"){
				parameters("service", "dateInd".as[Int], "varName", "elevationInd".as[Int].?){(service, dateInd, varName, elInd) =>
					val raster = factory
						.getNetCdfViewService(service)
						.getRaster(dateInd, varName, elInd)
					complete(raster)
				}
			} ~
			path("getCrossSection"){
				parameters("service", "varName", "latInd".as[Int], "lonInd".as[Int], "elevationInd".as[Int].?){
					(service, varName, latInd, lonInd, elInd) =>
						val timeSeries = factory
							.getNetCdfViewService(service)
							.getTemporalCrossSection(varName, latInd, lonInd, elInd)
						complete(timeSeries)
				}
			}
		}

	}

	def cp(factory: ViewServiceFactory): Route = {

		//TODO Look into changing Sha256Sum's json format in meta core from RootJsonFormat to non-Root
		given Unmarshaller[String, Sha256Sum] = Unmarshaller(
			_ => s => Future.fromTry(Sha256Sum.fromString(s))
		)

		(get & pathPrefix("netcdf")){
			path("listDates"){
				parameter("service".as[Sha256Sum]){ hash =>
					complete(factory.getNetCdfViewService(hash.id).getAvailableDates.map(_.toString))
				}
			} ~
			path("listVariables"){
				parameter("service".as[Sha256Sum]){ hash =>
					complete(factory.getNetCdfViewService(hash.id).getVariables)
				}
			} ~
			path("listElevations"){
				parameter("service".as[Sha256Sum], "varName"){ (hash, varName) =>
					complete(factory.getNetCdfViewService(hash.id).getAvailableElevations(varName))
				}
			} ~
			path("getSlice"){
				parameters("service".as[Sha256Sum], "dateInd".as[Int], "varName", "elevationInd".as[Int].?){
					(hash, dateInd, varName, elInd) => complete(
						factory.getNetCdfViewService(hash.id).getRaster(dateInd, varName, elInd)
					)
				}
			} ~
			path("getCrossSection"){
				parameters("service".as[Sha256Sum], "varName", "latInd".as[Int], "lonInd".as[Int], "elevationInd".as[Int].?){
					(hash, varName, latInd, lonInd, elInd) => complete(
						factory.getNetCdfViewService(hash.id).getTemporalCrossSection(varName, latInd, lonInd, elInd)
					)
				}
			}
		}

	}
end NetcdfRoute
