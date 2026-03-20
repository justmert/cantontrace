package cantontrace.engine

import cantontrace.model._
import com.typesafe.scalalogging.LazyLogging

import java.time.Instant
import scala.collection.mutable

/**
 * Extended engine executor with deeper Speedy-machine instrumentation hooks.
 *
 * This class scaffolds the hook points that the forked `daml-lf-engine` will
 * expose. When the standard (unforked) engine is used, these hooks simulate
 * deeper tracing by synthesizing additional trace steps from the available
 * Result-monad data and the Daml-LF AST.
 *
 * The `traceInstrumented` method first attempts to use the real Daml-LF
 * Engine (via the parent class's `traceWithEngine`). If the engine classes
 * are not on the classpath or the invocation fails, it falls back to
 * synthetic Speedy-machine simulation.
 *
 * Once the fork is available, each hook method will delegate to actual
 * Speedy-machine callbacks:
 *
 *   - `onExpressionEvaluated`: fires on each Speedy CEK-machine step with
 *     the current source location (`machine.getLastLocation`), expression
 *     type, and bound variable values.
 *
 *   - `onAuthorizationCheck`: fires when the engine evaluates signatory /
 *     observer / controller expressions, capturing required vs. provided
 *     authority sets.
 *
 *   - `onGuardEvaluation`: fires when an `ensure` clause or explicit
 *     `assert` is evaluated, capturing the boolean expression, its result,
 *     and the variables in scope.
 *
 *   - `onLedgerAction`: fires on each ledger action (create, exercise,
 *     archive), capturing the action type, template/choice, full decoded
 *     arguments, and resulting contract IDs.
 *
 *   - `onContractFetch`: fires when the engine requests a contract by ID,
 *     capturing whether it was found in the ACS or among disclosed contracts.
 *
 *   - `onPackageLookup`: fires when the engine requests a package by ID.
 *
 * Architecture note: this class is designed as a clear extension point.
 * Adding a new hook requires only:
 *   1. Defining the callback signature in the trait below.
 *   2. Implementing the synthetic version here.
 *   3. Overriding with the real Speedy-machine callback in the fork.
 */
class InstrumentedEngine extends EngineExecutor with LazyLogging {

  // -----------------------------------------------------------------------
  // Hook trait — to be implemented by the forked engine
  // -----------------------------------------------------------------------

  /**
   * Trait defining all instrumentation hook points.
   * The forked engine will provide a concrete implementation that wires
   * these callbacks into the Speedy machine's evaluation loop.
   */
  trait SpeedyHooks {
    def onExpressionEvaluated(
      location: Option[SourceLocation],
      expressionType: String,
      variables: Map[String, String]
    ): Unit

    def onAuthorizationCheck(
      location: Option[SourceLocation],
      required: Set[String],
      provided: Set[String],
      passed: Boolean
    ): Unit

    def onGuardEvaluation(
      location: Option[SourceLocation],
      expression: String,
      result: Boolean,
      variables: Map[String, String]
    ): Unit

    def onLedgerAction(
      location: Option[SourceLocation],
      actionType: String,
      templateId: String,
      choice: Option[String],
      arguments: Map[String, String],
      resultContractId: Option[String]
    ): Unit

    def onContractFetch(
      contractId: String,
      payload: Option[Map[String, String]],
      found: Boolean,
      source: String
    ): Unit

    def onPackageLookup(
      packageId: String,
      found: Boolean
    ): Unit
  }

  // -----------------------------------------------------------------------
  // Collecting hooks implementation — stores steps in a buffer
  // -----------------------------------------------------------------------

  /**
   * A SpeedyHooks implementation that collects all hook invocations into
   * an ordered buffer of TraceSteps.
   */
  class CollectingHooks extends SpeedyHooks {
    private val _steps = mutable.ArrayBuffer[TraceStep]()
    private var _stepCounter = 0
    private var _truncated = false

    def steps: Seq[TraceStep] = _steps.toSeq
    def stepCount: Int = _stepCounter
    def truncated: Boolean = _truncated

    private def nextStep(): Int = {
      _stepCounter += 1
      if (_stepCounter > maxTraceSteps) {
        _truncated = true
        logger.warn(s"Trace step limit reached ($maxTraceSteps), further steps will be dropped")
      }
      _stepCounter
    }

    override def onExpressionEvaluated(
      location: Option[SourceLocation],
      expressionType: String,
      variables: Map[String, String]
    ): Unit = {
      if (_truncated) return
      _steps += TraceStep(
        stepNumber = nextStep(),
        stepType = "evaluate_expression",
        sourceLocation = location,
        summary = s"Evaluate $expressionType",
        variables = variables,
        context = ExpressionContext(expressionType = expressionType, variables = variables),
        passed = true,
        error = None
      )
    }

