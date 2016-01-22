package se.lu.nateko.cp.data

import scala.collection.JavaConversions
import scala.concurrent.Await
import scala.concurrent.duration.DurationInt
import akka.actor.ActorSystem
import akka.http.scaladsl.Http
import akka.http.scaladsl.marshalling.ToResponseMarshallable.apply
import akka.http.scaladsl.model.StatusCodes
import akka.http.scaladsl.server.Directive
import akka.http.scaladsl.server.Directives._
import akka.http.scaladsl.server.ExceptionHandler
import akka.http.scaladsl.server.RouteResult.route2HandlerFlow
import akka.stream.ActorMaterializer
import se.lu.nateko.cp.data.irods.IrodsClient
import se.lu.nateko.cp.data.routes.AuthRouting
import se.lu.nateko.cp.data.routes.UploadRouting
import se.lu.nateko.cp.data.routes.NetcdfRoute
import se.lu.nateko.cp.data.services.UploadService
import se.lu.nateko.cp.netcdf.viewing.impl.ViewServiceFactoryImpl
import se.lu.nateko.cp.data.irods.IRODSConnectionPool
import se.lu.nateko.cp.data.api.MetaClient

object Main extends App {

	implicit val system = ActorSystem("cpdata")
	implicit val materializer = ActorMaterializer(namePrefix = Some("cpdata_mat"))
	implicit val dispatcher = system.dispatcher

	val config = ConfigReader.getDefault

	val factory = {
		import config.netcdf._
		import scala.collection.JavaConversions._
		new ViewServiceFactoryImpl(folder, dateVars, latitudeVars, longitudeVars, elevationVars)
	}

	val irodsConnPool = new IRODSConnectionPool
	val irodsClient = new IrodsClient(config.upload.irods, irodsConnPool)
	val metaClient = new MetaClient(config.meta)
	val uploadService = new UploadService(new java.io.File(config.upload.folder), irodsClient, metaClient)
	val authRouting = new AuthRouting(config.auth)
	val uploadRouting = new UploadRouting(authRouting, uploadService)

	val exceptionHandler = ExceptionHandler{
		case ex =>
			val exMsg = ex.getMessage
			val msg = if(exMsg == null || exMsg.isEmpty) ex.getClass.getName else exMsg
			complete((StatusCodes.InternalServerError, msg))
	}

	val route = handleExceptions(exceptionHandler){
		NetcdfRoute(factory) ~
		uploadRouting.route
	}

	Http()
		.bindAndHandle(route, "localhost", 9010)
		.onSuccess{
			case binding =>
				sys.addShutdownHook{
					val doneFuture = binding.unbind().andThen{
						case _ => system.shutdown()
					}
					Await.result(doneFuture, 3 seconds)
				}
				println(binding)
		}

}
