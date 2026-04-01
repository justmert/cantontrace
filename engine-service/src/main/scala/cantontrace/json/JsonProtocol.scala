package cantontrace.json

import cantontrace.model._
import spray.json._

/**
 * Spray-JSON format instances for all engine-service data types.
 *
 * This protocol object provides implicit conversions between Scala case
 * classes and JSON, used by Akka HTTP's spray-json marshalling support.
 * All types that cross the HTTP boundary must have a format defined here.
 *
 * Design notes:
 *   - We use `jsonFormat` macros for straightforward case classes.
 *   - Sealed trait hierarchies (StepContext, TransactionEvent) use
 *     explicit format implementations with a `type` discriminator field.
 *   - Optional fields are omitted from JSON when None (spray-json default).
 *   - Sets are serialized as JSON arrays.
 */
object JsonProtocol extends DefaultJsonProtocol {

  // -----------------------------------------------------------------------
  // Source Location
  // -----------------------------------------------------------------------

  implicit val sourceLocationFormat: RootJsonFormat[SourceLocation] = jsonFormat5(SourceLocation)

  // -----------------------------------------------------------------------
  // Step Context hierarchy
  // -----------------------------------------------------------------------

  implicit val fetchContextFormat: RootJsonFormat[FetchContext] = jsonFormat(FetchContext, "contractId", "payload", "found")
  implicit val authContextFormat: RootJsonFormat[AuthContext] = jsonFormat(AuthContext, "required", "provided")
  implicit val guardContextFormat: RootJsonFormat[GuardContext] = jsonFormat(GuardContext, "expression", "result", "variables")
  implicit val actionContextFormat: RootJsonFormat[ActionContext] = jsonFormat(ActionContext, "actionType", "templateId", "choice", "arguments", "resultContractId")
  implicit val expressionContextFormat: RootJsonFormat[ExpressionContext] = jsonFormat(ExpressionContext, "expressionType", "variables")
  implicit val packageFetchContextFormat: RootJsonFormat[PackageFetchContext] = jsonFormat(PackageFetchContext, "packageId", "found")
  implicit val unknownContextFormat: RootJsonFormat[UnknownContext] = jsonFormat(UnknownContext, "detail")

  implicit object StepContextFormat extends RootJsonFormat[StepContext] {
    override def write(ctx: StepContext): JsValue = {
      val base = ctx match {
        case c: FetchContext        => c.toJson.asJsObject
        case c: AuthContext         => c.toJson.asJsObject
        case c: GuardContext        => c.toJson.asJsObject
        case c: ActionContext       => c.toJson.asJsObject
        case c: ExpressionContext   => c.toJson.asJsObject
        case c: PackageFetchContext => c.toJson.asJsObject
        case c: UnknownContext      => c.toJson.asJsObject
      }
      JsObject(base.fields + ("contextType" -> JsString(ctx.contextType)))
    }

    override def read(json: JsValue): StepContext = {
      val obj = json.asJsObject
      val contextType = obj.fields.getOrElse("contextType",
        throw DeserializationException("StepContext missing 'contextType' field")
      ).convertTo[String]

      // Remove the discriminator before parsing the variant
      val stripped = JsObject(obj.fields - "contextType")

      contextType match {
        case "fetch_contract"      => stripped.convertTo[FetchContext]
        case "check_authorization" => stripped.convertTo[AuthContext]
        case "evaluate_guard"      => stripped.convertTo[GuardContext]
        case "ledger_action"       => stripped.convertTo[ActionContext]
        case "evaluate_expression" => stripped.convertTo[ExpressionContext]
        case "fetch_package"       => stripped.convertTo[PackageFetchContext]
        case "unknown"             => stripped.convertTo[UnknownContext]
        case other =>
          throw DeserializationException(s"Unknown StepContext type: $other")
      }
    }
  }

  // -----------------------------------------------------------------------
  // Trace Step
  // -----------------------------------------------------------------------

  implicit val traceStepFormat: RootJsonFormat[TraceStep] = jsonFormat8(TraceStep)

  // -----------------------------------------------------------------------
  // Transaction Event hierarchy
  // -----------------------------------------------------------------------

  implicit val createdTransactionEventFormat: RootJsonFormat[CreatedTransactionEvent] =
    jsonFormat(CreatedTransactionEvent, "eventId", "contractId", "templateId", "payload", "signatories", "observers")
  implicit val exercisedTransactionEventFormat: RootJsonFormat[ExercisedTransactionEvent] =
    jsonFormat(ExercisedTransactionEvent, "eventId", "contractId", "templateId", "choice", "choiceArgument", "actingParties", "consuming", "childEventIds", "exerciseResult")
  implicit val archivedTransactionEventFormat: RootJsonFormat[ArchivedTransactionEvent] =
    jsonFormat(ArchivedTransactionEvent, "eventId", "contractId", "templateId")