    override def onAuthorizationCheck(
      location: Option[SourceLocation],
      required: Set[String],
      provided: Set[String],
      passed: Boolean
    ): Unit = {
      if (_truncated) return
      val missing = required -- provided
      _steps += TraceStep(
        stepNumber = nextStep(),
        stepType = "check_authorization",
        sourceLocation = location,
        summary = if (passed) {
          s"Authorization check passed: ${required.mkString(", ")}"
        } else {
          s"Authorization check FAILED: missing ${missing.mkString(", ")}"
        },
        variables = Map(
          "required" -> required.mkString(", "),
          "provided" -> provided.mkString(", ")
        ),
        context = AuthContext(required = required, provided = provided),
        passed = passed,
        error = if (!passed) Some(s"Missing authorization for parties: ${missing.mkString(", ")}") else None
      )
    }

    override def onGuardEvaluation(
      location: Option[SourceLocation],
      expression: String,
      result: Boolean,
      variables: Map[String, String]
    ): Unit = {
      if (_truncated) return
      _steps += TraceStep(
        stepNumber = nextStep(),
        stepType = "evaluate_guard",
        sourceLocation = location,
        summary = if (result) s"Guard passed: $expression" else s"Guard FAILED: $expression",
        variables = variables,
        context = GuardContext(expression = expression, result = result, variables = variables),
        passed = result,
        error = if (!result) Some(s"Ensure clause evaluated to False: $expression") else None
      )
    }

    override def onLedgerAction(
      location: Option[SourceLocation],
      actionType: String,
      templateId: String,
      choice: Option[String],
      arguments: Map[String, String],
      resultContractId: Option[String]
    ): Unit = {
      if (_truncated) return
      val stepType = actionType match {
        case "create"   => "create_contract"
        case "exercise" => "exercise_choice"
        case "archive"  => "archive_contract"
        case other      => other
      }
      _steps += TraceStep(
        stepNumber = nextStep(),
        stepType = stepType,
        sourceLocation = location,
        summary = s"${actionType.capitalize} ${choice.map(c => s"$c on ").getOrElse("")}$templateId",
        variables = arguments,
        context = ActionContext(
          actionType = actionType,
          templateId = templateId,
          choice = choice,
          arguments = arguments,
          resultContractId = resultContractId
        ),
        passed = true,
        error = None
      )
    }

    override def onContractFetch(
      contractId: String,
      payload: Option[Map[String, String]],
      found: Boolean,
      source: String
    ): Unit = {
      if (_truncated) return
      _steps += TraceStep(
        stepNumber = nextStep(),
        stepType = "fetch_contract",
        sourceLocation = None,
        summary = s"Fetch contract $contractId (source: $source, found: $found)",
        variables = Map("contractId" -> contractId, "source" -> source),
        context = FetchContext(contractId = contractId, payload = payload, found = found),
        passed = found,
        error = if (!found) Some(s"Contract $contractId not found") else None
      )
    }

    override def onPackageLookup(
      packageId: String,
      found: Boolean
    ): Unit = {
      if (_truncated) return
      _steps += TraceStep(
        stepNumber = nextStep(),
        stepType = "fetch_package",
        sourceLocation = None,
        summary = s"Lookup package $packageId (found: $found)",
        variables = Map("packageId" -> packageId),
        context = PackageFetchContext(packageId = packageId, found = found),
        passed = found,
        error = if (!found) Some(s"Package $packageId not found") else None
      )
    }
  }

  // -----------------------------------------------------------------------
  // Enhanced trace using hooks
  // -----------------------------------------------------------------------

  /**
   * Execute a command with deeper instrumentation using SpeedyHooks.
   *
   * This method first attempts to use the real Daml-LF Engine via the parent
   * class's `traceWithEngine`. If the real engine is unavailable or fails,
   * it falls back to synthetic Speedy-machine simulation using hooks.
   *
   * With the forked engine, the hooks fire from inside the Speedy machine
   * and capture expression-level detail.
   */
  def traceInstrumented(
    command: CommandRequest,
    packages: Map[String, String],
    contracts: Map[String, ContractInfo],
    disclosedContracts: Seq[ContractInfo],
    actAs: Set[String],
    readAs: Set[String],
    sourceFiles: Map[String, String]
  ): ExecutionTrace = {
    logger.info(
      s"Instrumented trace: template=${command.templateId}, " +
      s"choice=${command.choice.getOrElse("Create")}, " +
      s"source files available=${sourceFiles.nonEmpty}"
    )

    // Attempt the real engine path first
    if (realEngineAvailable) {
      try {
        val engineTrace = traceWithEngine(command, packages, contracts, disclosedContracts, actAs, readAs)
        // Merge source files into the engine-produced trace
        return engineTrace.copy(
          sourceFiles = sourceFiles,
          sourceAvailable = sourceFiles.nonEmpty
        )
      } catch {
        case ex: Exception =>
          logger.warn(
            s"Real engine traceInstrumented failed, falling back to synthetic hooks: ${ex.getMessage}"
          )
      }
    }

    // Fallback: synthetic Speedy-machine simulation using hooks
    traceInstrumentedSynthetic(command, packages, contracts, disclosedContracts, actAs, readAs, sourceFiles)
  }

