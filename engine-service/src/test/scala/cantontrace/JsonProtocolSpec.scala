package cantontrace

import cantontrace.json.JsonProtocol._
import cantontrace.model._
import org.scalatest.flatspec.AnyFlatSpec
import org.scalatest.matchers.should.Matchers
import spray.json._

/**
 * Tests for JSON serialization/deserialization of all engine-service types.
 *
 * Each test verifies round-trip fidelity: serialize to JSON, parse back,
 * and confirm equality with the original.
 */
class JsonProtocolSpec extends AnyFlatSpec with Matchers {

  // -----------------------------------------------------------------------
  // SourceLocation
  // -----------------------------------------------------------------------

  "SourceLocation JSON" should "round-trip correctly" in {
    val loc = SourceLocation("Main.daml", 10, 5, 10, 25)
    val json = loc.toJson
    val parsed = json.convertTo[SourceLocation]
    parsed shouldBe loc
  }

  // -----------------------------------------------------------------------
  // StepContext variants
  // -----------------------------------------------------------------------

  "StepContext JSON" should "serialize FetchContext with contextType discriminator" in {
    val ctx: StepContext = FetchContext("contract-001", Some(Map("owner" -> "Alice")), found = true)
    val json = ctx.toJson.asJsObject
    json.fields("contextType") shouldBe JsString("fetch_contract")
    json.fields("contractId") shouldBe JsString("contract-001")
    json.fields("found") shouldBe JsTrue
  }

  it should "round-trip FetchContext" in {
    val ctx: StepContext = FetchContext("contract-001", Some(Map("owner" -> "Alice")), found = true)
    val json = ctx.toJson
    val parsed = json.convertTo[StepContext]
    parsed shouldBe ctx
  }

  it should "round-trip AuthContext" in {
    val ctx: StepContext = AuthContext(Set("Alice", "Bob"), Set("Alice"))
    val json = ctx.toJson
    val parsed = json.convertTo[StepContext]
    parsed shouldBe ctx
  }

  it should "round-trip GuardContext" in {
    val ctx: StepContext = GuardContext("amount > 0", result = true, Map("amount" -> "100"))
    val json = ctx.toJson
    val parsed = json.convertTo[StepContext]
    parsed shouldBe ctx
  }

  it should "round-trip ActionContext" in {
    val ctx: StepContext = ActionContext(
      actionType = "create",
      templateId = "Main:SimpleToken",
      choice = None,
      arguments = Map("owner" -> "Alice"),
      resultContractId = Some("new-contract-001")
    )
    val json = ctx.toJson
    val parsed = json.convertTo[StepContext]
    parsed shouldBe ctx
  }

  it should "round-trip ExpressionContext" in {
    val ctx: StepContext = ExpressionContext("application", Map("fn" -> "transfer", "arg" -> "newOwner"))
    val json = ctx.toJson
    val parsed = json.convertTo[StepContext]
    parsed shouldBe ctx
  }

  it should "round-trip PackageFetchContext" in {
    val ctx: StepContext = PackageFetchContext("pkg-abc123", found = true)
    val json = ctx.toJson
    val parsed = json.convertTo[StepContext]
    parsed shouldBe ctx
  }

  it should "round-trip UnknownContext" in {
    val ctx: StepContext = UnknownContext("some detail")
    val json = ctx.toJson
    val parsed = json.convertTo[StepContext]
    parsed shouldBe ctx
  }

  // -----------------------------------------------------------------------
  // TraceStep
  // -----------------------------------------------------------------------

  "TraceStep JSON" should "round-trip correctly" in {
    val step = TraceStep(
      stepNumber = 1,
      stepType = "fetch_contract",
      sourceLocation = Some(SourceLocation("Main.daml", 10, 3, 10, 30)),
      summary = "Fetch contract contract-001",
      variables = Map("contractId" -> "contract-001"),
      context = FetchContext("contract-001", Some(Map("owner" -> "Alice")), found = true),
      passed = true,
      error = None
    )
    val json = step.toJson
    val parsed = json.convertTo[TraceStep]
    parsed shouldBe step
  }

  it should "handle failing step with error" in {
    val step = TraceStep(
      stepNumber = 3,
      stepType = "check_authorization",
      sourceLocation = None,
      summary = "Authorization check FAILED",
      variables = Map.empty,
      context = AuthContext(Set("Bob"), Set("Alice")),
      passed = false,
      error = Some("Missing authorization for party: Bob")
    )
    val json = step.toJson
    val parsed = json.convertTo[TraceStep]
    parsed shouldBe step
  }

  // -----------------------------------------------------------------------
  // TransactionEvent variants
  // -----------------------------------------------------------------------

  "TransactionEvent JSON" should "serialize CreatedTransactionEvent with eventType" in {
    val event: TransactionEvent = CreatedTransactionEvent(
      eventId = "#tx1:0",
      contractId = "contract-001",
      templateId = "Main:SimpleToken",
      payload = Map("owner" -> "Alice"),
      signatories = Set("Alice"),
      observers = Set("Bob")
    )
    val json = event.toJson.asJsObject
    json.fields("eventType") shouldBe JsString("created")
  }