  implicit object TransactionEventFormat extends RootJsonFormat[TransactionEvent] {
    override def write(event: TransactionEvent): JsValue = {
      val base = event match {
        case e: CreatedTransactionEvent   => e.toJson.asJsObject
        case e: ExercisedTransactionEvent => e.toJson.asJsObject
        case e: ArchivedTransactionEvent  => e.toJson.asJsObject
      }
      JsObject(base.fields + ("eventType" -> JsString(event.eventType)))
    }

    override def read(json: JsValue): TransactionEvent = {
      val obj = json.asJsObject
      val eventType = obj.fields.getOrElse("eventType",
        throw DeserializationException("TransactionEvent missing 'eventType' field")
      ).convertTo[String]

      val stripped = JsObject(obj.fields - "eventType")

      eventType match {
        case "created"   => stripped.convertTo[CreatedTransactionEvent]
        case "exercised" => stripped.convertTo[ExercisedTransactionEvent]
        case "archived"  => stripped.convertTo[ArchivedTransactionEvent]
        case other =>
          throw DeserializationException(s"Unknown TransactionEvent type: $other")
      }
    }
  }

  // -----------------------------------------------------------------------
  // Transaction Tree
  // -----------------------------------------------------------------------

  implicit val transactionTreeFormat: RootJsonFormat[TransactionTree] = jsonFormat7(TransactionTree)

  // -----------------------------------------------------------------------
  // Execution Trace
  // -----------------------------------------------------------------------

  implicit val executionTraceFormat: RootJsonFormat[ExecutionTrace] = jsonFormat6(ExecutionTrace)

  // -----------------------------------------------------------------------
  // Simulation Result
  // -----------------------------------------------------------------------

  implicit val simulationResultFormat: RootJsonFormat[SimulationResult] = jsonFormat7(SimulationResult)

  // -----------------------------------------------------------------------
  // Contract Info
  // -----------------------------------------------------------------------

  implicit val contractInfoFormat: RootJsonFormat[ContractInfo] = jsonFormat6(ContractInfo)

  // -----------------------------------------------------------------------
  // Package Detail and sub-types
  // -----------------------------------------------------------------------

  implicit val fieldDefinitionFormat: RootJsonFormat[FieldDefinition] = jsonFormat3(FieldDefinition)
  implicit val choiceDefinitionFormat: RootJsonFormat[ChoiceDefinition] = jsonFormat7(ChoiceDefinition)
  implicit val keyDefinitionFormat: RootJsonFormat[KeyDefinition] = jsonFormat3(KeyDefinition)
  implicit val interfaceDefinitionFormat: RootJsonFormat[InterfaceDefinition] = jsonFormat3(InterfaceDefinition)
  implicit val typeDefinitionFormat: RootJsonFormat[TypeDefinition] = jsonFormat5(TypeDefinition)
  implicit val templateDefinitionFormat: RootJsonFormat[TemplateDefinition] = jsonFormat10(TemplateDefinition)
  implicit val moduleDetailFormat: RootJsonFormat[ModuleDetail] = jsonFormat4(ModuleDetail)
  implicit val packageDetailFormat: RootJsonFormat[PackageDetail] = jsonFormat5(PackageDetail)

  // -----------------------------------------------------------------------
  // API Request / Response types
  // -----------------------------------------------------------------------

  implicit val commandRequestFormat: RootJsonFormat[CommandRequest] = jsonFormat4(CommandRequest)
  implicit val contractRequestFormat: RootJsonFormat[ContractRequest] = jsonFormat6(ContractRequest)
  implicit val traceRequestFormat: RootJsonFormat[TraceRequest] = jsonFormat6(TraceRequest)
  implicit val simulateRequestFormat: RootJsonFormat[SimulateRequest] = jsonFormat6(SimulateRequest)
  implicit val parseDalfRequestFormat: RootJsonFormat[ParseDalfRequest] = jsonFormat1(ParseDalfRequest)
  implicit val extractSourceRequestFormat: RootJsonFormat[ExtractSourceRequest] = jsonFormat1(ExtractSourceRequest)
  implicit val extractSourceResponseFormat: RootJsonFormat[ExtractSourceResponse] = jsonFormat2(ExtractSourceResponse)
  implicit val healthResponseFormat: RootJsonFormat[HealthResponse] = jsonFormat3(HealthResponse)

  // -----------------------------------------------------------------------
  // Helpers for Set serialization
  // -----------------------------------------------------------------------

  /**
   * spray-json handles Set[String] via the implicit collection format, but
   * we need to ensure ordering is stable for deterministic JSON output.
   * Override if needed for specific types.
   */
  implicit def immutableSetFormat[T: JsonFormat]: RootJsonFormat[Set[T]] = new RootJsonFormat[Set[T]] {
    override def write(set: Set[T]): JsValue = {
      JsArray(set.toSeq.map(_.toJson).toVector)
    }
    override def read(json: JsValue): Set[T] = json match {
      case JsArray(elements) => elements.map(_.convertTo[T]).toSet
      case other => throw DeserializationException(s"Expected JSON array for Set, got: $other")
    }
  }
}
