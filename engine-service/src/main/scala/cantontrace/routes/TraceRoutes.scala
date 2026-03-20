package cantontrace.routes

import akka.http.scaladsl.model.StatusCodes
import akka.http.scaladsl.server.Directives._
import akka.http.scaladsl.server.{ExceptionHandler, Route}
import akka.http.scaladsl.marshallers.sprayjson.SprayJsonSupport._
import cantontrace.engine.{EngineExecutor, InstrumentedEngine}
import cantontrace.json.JsonProtocol._
import cantontrace.model._
import cantontrace.parser.{DalfParser, Decompiler, SourceExtractor}
import com.typesafe.scalalogging.LazyLogging
import spray.json._

/**
 * HTTP routes for the execution trace and simulation endpoints.
 *
 * All routes accept JSON request bodies and return JSON responses.
 * Error responses use standard HTTP status codes with a JSON body
 * containing an `error` field.
 */
class TraceRoutes(
  executor: EngineExecutor,
  instrumentedEngine: InstrumentedEngine
) extends LazyLogging {

  private val startTime = System.currentTimeMillis()

  // -----------------------------------------------------------------------
  // Exception handler
  // -----------------------------------------------------------------------

  private implicit val exceptionHandler: ExceptionHandler = ExceptionHandler {
    case ex: DeserializationException =>
      logger.warn(s"Request deserialization failed: ${ex.getMessage}")
      complete(StatusCodes.BadRequest -> JsObject(
        "error" -> JsString(s"Invalid request body: ${ex.getMessage}")
      ))
    case ex: IllegalArgumentException =>
      logger.warn(s"Invalid argument: ${ex.getMessage}")
      complete(StatusCodes.BadRequest -> JsObject(
        "error" -> JsString(ex.getMessage)
      ))
    case ex: Exception =>
      logger.error(s"Unhandled exception: ${ex.getMessage}", ex)
      complete(StatusCodes.InternalServerError -> JsObject(
        "error" -> JsString(s"Internal engine error: ${ex.getMessage}")
      ))
  }

  // -----------------------------------------------------------------------
  // Route tree
  // -----------------------------------------------------------------------

  val routes: Route = handleExceptions(exceptionHandler) {
    pathPrefix("api" / "v1") {
      concat(
        traceRoute,
        simulateRoute,
        parseDalfRoute,
        extractSourceRoute,
        decompileRoute,
        healthRoute
      )
    } ~
    // Also expose health at root level for simple probes
    path("health") {
      healthHandler
    }
  }

  // -----------------------------------------------------------------------
  // POST /api/v1/trace
  // -----------------------------------------------------------------------

  private def traceRoute: Route = path("trace") {
    post {
      entity(as[TraceRequest]) { request =>
        logger.info(
          s"Trace request: template=${request.command.templateId}, " +
          s"choice=${request.command.choice.getOrElse("Create")}, " +
          s"actAs=${request.actAs.mkString(",")}"
        )

        val contracts = request.contracts.map { case (cid, cr) =>
          cid -> toContractInfo(cr)
        }
        val disclosed = request.disclosedContracts.map(toContractInfo)

        // Use the instrumented engine for deeper tracing
        val trace = instrumentedEngine.traceInstrumented(
          command = request.command,
          packages = request.packages,
          contracts = contracts,
          disclosedContracts = disclosed,
          actAs = request.actAs,
          readAs = request.readAs,
          sourceFiles = Map.empty // source files will be populated by the caller
        )

        complete(trace)
      }
    }
  }

  // -----------------------------------------------------------------------
  // POST /api/v1/simulate
  // -----------------------------------------------------------------------

  private def simulateRoute: Route = path("simulate") {
    post {
      entity(as[SimulateRequest]) { request =>
        logger.info(
          s"Simulate request: template=${request.command.templateId}, " +
          s"choice=${request.command.choice.getOrElse("Create")}"
        )

        val contracts = request.contracts.map { case (cid, cr) =>
          cid -> toContractInfo(cr)
        }
        val disclosed = request.disclosedContracts.map(toContractInfo)

        val result = executor.simulate(
          command = request.command,
          packages = request.packages,
          contracts = contracts,
          disclosedContracts = disclosed,
          actAs = request.actAs,
          readAs = request.readAs
        )

        complete(result)
      }
    }
  }

  // -----------------------------------------------------------------------
  // POST /api/v1/parse-dalf
  // -----------------------------------------------------------------------

  private def parseDalfRoute: Route = path("parse-dalf") {
    post {
      entity(as[ParseDalfRequest]) { request =>
        logger.info(s"Parse DALF request (${request.dalfBytes.length} base64 chars)")

        DalfParser.parse(request.dalfBytes) match {
          case Right(detail) =>
            // If no source is available, add decompiled representations
            val enriched = if (!detail.hasSource) {
              enrichWithDecompiledLF(detail)
            } else detail

            complete(enriched)

          case Left(error) =>
            logger.warn(s"DALF parse failed: $error")
            complete(StatusCodes.BadRequest -> JsObject(
              "error" -> JsString(error)
            ))
        }
      }
    }
  }

  // -----------------------------------------------------------------------
  // POST /api/v1/extract-source
  // -----------------------------------------------------------------------

  private def extractSourceRoute: Route = path("extract-source") {
    post {
      entity(as[ExtractSourceRequest]) { request =>
        logger.info(s"Extract source request (${request.darBytes.length} base64 chars)")

        SourceExtractor.extract(request.darBytes) match {
          case Right(response) =>
            logger.info(
              s"Extracted ${response.sources.size} source files from DAR, " +
              s"packageId=${response.packageId.getOrElse("unknown")}"
            )
            complete(response)

          case Left(error) =>
            logger.warn(s"Source extraction failed: $error")
            complete(StatusCodes.BadRequest -> JsObject(
              "error" -> JsString(error)
            ))
        }
      }
    }
  }

  // -----------------------------------------------------------------------
  // POST /api/v1/decompile
  // -----------------------------------------------------------------------

  private def decompileRoute: Route = path("decompile") {
    post {
      entity(as[ParseDalfRequest]) { request =>
        logger.info(s"Decompile request (${request.dalfBytes.length} base64 chars)")

        Decompiler.decompile(request.dalfBytes) match {
          case Right(sources) =>
            complete(JsObject(
              "sources" -> sources.toJson,
              "moduleCount" -> JsNumber(sources.size),
              "totalChars" -> JsNumber(sources.values.map(_.length).sum)
            ))

          case Left(error) =>
            logger.warn(s"Decompilation failed: $error")
            complete(StatusCodes.BadRequest -> JsObject(
              "error" -> JsString(error)
            ))
        }
      }
    }
  }

  // -----------------------------------------------------------------------
  // GET /api/v1/health, GET /health
  // -----------------------------------------------------------------------

  private def healthRoute: Route = path("health") {
    healthHandler
  }

  private def healthHandler: Route = get {
    val uptimeSeconds = (System.currentTimeMillis() - startTime) / 1000
    complete(HealthResponse(
      status = "ok",
      engineVersion = BuildInfo.engineVersion,
      uptime = uptimeSeconds
    ))
  }

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  private def toContractInfo(cr: ContractRequest): ContractInfo = {
    ContractInfo(
      contractId = cr.contractId,
      templateId = cr.templateId,
      payload = cr.payload,
      signatories = cr.signatories,
      observers = cr.observers,
      contractKey = cr.contractKey
    )
  }

  /**
   * Enrich a PackageDetail with decompiled LF representations for all
   * templates and choices that lack source code.
   */
  private def enrichWithDecompiledLF(detail: PackageDetail): PackageDetail = {
    val decompiledSources = Decompiler.decompilePackage(detail)

    detail.copy(
      modules = detail.modules.map { module =>
        val moduleSource = decompiledSources.get(s"${module.name.replace('.', '/')}.daml")
        module.copy(
          templates = module.templates.map { template =>
            template.copy(
              decompiledLF = template.decompiledLF.orElse(moduleSource)
            )
          }
        )
      }
    )
  }
}

/**
 * Build information embedded at compile time.
 */
object BuildInfo {
  val engineVersion: String = "0.1.0"
  val scalaVersion: String = "2.13.12"
  val damlSdkVersion: String = "2.9.0"
}
