package cantontrace.model

/**
 * The complete result of an instrumented Daml command execution.
 *
 * An ExecutionTrace captures every observable step that occurred during
 * evaluation, along with the resulting transaction (on success) or error
 * (on failure), the source files used for the code panel, and optional
 * profiler data in speedscope JSON format.
 */
final case class ExecutionTrace(
  /** Ordered sequence of evaluation steps. */
  steps: Seq[TraceStep],

  /**
   * Map of filename to source content.
   * When actual .daml source was extracted from the DAR this contains
   * the real source code (Tier 1). When source is unavailable the map
   * contains decompiled Daml-LF representation (Tier 2).
   */
  sourceFiles: Map[String, String],

  /** True when sourceFiles contain real .daml source (Tier 1). */
  sourceAvailable: Boolean,

  /** The resulting transaction tree, present only on successful evaluation. */
  resultTransaction: Option[TransactionTree],

  /** Top-level error message when the evaluation failed. */
  error: Option[String],

  /** Speedscope-format JSON blob when profiling is enabled. */
  profilerData: Option[String]
)

// ---------------------------------------------------------------------------
// Supporting types for the transaction result
// ---------------------------------------------------------------------------

/**
 * Simplified transaction tree representation.
 * The real Canton TransactionTree is a complex protobuf message; this is
 * a JSON-friendly projection for the frontend.
 */
final case class TransactionTree(
  updateId: String,
  commandId: Option[String],
  workflowId: Option[String],
  offset: Option[String],
  effectiveAt: Option[String],
  rootEventIds: Seq[String],
  eventsById: Map[String, TransactionEvent]
)

sealed trait TransactionEvent {
  def eventId: String
  def eventType: String
}

final case class CreatedTransactionEvent(
  eventId: String,
  contractId: String,
  templateId: String,
  payload: Map[String, String],
  signatories: Set[String],
  observers: Set[String]
) extends TransactionEvent {
  override val eventType: String = "created"
}

final case class ExercisedTransactionEvent(
  eventId: String,
  contractId: String,
  templateId: String,
  choice: String,
  choiceArgument: Map[String, String],
  actingParties: Set[String],
  consuming: Boolean,
  childEventIds: Seq[String],
  exerciseResult: Option[String]
) extends TransactionEvent {
  override val eventType: String = "exercised"
}

final case class ArchivedTransactionEvent(
  eventId: String,
  contractId: String,
  templateId: String
) extends TransactionEvent {
  override val eventType: String = "archived"
}