  /**
   * Synthetic instrumented trace — the original hook-based implementation.
   *
   * Used as a fallback when the real Daml-LF Engine is not available.
   */
  private[engine] def traceInstrumentedSynthetic(
    command: CommandRequest,
    packages: Map[String, String],
    contracts: Map[String, ContractInfo],
    disclosedContracts: Seq[ContractInfo],
    actAs: Set[String],
    readAs: Set[String],
    sourceFiles: Map[String, String]
  ): ExecutionTrace = {
    val hooks = new CollectingHooks()
    val startTime = System.nanoTime()

    try {
      // Simulate the Speedy machine evaluation steps using hooks
      simulateSpeedyEvaluation(command, packages, contracts, disclosedContracts, actAs, readAs, hooks)

      val hasFailure = hooks.steps.exists(!_.passed)
      val error = hooks.steps.find(!_.passed).flatMap(_.error)

      val resultTx = if (!hasFailure) {
        Some(buildSimulatedTransaction(command, contracts, disclosedContracts))
      } else None

      val durationMs = (System.nanoTime() - startTime) / 1000000
      logger.info(
        s"Instrumented trace completed (synthetic) in ${durationMs}ms: ${hooks.stepCount} steps, " +
        s"error=${error.isDefined}"
      )

      ExecutionTrace(
        steps = hooks.steps,
        sourceFiles = sourceFiles,
        sourceAvailable = sourceFiles.nonEmpty,
        resultTransaction = resultTx,
        error = error,
        profilerData = None
      )
    } catch {
      case ex: Exception =>
        logger.error(s"Instrumented trace (synthetic) failed: ${ex.getMessage}", ex)
        ExecutionTrace(
          steps = hooks.steps,
          sourceFiles = sourceFiles,
          sourceAvailable = sourceFiles.nonEmpty,
          resultTransaction = None,
          error = Some(s"Engine error: ${ex.getMessage}"),
          profilerData = None
        )
    }
  }

  // -----------------------------------------------------------------------
  // Speedy machine simulation
  // -----------------------------------------------------------------------

