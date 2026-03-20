package cantontrace.model

/**
 * Request / response types for the engine-service HTTP API.
 *
 * These are the JSON-serializable DTOs that cross the HTTP boundary.
 * Internal engine types are converted to/from these at the route layer.
 */

// ---------------------------------------------------------------------------
// Trace endpoint
// ---------------------------------------------------------------------------

final case class TraceRequest(
  /** Serialized Daml command. */
  command: CommandRequest,
  /** Base64-encoded DALF bytes keyed by package ID. */
  packages: Map[String, String],
  /** Active contracts as JSON, keyed by contract ID. */
  contracts: Map[String, ContractRequest],
  /** Additional disclosed contracts. */
  disclosedContracts: Seq[ContractRequest],
  /** Parties acting on this command. */
  actAs: Set[String],
  /** Parties with read-only access. */
  readAs: Set[String]
)

final case class CommandRequest(
  /** Fully-qualified template identifier. */
  templateId: String,
  /** Choice name — None for a Create command. */
  choice: Option[String],
  /** Target contract ID — required for Exercise/Archive commands. */
  contractId: Option[String],
  /** Command arguments as a JSON-friendly string map. */
  arguments: Map[String, String]
)

final case class ContractRequest(
  contractId: String,
  templateId: String,
  payload: Map[String, String],
  signatories: Set[String],
  observers: Set[String],
  contractKey: Option[Map[String, String]]
)

// ---------------------------------------------------------------------------
// Simulate endpoint
// ---------------------------------------------------------------------------

final case class SimulateRequest(
  command: CommandRequest,
  packages: Map[String, String],
  contracts: Map[String, ContractRequest],
  disclosedContracts: Seq[ContractRequest],
  actAs: Set[String],
  readAs: Set[String]
)

// ---------------------------------------------------------------------------
// Parse-DALF endpoint
// ---------------------------------------------------------------------------

final case class ParseDalfRequest(
  /** Base64-encoded DALF bytes. */
  dalfBytes: String
)

// ---------------------------------------------------------------------------
// Extract-source endpoint
// ---------------------------------------------------------------------------

final case class ExtractSourceRequest(
  /** Base64-encoded DAR (ZIP) bytes. */
  darBytes: String
)

final case class ExtractSourceResponse(
  packageId: Option[String],
  sources: Map[String, String]
)

// ---------------------------------------------------------------------------
// Health endpoint
// ---------------------------------------------------------------------------

final case class HealthResponse(
  status: String,
  engineVersion: String,
  uptime: Long
)
