package cantontrace.engine

import cantontrace.model._
import cantontrace.parser.DalfParser
import com.typesafe.scalalogging.LazyLogging

import java.time.Instant
import scala.collection.mutable

/**
 * Extended engine executor with deeper Speedy-machine instrumentation hooks.
 *
 * This class defines hook points for the Daml-LF Speedy machine.
 * The `traceInstrumented` method uses the real Daml-LF Engine
 * (via the parent class's `traceWithEngine`) and merges source files.
 *
 * Hook methods define the callback signatures for Speedy-machine events:
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
 *   2. Overriding with the real Speedy-machine callback in the engine.
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

    // Use the real Daml-LF Engine — no synthetic fallback
    require(realEngineAvailable, "Daml-LF Engine is not available on the classpath. Cannot trace.")
    val engineTrace = traceWithEngine(command, packages, contracts, disclosedContracts, actAs, readAs)
    engineTrace.copy(
      sourceFiles = sourceFiles,
      sourceAvailable = sourceFiles.nonEmpty
    )
  }

}
