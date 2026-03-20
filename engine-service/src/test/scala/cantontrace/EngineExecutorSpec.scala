package cantontrace

import cantontrace.engine.{EngineExecutor, InstrumentedEngine}
import cantontrace.model._
import org.scalatest.flatspec.AnyFlatSpec
import org.scalatest.matchers.should.Matchers

/**
 * Unit tests for the EngineExecutor and InstrumentedEngine.
 *
 * These tests exercise the engine's trace and simulation logic using
 * synthetic inputs (no Daml SDK required on the classpath). They verify
 * the step generation, error handling, and authorization checking logic.
 */
class EngineExecutorSpec extends AnyFlatSpec with Matchers {

  private val executor = new EngineExecutor()
  private val instrumentedEngine = new InstrumentedEngine()

  // -----------------------------------------------------------------------
  // Test data
  // -----------------------------------------------------------------------

  private val aliceContract = ContractInfo(
    contractId = "contract-001",
    templateId = "TestPkg:Main:SimpleToken",
    payload = Map("owner" -> "Alice", "amount" -> "100", "description" -> "Test token"),
    signatories = Set("Alice"),
    observers = Set("Bob"),
    contractKey = None
  )

  private val bobContract = ContractInfo(
    contractId = "contract-002",
    templateId = "TestPkg:Main:SimpleToken",
    payload = Map("owner" -> "Bob", "amount" -> "50", "description" -> "Bob token"),
    signatories = Set("Bob"),
    observers = Set.empty,
    contractKey = None
  )

  private val contracts: Map[String, ContractInfo] = Map(
    "contract-001" -> aliceContract,
    "contract-002" -> bobContract
  )

  private val packages: Map[String, String] = Map(
    "pkg-001" -> "base64encodeddalfbytes"
  )

  // -----------------------------------------------------------------------
  // trace: Create command
  // -----------------------------------------------------------------------

  "EngineExecutor.trace" should "produce a trace for a Create command" in {
    val command = CommandRequest(
      templateId = "TestPkg:Main:SimpleToken",
      choice = None,
      contractId = None,
      arguments = Map("owner" -> "Alice", "amount" -> "200", "description" -> "New token")
    )

    val trace = executor.trace(
      command = command,
      packages = packages,
      contracts = contracts,
      disclosedContracts = Seq.empty,
      actAs = Set("Alice"),
      readAs = Set.empty
    )

    trace.error shouldBe None
    trace.steps should not be empty
    trace.resultTransaction shouldBe defined
    trace.resultTransaction.get.rootEventIds should have size 1

    // Should have: validate, package fetch, evaluate, guard, create
    trace.steps.count(_.stepType == "evaluate_expression") should be >= 1
    trace.steps.count(_.stepType == "fetch_package") should be >= 1
    trace.steps.count(_.stepType == "create_contract") shouldBe 1
    trace.steps.count(_.stepType == "evaluate_guard") shouldBe 1

    // All steps should pass
    trace.steps.forall(_.passed) shouldBe true
  }

  // -----------------------------------------------------------------------
  // trace: Exercise command
  // -----------------------------------------------------------------------

  it should "produce a trace for an Exercise command" in {
    val command = CommandRequest(
      templateId = "TestPkg:Main:SimpleToken",
      choice = Some("Transfer"),
      contractId = Some("contract-001"),
      arguments = Map("newOwner" -> "Charlie")
    )

    val trace = executor.trace(
      command = command,
      packages = packages,
      contracts = contracts,
      disclosedContracts = Seq.empty,
      actAs = Set("Alice"),
      readAs = Set.empty
    )

    trace.error shouldBe None
    trace.steps should not be empty
    trace.resultTransaction shouldBe defined

    // Should have: validate, package fetch, contract fetch, auth check, exercise, guard, archive
    trace.steps.count(_.stepType == "fetch_contract") should be >= 1
    trace.steps.count(_.stepType == "check_authorization") shouldBe 1
    trace.steps.count(_.stepType == "exercise_choice") shouldBe 1
    trace.steps.count(_.stepType == "archive_contract") shouldBe 1

    // All steps should pass
    trace.steps.forall(_.passed) shouldBe true
  }

  // -----------------------------------------------------------------------
  // trace: Missing contract
  // -----------------------------------------------------------------------