  it should "round-trip ExercisedTransactionEvent" in {
    val event: TransactionEvent = ExercisedTransactionEvent(
      eventId = "#tx1:0",
      contractId = "contract-001",
      templateId = "Main:SimpleToken",
      choice = "Transfer",
      choiceArgument = Map("newOwner" -> "Bob"),
      actingParties = Set("Alice"),
      consuming = true,
      childEventIds = Seq("#tx1:1", "#tx1:2"),
      exerciseResult = Some("ContractId(new-001)")
    )
    val json = event.toJson
    val parsed = json.convertTo[TransactionEvent]
    parsed shouldBe event
  }

  // -----------------------------------------------------------------------
  // ExecutionTrace
  // -----------------------------------------------------------------------

  "ExecutionTrace JSON" should "round-trip correctly" in {
    val trace = ExecutionTrace(
      steps = Seq(
        TraceStep(
          stepNumber = 1,
          stepType = "create_contract",
          sourceLocation = None,
          summary = "Create SimpleToken",
          variables = Map("owner" -> "Alice"),
          context = ActionContext("create", "Main:SimpleToken", None, Map("owner" -> "Alice"), Some("new-001")),
          passed = true,
          error = None
        )
      ),
      sourceFiles = Map("Main.daml" -> "module Main where"),
      sourceAvailable = true,
      resultTransaction = None,
      error = None,
      profilerData = None
    )
    val json = trace.toJson
    val parsed = json.convertTo[ExecutionTrace]
    parsed shouldBe trace
  }

  // -----------------------------------------------------------------------
  // SimulationResult
  // -----------------------------------------------------------------------

  "SimulationResult JSON" should "round-trip successful result" in {
    val result = SimulationResult(
      success = true,
      transactionTree = None,
      error = None,
      errorCategory = None,
      simulatedAt = "2026-04-02T10:00:00Z",
      atOffset = Some("1234"),
      stateDriftWarning = "Snapshot may have diverged"
    )
    val json = result.toJson
    val parsed = json.convertTo[SimulationResult]
    parsed shouldBe result
  }

  it should "round-trip failed result" in {
    val result = SimulationResult(
      success = false,
      transactionTree = None,
      error = Some("Contract not found"),
      errorCategory = Some("InvalidGivenCurrentSystemStateResourceMissing"),
      simulatedAt = "2026-04-02T10:00:00Z",
      atOffset = None,
      stateDriftWarning = "Snapshot may have diverged"
    )
    val json = result.toJson
    val parsed = json.convertTo[SimulationResult]
    parsed shouldBe result
  }

  // -----------------------------------------------------------------------
  // API request types
  // -----------------------------------------------------------------------

  "TraceRequest JSON" should "deserialize correctly" in {
    val json = """
      {
        "command": {
          "templateId": "Main:SimpleToken",
          "choice": "Transfer",
          "contractId": "contract-001",
          "arguments": {"newOwner": "Bob"}
        },
        "packages": {"pkg-001": "base64dalf"},
        "contracts": {
          "contract-001": {
            "contractId": "contract-001",
            "templateId": "Main:SimpleToken",
            "payload": {"owner": "Alice"},
            "signatories": ["Alice"],
            "observers": [],
            "contractKey": null
          }
        },
        "disclosedContracts": [],
        "actAs": ["Alice"],
        "readAs": []
      }
    """.parseJson

    val request = json.convertTo[TraceRequest]
    request.command.templateId shouldBe "Main:SimpleToken"
    request.command.choice shouldBe Some("Transfer")
    request.actAs shouldBe Set("Alice")
    request.contracts should have size 1
  }

  // -----------------------------------------------------------------------
  // PackageDetail
  // -----------------------------------------------------------------------

  "PackageDetail JSON" should "round-trip correctly" in {
    val pkg = PackageDetail(
      packageId = "abc123",
      packageName = Some("test-pkg"),
      packageVersion = Some("1.0.0"),
      modules = Seq(
        ModuleDetail(
          name = "Main",
          templates = Seq(
            TemplateDefinition(
              name = "Token",
              fields = Seq(FieldDefinition("owner", "Party", optional = false)),
              choices = Seq.empty,
              key = None,
              signatoryExpression = "owner",
              observerExpression = "owner",
              ensureExpression = None,
              implements = Seq.empty,
              sourceCode = None,
              decompiledLF = None
            )
          ),
          interfaces = Seq.empty,
          typeDefinitions = Seq.empty
        )
      ),
      hasSource = false
    )
    val json = pkg.toJson
    val parsed = json.convertTo[PackageDetail]
    parsed shouldBe pkg
  }

  // -----------------------------------------------------------------------
  // HealthResponse
  // -----------------------------------------------------------------------

  "HealthResponse JSON" should "serialize correctly" in {
    val health = HealthResponse("ok", "0.1.0", 3600)
    val json = health.toJson.asJsObject
    json.fields("status") shouldBe JsString("ok")
    json.fields("engineVersion") shouldBe JsString("0.1.0")
    json.fields("uptime") shouldBe JsNumber(3600)
  }
}