  /**
   * Simulates the sequence of Speedy machine evaluation steps by firing
   * hooks in the order the real engine would during command processing.
   *
   * This synthetic sequence mirrors the actual evaluation order:
   *   1. Package lookups for all referenced packages
   *   2. For Exercise: contract fetch, authorization check
   *   3. Template body / choice body expression evaluation
   *   4. Guard (ensure clause) evaluation
   *   5. Ledger actions (create / exercise / archive)
   *
   * The forked engine replaces this method entirely — the hooks fire
   * from genuine Speedy machine callbacks instead.
   */
  private def simulateSpeedyEvaluation(
    command: CommandRequest,
    packages: Map[String, String],
    contracts: Map[String, ContractInfo],
    disclosedContracts: Seq[ContractInfo],
    actAs: Set[String],
    readAs: Set[String],
    hooks: CollectingHooks
  ): Unit = {
    // 1. Package lookups
    packages.keys.foreach { pkgId =>
      hooks.onPackageLookup(pkgId, found = true)
    }

    // 2. Expression evaluation — command interpretation begins
    hooks.onExpressionEvaluated(
      location = None,
      expressionType = "command_interpretation",
      variables = Map(
        "templateId" -> command.templateId,
        "commandType" -> command.choice.map(_ => "exercise").getOrElse("create")
      )
    )

    // 3. For Exercise commands: fetch contract and check auth
    command.contractId.foreach { cid =>
      val contract = contracts.get(cid).orElse(disclosedContracts.find(_.contractId == cid))
      val source = contract match {
        case Some(_) if contracts.contains(cid) => "ACS"
        case Some(_) => "disclosed"
        case None => "not_found"
      }

      hooks.onContractFetch(
        contractId = cid,
        payload = contract.map(_.payload),
        found = contract.isDefined,
        source = source
      )

      if (contract.isEmpty) return // Early termination on missing contract

      // Authorization check
      val required = contract.get.signatories
      val provided = actAs
      hooks.onAuthorizationCheck(
        location = None,
        required = required,
        provided = provided,
        passed = required.subsetOf(provided)
      )

      if (!required.subsetOf(provided)) return // Early termination on auth failure
    }

    // 4. Evaluate choice/template body
    hooks.onExpressionEvaluated(
      location = None,
      expressionType = command.choice match {
        case Some(choice) => s"choice_body($choice)"
        case None => "template_body"
      },
      variables = command.arguments
    )

    // 5. Guard (ensure) evaluation
    hooks.onGuardEvaluation(
      location = None,
      expression = "ensure <clause>",
      result = true,
      variables = command.arguments
    )

    // 6. Ledger actions
    command.choice match {
      case Some(choice) =>
        // Exercise produces: exercise event + potential create + archive of consumed
        val newContractId = s"00${java.util.UUID.randomUUID().toString.replace("-", "").take(32)}"

        hooks.onLedgerAction(
          location = None,
          actionType = "exercise",
          templateId = command.templateId,
          choice = Some(choice),
          arguments = command.arguments,
          resultContractId = Some(newContractId)
        )

        hooks.onLedgerAction(
          location = None,
          actionType = "create",
          templateId = command.templateId,
          choice = None,
          arguments = command.arguments,
          resultContractId = Some(newContractId)
        )

        hooks.onLedgerAction(
          location = None,
          actionType = "archive",
          templateId = command.templateId,
          choice = Some(choice),
          arguments = Map.empty,
          resultContractId = command.contractId
        )

      case None =>
        // Create produces: a single create event
        val newContractId = s"00${java.util.UUID.randomUUID().toString.replace("-", "").take(32)}"
        hooks.onLedgerAction(
          location = None,
          actionType = "create",
          templateId = command.templateId,
          choice = None,
          arguments = command.arguments,
          resultContractId = Some(newContractId)
        )
    }
  }

  private def buildSimulatedTransaction(
    command: CommandRequest,
    contracts: Map[String, ContractInfo],
    disclosedContracts: Seq[ContractInfo]
  ): TransactionTree = {
    val txId = s"tx-${java.util.UUID.randomUUID().toString.take(8)}"
    val now = Instant.now().toString

    command.choice match {
      case Some(choice) =>
        val exerciseEventId = s"#$txId:0"
        val createEventId = s"#$txId:1"
        val newContractId = s"00${java.util.UUID.randomUUID().toString.replace("-", "").take(32)}"
        val targetContract = command.contractId.flatMap(cid =>
          contracts.get(cid).orElse(disclosedContracts.find(_.contractId == cid))
        )

        TransactionTree(
          updateId = txId,
          commandId = Some(s"cmd-${txId.takeRight(8)}"),
          workflowId = None,
          offset = None,
          effectiveAt = Some(now),
          rootEventIds = Seq(exerciseEventId),
          eventsById = Map(
            exerciseEventId -> ExercisedTransactionEvent(
              eventId = exerciseEventId,
              contractId = command.contractId.getOrElse(""),
              templateId = command.templateId,
              choice = choice,
              choiceArgument = command.arguments,
              actingParties = targetContract.map(_.signatories).getOrElse(Set.empty),
              consuming = true,
              childEventIds = Seq(createEventId),
              exerciseResult = Some(s"ContractId($newContractId)")
            ),
            createEventId -> CreatedTransactionEvent(
              eventId = createEventId,
              contractId = newContractId,
              templateId = command.templateId,
              payload = command.arguments,
              signatories = targetContract.map(_.signatories).getOrElse(Set.empty),
              observers = targetContract.map(_.observers).getOrElse(Set.empty)
            )
          )
        )

      case None =>
        val eventId = s"#$txId:0"
        val newContractId = s"00${java.util.UUID.randomUUID().toString.replace("-", "").take(32)}"

        TransactionTree(
          updateId = txId,
          commandId = Some(s"cmd-${txId.takeRight(8)}"),
          workflowId = None,
          offset = None,
          effectiveAt = Some(now),
          rootEventIds = Seq(eventId),
          eventsById = Map(
            eventId -> CreatedTransactionEvent(
              eventId = eventId,
              contractId = newContractId,
              templateId = command.templateId,
              payload = command.arguments,
              signatories = Set.empty,
              observers = Set.empty
            )
          )
        )
    }
  }
}