  it should "fail with clear error when target contract is missing" in {
    val command = CommandRequest(
      templateId = "TestPkg:Main:SimpleToken",
      choice = Some("Transfer"),
      contractId = Some("nonexistent-contract"),
      arguments = Map("newOwner" -> "Charlie")
    )

    val trace = executor.trace(
      command = command,
      packages = packages,
      contracts = contracts,
      disclosedContracts = Seq.empty,
      actAs = Set("Alice"),
      readAs = Set.empty
    )

    trace.error shouldBe defined
    trace.error.get should include("not found")

    // Should have a failing fetch_contract step
    val fetchSteps = trace.steps.filter(_.stepType == "fetch_contract")
    fetchSteps should not be empty
    fetchSteps.last.passed shouldBe false
    fetchSteps.last.error shouldBe defined
  }

  // -----------------------------------------------------------------------
  // trace: Authorization failure
  // -----------------------------------------------------------------------

  it should "fail with authorization error when parties don't match" in {
    val command = CommandRequest(
      templateId = "TestPkg:Main:SimpleToken",
      choice = Some("Transfer"),
      contractId = Some("contract-002"), // Bob's contract
      arguments = Map("newOwner" -> "Charlie")
    )

    val trace = executor.trace(
      command = command,
      packages = packages,
      contracts = contracts,
      disclosedContracts = Seq.empty,
      actAs = Set("Alice"), // Alice cannot act on Bob's contract
      readAs = Set.empty
    )

    trace.error shouldBe defined

    // Should have a failing authorization step
    val authSteps = trace.steps.filter(_.stepType == "check_authorization")
    authSteps should not be empty
    authSteps.last.passed shouldBe false
    authSteps.last.error.get should include("Bob")
  }

  // -----------------------------------------------------------------------
  // trace: Disclosed contracts
  // -----------------------------------------------------------------------

  it should "find contracts from disclosed contracts" in {
    val disclosedContract = ContractInfo(
      contractId = "disclosed-001",
      templateId = "TestPkg:Main:SimpleToken",
      payload = Map("owner" -> "Alice", "amount" -> "500"),
      signatories = Set("Alice"),
      observers = Set.empty,
      contractKey = None
    )

    val command = CommandRequest(
      templateId = "TestPkg:Main:SimpleToken",
      choice = Some("Transfer"),
      contractId = Some("disclosed-001"),
      arguments = Map("newOwner" -> "Bob")
    )

    val trace = executor.trace(
      command = command,
      packages = packages,
      contracts = contracts,
      disclosedContracts = Seq(disclosedContract),
      actAs = Set("Alice"),
      readAs = Set.empty
    )

    trace.error shouldBe None

    // The fetch step should indicate "disclosed" source
    val fetchSteps = trace.steps.filter(_.stepType == "fetch_contract")
    fetchSteps should not be empty
    fetchSteps.head.summary should include("disclosed")
  }

  // -----------------------------------------------------------------------
  // trace: Validation errors
  // -----------------------------------------------------------------------

  it should "fail when templateId is empty" in {
    val command = CommandRequest(
      templateId = "",
      choice = None,
      contractId = None,
      arguments = Map.empty
    )

    val trace = executor.trace(
      command = command,
      packages = packages,
      contracts = contracts,
      disclosedContracts = Seq.empty,
      actAs = Set("Alice"),
      readAs = Set.empty
    )

    trace.error shouldBe defined
    trace.error.get should include("templateId")
  }

  it should "fail when actAs is empty" in {
    val command = CommandRequest(
      templateId = "TestPkg:Main:SimpleToken",
      choice = None,
      contractId = None,
      arguments = Map("owner" -> "Alice")
    )

    val trace = executor.trace(
      command = command,
      packages = packages,
      contracts = contracts,
      disclosedContracts = Seq.empty,
      actAs = Set.empty,
      readAs = Set.empty
    )

    trace.error shouldBe defined
    trace.error.get should include("actAs")
  }

