package cantontrace.model

/**
 * Core data model for execution trace steps.
 *
 * Each TraceStep represents a single observable event during Daml command
 * evaluation — a contract fetch, package resolution, authorization check,
 * guard evaluation, or ledger action. The collection of steps forms a
 * complete ExecutionTrace that the frontend renders as a step-through
 * debugging timeline.
 */

/** Source location from Daml-LF Location metadata. */
final case class SourceLocation(
  file: String,
  startLine: Int,
  startCol: Int,
  endLine: Int,
  endCol: Int
)

/** A single step in an execution trace. */
final case class TraceStep(
  stepNumber: Int,
  stepType: String,
  sourceLocation: Option[SourceLocation],
  summary: String,
  variables: Map[String, String],
  context: StepContext,
  passed: Boolean,
  error: Option[String]
)

// ---------------------------------------------------------------------------
// Step context variants
// ---------------------------------------------------------------------------

/**
 * Tagged union for the contextual detail attached to each trace step.
 * The sealed hierarchy lets us serialize each variant with a discriminator
 * field while keeping the Scala-side pattern matching exhaustive.
 */
sealed trait StepContext {
  def contextType: String
}

/** Context for a contract-fetch step. */
final case class FetchContext(
  contractId: String,
  payload: Option[Map[String, String]],
  found: Boolean
) extends StepContext {
  override val contextType: String = "fetch_contract"
}

/** Context for an authorization-check step. */
final case class AuthContext(
  required: Set[String],
  provided: Set[String]
) extends StepContext {
  override val contextType: String = "check_authorization"
}

/** Context for a guard/ensure evaluation step. */
final case class GuardContext(
  expression: String,
  result: Boolean,
  variables: Map[String, String]
) extends StepContext {
  override val contextType: String = "evaluate_guard"
}

/** Context for a ledger action (create / exercise / archive). */
final case class ActionContext(
  actionType: String,
  templateId: String,
  choice: Option[String],
  arguments: Map[String, String],
  resultContractId: Option[String]
) extends StepContext {
  override val contextType: String = "ledger_action"
}

/** Context for expression-level evaluation. */
final case class ExpressionContext(
  expressionType: String,
  variables: Map[String, String]
) extends StepContext {
  override val contextType: String = "evaluate_expression"
}

/** Context for a package-fetch step. */
final case class PackageFetchContext(
  packageId: String,
  found: Boolean
) extends StepContext {
  override val contextType: String = "fetch_package"
}

/** Placeholder context when detailed context is not available. */
final case class UnknownContext(
  detail: String
) extends StepContext {
  override val contextType: String = "unknown"
}
