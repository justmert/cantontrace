package cantontrace.model

/**
 * The result of a command simulation (no instrumentation, faster path).
 *
 * Simulations execute commands against a provided ACS snapshot without
 * recording step-by-step trace data. This is the response model for the
 * `/simulate` endpoint.
 */
final case class SimulationResult(
  /** Whether the simulation succeeded without errors. */
  success: Boolean,

  /** The predicted transaction tree, present when success is true. */
  transactionTree: Option[TransactionTree],

  /** Error description when the simulation failed. */
  error: Option[String],

  /** Detailed error category when an error is present. */
  errorCategory: Option[String],

  /** ISO-8601 timestamp when the simulation was performed. */
  simulatedAt: String,

  /** The ledger offset the ACS snapshot was taken at. */
  atOffset: Option[String],

  /**
   * Warning about possible state drift between the ACS snapshot and
   * the live ledger. Always present because simulation uses a
   * point-in-time snapshot.
   */
  stateDriftWarning: String
)