  it should "fail when Exercise command is missing contractId" in {
    val command = CommandRequest(
      templateId = "TestPkg:Main:SimpleToken",
      choice = Some("Transfer"),
      contractId = None,
      arguments = Map("newOwner" -> "Bob")
    )

    val trace = executor.trace(
      command = command,
      packages = packages,
      contracts = contracts,
      disclosedContracts = Seq.empty,
      actAs = Set("Alice"),
      readAs = Set.empty
    )

    trace.error shouldBe defined
    trace.error.get should include("contractId")
  }

  // -----------------------------------------------------------------------
  // simulate: Success
  // -----------------------------------------------------------------------

  "EngineExecutor.simulate" should "return success for valid Create command" in {
    val command = CommandRequest(
      templateId = "TestPkg:Main:SimpleToken",
      choice = None,
      contractId = None,
      arguments = Map("owner" -> "Alice", "amount" -> "100")
    )

    val result = executor.simulate(
      command = command,
      packages = packages,
      contracts = contracts,
      disclosedContracts = Seq.empty,
      actAs = Set("Alice"),
      readAs = Set.empty
    )

    result.success shouldBe true
    result.transactionTree shouldBe defined
    result.error shouldBe None
    result.stateDriftWarning should not be empty
  }

  it should "return failure for missing contract" in {
    val command = CommandRequest(
      templateId = "TestPkg:Main:SimpleToken",
      choice = Some("Transfer"),
      contractId = Some("nonexistent"),
      arguments = Map("newOwner" -> "Bob")
    )

    val result = executor.simulate(
      command = command,
      packages = packages,
      contracts = contracts,
      disclosedContracts = Seq.empty,
      actAs = Set("Alice"),
      readAs = Set.empty
    )

    result.success shouldBe false
    result.error shouldBe defined
    result.errorCategory shouldBe Some("InvalidGivenCurrentSystemStateResourceMissing")
  }

  // -----------------------------------------------------------------------
  // InstrumentedEngine: Enhanced trace
  // -----------------------------------------------------------------------

  "InstrumentedEngine.traceInstrumented" should "produce detailed hook-based trace" in {
    val command = CommandRequest(
      templateId = "TestPkg:Main:SimpleToken",
      choice = Some("Transfer"),
      contractId = Some("contract-001"),
      arguments = Map("newOwner" -> "Charlie")
    )

    val trace = instrumentedEngine.traceInstrumented(
      command = command,
      packages = packages,
      contracts = contracts,
      disclosedContracts = Seq.empty,
      actAs = Set("Alice"),
      readAs = Set.empty,
      sourceFiles = Map("Main.daml" -> "-- test source content")
    )

    trace.error shouldBe None
    trace.sourceAvailable shouldBe true
    trace.sourceFiles should contain key "Main.daml"
    trace.steps should not be empty

    // Instrumented trace should have more detailed steps
    trace.steps.count(_.stepType == "fetch_package") should be >= 1
    trace.steps.count(_.stepType == "evaluate_expression") should be >= 1
    trace.steps.count(_.stepType == "fetch_contract") should be >= 1
    trace.steps.count(_.stepType == "check_authorization") shouldBe 1
    trace.steps.count(_.stepType == "evaluate_guard") shouldBe 1
    // Exercise should produce: exercise + create + archive actions
    trace.steps.count(_.stepType == "exercise_choice") shouldBe 1
    trace.steps.count(_.stepType == "create_contract") shouldBe 1
    trace.steps.count(_.stepType == "archive_contract") shouldBe 1

    // All steps should pass for this valid command
    trace.steps.forall(_.passed) shouldBe true
  }

  it should "capture authorization failure in hooks" in {
    val command = CommandRequest(
      templateId = "TestPkg:Main:SimpleToken",
      choice = Some("Transfer"),
      contractId = Some("contract-002"), // Bob's contract
      arguments = Map("newOwner" -> "Charlie")
    )

    val trace = instrumentedEngine.traceInstrumented(
      command = command,
      packages = packages,
      contracts = contracts,
      disclosedContracts = Seq.empty,
      actAs = Set("Alice"), // Cannot act as Bob
      readAs = Set.empty,
      sourceFiles = Map.empty
    )

    // Should have a failing auth step
    val failedSteps = trace.steps.filter(!_.passed)
    failedSteps should not be empty

    val authFailure = failedSteps.find(_.stepType == "check_authorization")
    authFailure shouldBe defined
    authFailure.get.error.get should include("Bob")
  }
}
