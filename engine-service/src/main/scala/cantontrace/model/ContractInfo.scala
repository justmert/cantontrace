package cantontrace.model

/**
 * Represents an active contract supplied to the engine for execution.
 *
 * This is the engine-service's internal view of a contract — it carries
 * enough information for the Daml-LF engine to evaluate commands that
 * reference the contract, plus metadata for trace display.
 */
final case class ContractInfo(
  /** The opaque contract identifier. */
  contractId: String,

  /** Fully-qualified template identifier: "PackageName:Module:Entity". */
  templateId: String,

  /** Decoded payload as a flat string map (for JSON transport). */
  payload: Map[String, String],

  /** Signatory parties. */
  signatories: Set[String],

  /** Observer parties. */
  observers: Set[String],

  /** Optional contract key. */
  contractKey: Option[Map[String, String]]
)
