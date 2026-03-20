package cantontrace

import akka.actor.typed.ActorSystem
import akka.actor.typed.scaladsl.Behaviors
import akka.http.scaladsl.Http
import akka.http.scaladsl.model.StatusCodes
import akka.http.scaladsl.server.Directives._
import akka.http.scaladsl.server.{RejectionHandler, Route}
import cantontrace.engine.{EngineExecutor, InstrumentedEngine}
import cantontrace.routes.TraceRoutes
import com.typesafe.config.ConfigFactory
import com.typesafe.scalalogging.LazyLogging
import spray.json._

import scala.concurrent.{ExecutionContext, Future}
import scala.util.{Failure, Success}

/**
 * Entry point for the CantonTrace Engine Service.
 *
 * Starts an Akka HTTP server that exposes the engine's trace, simulate,
 * parse-dalf, and extract-source endpoints. The server binds to the host
 * and port specified in `application.conf` (defaults to 0.0.0.0:3002).
 *
 * Architecture:
 *   - The API gateway sends commands + ACS snapshots + packages to this service.
 *   - This service executes them using the Daml-LF engine and returns traces.
 *   - No external state — all inputs are provided per-request.
 *   - Horizontally scalable (stateless).
 */
object Main extends App with LazyLogging {

  // -----------------------------------------------------------------------
  // Configuration
  // -----------------------------------------------------------------------

  private val config = ConfigFactory.load()
  private val host = config.getString("cantontrace.server.host")
  private val port = config.getInt("cantontrace.server.port")

  logger.info(s"CantonTrace Engine Service v${routes.BuildInfo.engineVersion}")
  logger.info(s"Scala ${routes.BuildInfo.scalaVersion}, Daml SDK ${routes.BuildInfo.damlSdkVersion}")
  logger.info(s"Binding to $host:$port")

  // -----------------------------------------------------------------------
  // Actor system
  // -----------------------------------------------------------------------

  implicit val system: ActorSystem[Nothing] =
    ActorSystem(Behaviors.empty, "cantontrace-engine")
  implicit val ec: ExecutionContext = system.executionContext

  // -----------------------------------------------------------------------
  // Engine components
  // -----------------------------------------------------------------------

  private val executor = new EngineExecutor()
  private val instrumentedEngine = new InstrumentedEngine()

  // -----------------------------------------------------------------------
  // Routes
  // -----------------------------------------------------------------------

  private val traceRoutes = new TraceRoutes(executor, instrumentedEngine)

  // Custom rejection handler for clean 404/405 responses
  private implicit val rejectionHandler: RejectionHandler = RejectionHandler.newBuilder()
    .handleNotFound {
      complete(StatusCodes.NotFound -> JsObject(
        "error" -> JsString("Endpoint not found")
      ).prettyPrint)
    }
    .result()

  private val allRoutes: Route = {
    // CORS headers for development (the API gateway proxies in production)
    respondWithHeaders(
      akka.http.scaladsl.model.headers.`Access-Control-Allow-Origin`.*,
      akka.http.scaladsl.model.headers.`Access-Control-Allow-Methods`(
        akka.http.scaladsl.model.HttpMethods.GET,
        akka.http.scaladsl.model.HttpMethods.POST,
        akka.http.scaladsl.model.HttpMethods.OPTIONS
      ),
      akka.http.scaladsl.model.headers.`Access-Control-Allow-Headers`(
        "Content-Type", "Authorization", "Accept"
      )
    ) {
      // Handle CORS preflight
      options {
        complete(StatusCodes.OK)
      } ~
      traceRoutes.routes
    }
  }

  // -----------------------------------------------------------------------
  // Server binding
  // -----------------------------------------------------------------------

  private val bindingFuture: Future[Http.ServerBinding] =
    Http().newServerAt(host, port).bind(allRoutes)

  bindingFuture.onComplete {
    case Success(binding) =>
      val address = binding.localAddress
      logger.info(s"Engine service running at http://${address.getHostString}:${address.getPort}")
      logger.info("Endpoints:")
      logger.info("  POST /api/v1/trace         — Execute command with full instrumentation trace")
      logger.info("  POST /api/v1/simulate      — Execute command without instrumentation (fast)")
      logger.info("  POST /api/v1/parse-dalf    — Parse DALF archive to extract metadata")
      logger.info("  POST /api/v1/extract-source — Extract .daml source files from DAR")
      logger.info("  POST /api/v1/decompile     — Decompile DALF to human-readable representation")
      logger.info("  GET  /api/v1/health        — Health check")
      logger.info("  GET  /health               — Health check (root-level)")

    case Failure(ex) =>
      logger.error(s"Failed to bind to $host:$port", ex)
      system.terminate()
  }

  // -----------------------------------------------------------------------
  // Graceful shutdown
  // -----------------------------------------------------------------------

  sys.addShutdownHook {
    logger.info("Shutdown signal received, terminating...")
    bindingFuture
      .flatMap(_.unbind())
      .onComplete { _ =>
        system.terminate()
        logger.info("Engine service terminated")
      }
  }
}
