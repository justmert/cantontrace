/**
 * Canton 3.5 Ledger API v2 — TypeScript protobuf message types.
 *
 * These mirror the Canton gRPC protobuf definitions without requiring .proto files.
 * We use @grpc/grpc-js with dynamic service definitions built from these types.
 */

// ============================================================
// Common / Shared Messages
// ============================================================

export interface Identifier {
  package_id: string;
  module_name: string;
  entity_name: string;
}

/** Canton 3.5 package-name reference format (preferred over package-id). */
export interface PackageRef {
  package_name: string;
  package_version?: string;
}

export interface Value {
  record?: Record_;
  variant?: Variant;
  contract_id?: string;
  list?: List;
  int64?: string;
  numeric?: string;
  text?: string;
  timestamp?: string;
  party?: string;
  bool?: boolean;
  unit?: Empty;
  date?: number;
  optional?: Optional;
  text_map?: TextMap;
  gen_map?: GenMap;
  enum?: Enum;
}

export interface Record_ {
  record_id?: Identifier;
  fields: RecordField[];
}

export interface RecordField {
  label: string;
  value: Value;
}

export interface Variant {
  variant_id?: Identifier;
  constructor: string;
  value: Value;
}

export interface List {
  elements: Value[];
}

export interface Optional {
  value?: Value;
}

export interface TextMap {
  entries: Array<{ key: string; value: Value }>;
}

export interface GenMap {
  entries: Array<{ key: Value; value: Value }>;
}

export interface Enum {
  enum_id?: Identifier;
  constructor: string;
}

export interface Empty {}

export interface Timestamp {
  seconds: string;
  nanos: number;
}

export interface Duration {
  seconds: string;
  nanos: number;
}

export interface Status {
  code: number;
  message: string;
  details: Any[];
}

export interface Any {
  type_url: string;
  value: Uint8Array;
}

// ============================================================
// TraceContext (W3C Trace Context propagation)
// ============================================================

export interface TraceContext {
  traceparent?: string;
  tracestate?: string;
}

// ============================================================
// Transaction Filter
// ============================================================

export interface TransactionFilter {
  filters_by_party: Record<string, Filters>;
}

export interface Filters {
  cumulative: CumulativeFilter[];
}

export interface CumulativeFilter {
  identifier_filter?: IdentifierFilter;
  wildcard_filter?: WildcardFilter;
}

export interface IdentifierFilter {
  template_filter?: TemplateFilter;
  interface_filter?: InterfaceFilter;
}

export interface TemplateFilter {
  template_id: Identifier;
  include_created_event_blob?: boolean;
}

export interface InterfaceFilter {
  interface_id: Identifier;
  include_created_event_blob?: boolean;
}

export interface WildcardFilter {
  include_created_event_blob?: boolean;
}

// ============================================================
// Transaction Shape
// ============================================================

export enum TransactionShape {
  TRANSACTION_SHAPE_UNSPECIFIED = 0,
  TRANSACTION_SHAPE_ACS_DELTA = 1,
  TRANSACTION_SHAPE_LEDGER_EFFECTS = 2,
}

// ============================================================
// Events
// ============================================================

export interface CreatedEvent {
  event_id: string;
  contract_id: string;
  template_id: Identifier;
  contract_key?: Value;
  create_arguments: Record_;
  create_arguments_blob?: Uint8Array;
  created_event_blob?: Uint8Array;
  interface_views: InterfaceView[];
  witness_parties: string[];
  signatories: string[];
  observers: string[];
  created_at: string; // offset
  package_name: string;
}

export interface ArchivedEvent {
  event_id: string;
  contract_id: string;
  template_id: Identifier;
  witness_parties: string[];
  package_name: string;
}

export interface ExercisedEvent {
  event_id: string;
  contract_id: string;
  template_id: Identifier;
  choice: string;
  choice_argument: Value;
  acting_parties: string[];
  consuming: boolean;
  witness_parties: string[];
  child_event_ids: string[];
  exercise_result?: Value;
  package_name: string;
}

export interface InterfaceView {
  interface_id: Identifier;
  view_status: ViewStatus;
}

export interface ViewStatus {
  // oneof: success or failure
  view_value?: Record_;
  message?: string;
}

// ============================================================
// Event Wrappers (EventQueryService returns these, NOT raw events)
// ============================================================

export interface EventQueryServiceResponse {
  created?: CreatedEventWrapper;
  archived?: ArchivedEventWrapper;
}

export interface CreatedEventWrapper {
  created_event: CreatedEvent;
  synchronizer_id: string;
}

export interface ArchivedEventWrapper {
  archived_event: ArchivedEvent;
  synchronizer_id: string;
}

// ============================================================
// Reassignment Events
// ============================================================

export interface AssignedEvent {
  source: string;
  target: string;
  unassign_id: string;
  submitter: string;
  reassignment_counter: string;
  created_event: CreatedEvent;
}

export interface UnassignedEvent {
  unassign_id: string;
  contract_id: string;
  template_id: Identifier;
  source: string;
  target: string;
  submitter: string;
  reassignment_counter: string;
  assignment_exclusivity?: Timestamp;
  witness_parties: string[];
  package_name: string;
}

// ============================================================
// Updates (GetUpdates response types)
// ============================================================

export interface GetUpdatesResponse {
  // oneof update
  transaction?: Transaction;
  reassignment?: Reassignment;
  topology_transaction?: TopologyTransaction;
  offset_checkpoint?: OffsetCheckpoint;
}

export interface Transaction {
  update_id: string;
  command_id: string;
  workflow_id: string;
  effective_at: Timestamp;
  events: Array<TreeEvent>;
  offset: string;
  synchronizer_id: string;
  trace_context?: TraceContext;
  record_time: Timestamp;
  // When shape = LEDGER_EFFECTS, events_by_id is populated instead of flat events
  events_by_id?: Record<string, TreeEvent>;
  root_event_ids?: string[];
}

export interface TreeEvent {
  // oneof kind
  created?: CreatedEvent;
  exercised?: ExercisedEvent;
  archived?: ArchivedEvent;
}

export interface Reassignment {
  update_id: string;
  command_id: string;
  workflow_id: string;
  offset: string;
  // oneof event
  assigned_event?: AssignedEvent;
  unassigned_event?: UnassignedEvent;
  trace_context?: TraceContext;
  record_time: Timestamp;
}

export interface TopologyTransaction {
  update_id: string;
  events: TopologyEvent[];
  offset: string;
  synchronizer_id: string;
  trace_context?: TraceContext;
  record_time: Timestamp;
}

export interface TopologyEvent {
  event_id: string;
  // Topology events contain various participant/party/package changes
  // Canton 3.5 exposes these as opaque events with metadata
  identifier: Identifier;
}

export interface OffsetCheckpoint {
  offset: string;
  synchronizer_times: SynchronizerTime[];
}

export interface SynchronizerTime {
  synchronizer_id: string;
  record_time: Timestamp;
}

// ============================================================
// State Service Messages
// ============================================================

export interface GetActiveContractsRequest {
  filter: TransactionFilter;
  verbose: boolean;
  active_at_offset: string; // REQUIRED in Canton 3.5
  event_format?: EventFormat;
}

export interface EventFormat {
  filters_by_party: Record<string, Filters>;
  verbose: boolean;
}

export interface GetActiveContractsResponse {
  // oneof — either contract_entry or (in streaming) done signal
  offset: string;
  workflow_id: string;
  active_contract?: ActiveContract;
  incomplete_unassigned?: IncompleteUnassigned;
  incomplete_assigned?: IncompleteAssigned;
}

export interface ActiveContract {
  created_event: CreatedEvent;
  synchronizer_id: string;
  reassignment_counter: string;
}

export interface IncompleteUnassigned {
  created_event: CreatedEvent;
  unassigned_event: UnassignedEvent;
}

export interface IncompleteAssigned {
  assigned_event: AssignedEvent;
}

export interface GetLedgerEndResponse {
  offset: string;
}

// ============================================================
// Update Service Messages
// ============================================================

export interface GetUpdatesRequest {
  begin_exclusive: string;
  end_inclusive?: string;
  filter: TransactionFilter;
  verbose: boolean;
  transaction_shape: TransactionShape;
}

export interface GetUpdateByIdRequest {
  update_id: string;
  transaction_shape: TransactionShape;
}

// ============================================================
// Command Completion Service Messages
// ============================================================

export interface CompletionStreamRequest {
  application_id: string;
  parties: string[];
  begin_exclusive?: string;
}

export interface CompletionStreamResponse {
  completion?: Completion;
  offset_checkpoint?: OffsetCheckpoint;
}

export interface Completion {
  command_id: string;
  submission_id: string;
  update_id: string;
  status: Status;
  offset: string;
  synchronizer_id: string;
  trace_context?: TraceContext;
  record_time?: Timestamp;
  act_as: string[];
}

// ============================================================
// Interactive Submission Service Messages
// ============================================================

export interface PrepareSubmissionRequest {
  commands: Commands;
  // Protocol version etc.
  verbose_hashing?: boolean;
  disclosed_contracts: DisclosedContract[];
}

export interface Commands {
  workflow_id?: string;
  application_id: string;
  command_id: string;
  commands: Command[];
  act_as: string[];
  read_as: string[];
  submission_id?: string;
  synchronizer_id?: string;
}

export interface Command {
  // oneof command
  create?: CreateCommand;
  exercise?: ExerciseCommand;
  exercise_by_key?: ExerciseByKeyCommand;
  create_and_exercise?: CreateAndExerciseCommand;
}

export interface CreateCommand {
  template_id: Identifier;
  create_arguments: Record_;
  package_id_selection_preference?: string[];
}

export interface ExerciseCommand {
  template_id: Identifier;
  contract_id: string;
  choice: string;
  choice_argument: Value;
  package_id_selection_preference?: string[];
}

export interface ExerciseByKeyCommand {
  template_id: Identifier;
  contract_key: Value;
  choice: string;
  choice_argument: Value;
  package_id_selection_preference?: string[];
}

export interface CreateAndExerciseCommand {
  template_id: Identifier;
  create_arguments: Record_;
  choice: string;
  choice_argument: Value;
  package_id_selection_preference?: string[];
}

export interface DisclosedContract {
  template_id: Identifier;
  contract_id: string;
  created_event_blob: Uint8Array;
  synchronizer_id?: string;
  package_name?: string;
}

export interface PrepareSubmissionResponse {
  prepared_transaction: Uint8Array; // Serialized PreparedTransaction protobuf
  prepared_transaction_hash: Uint8Array;
  hashing_scheme_version: HashingSchemeVersion;
  hashing_details?: string; // OPAQUE — do NOT parse
  cost_estimation?: CostEstimation;
}

export enum HashingSchemeVersion {
  HASHING_SCHEME_VERSION_UNSPECIFIED = 0,
  HASHING_SCHEME_VERSION_V1 = 1,
  HASHING_SCHEME_VERSION_V2 = 2,
}

export interface CostEstimation {
  estimated_cost: string;
  unit: string;
}

/** PreparedTransaction — decoded from prepared_transaction bytes */
export interface PreparedTransaction {
  metadata: PreparedTransactionMetadata;
  // ... other fields (transaction body)
}

export interface PreparedTransactionMetadata {
  /** CORRECT PATH: input_contracts are nested inside Metadata */
  input_contracts: InputContract[];
  global_key_mapping: GlobalKeyMappingEntry[];
  submitter_info?: SubmitterInfo;
}

export interface InputContract {
  contract: ActiveContract;
  created_at: string;
  event_blob?: Uint8Array;
}

export interface GlobalKeyMappingEntry {
  key: Value;
  contract_id?: string;
}

export interface SubmitterInfo {
  act_as: string[];
  read_as: string[];
  command_id: string;
  application_id: string;
}

// ============================================================
// Event Query Service Messages
// ============================================================

export interface GetEventsByContractIdRequest {
  contract_id: string;
  requesting_parties: string[];
}

/** Response returns Created + optional Archived WRAPPER messages (NOT ExercisedEvent) */
export interface GetEventsByContractIdResponse {
  created?: CreatedEventWrapper;
  archived?: ArchivedEventWrapper;
}

// ============================================================
// Package Service Messages
// ============================================================

export interface ListPackagesResponse {
  package_ids: string[];
}

export interface GetPackageResponse {
  hash_function: HashFunction;
  archive_payload: Uint8Array; // DALF bytes
  hash: string;
  package_name?: string;
  package_version?: string;
}

export enum HashFunction {
  SHA256 = 0,
}

// ============================================================
// Party Management Service Messages
// ============================================================

export interface AllocatePartyRequest {
  party_id_hint?: string;
  display_name?: string;
  local_metadata?: ObjectMeta;
}

export interface AllocatePartyResponse {
  party_details: PartyDetails;
}

export interface PartyDetails {
  party: string;
  display_name: string;
  is_local: boolean;
  local_metadata?: ObjectMeta;
  identity_provider_id: string;
}

export interface ObjectMeta {
  resource_version: string;
  annotations: Record<string, string>;
}

export interface ListKnownPartiesRequest {
  page_token?: string;
  page_size?: number;
  identity_provider_id?: string;
}

export interface ListKnownPartiesResponse {
  party_details: PartyDetails[];
  next_page_token: string;
}

// ============================================================
// User Management Service Messages
// ============================================================

export interface GetUserRequest {
  user_id: string;
}

export interface GetUserResponse {
  user: User;
}

export interface User {
  id: string;
  primary_party: string;
  is_deactivated: boolean;
  metadata?: ObjectMeta;
  identity_provider_id: string;
}

export interface ListUserRightsRequest {
  user_id: string;
}

export interface ListUserRightsResponse {
  rights: Right[];
}

export interface Right {
  // oneof kind
  participant_admin?: Empty;
  can_act_as?: PartyRight;
  can_read_as?: PartyRight;
  can_execute_as?: PartyRight;
  can_execute_as_any_party?: Empty;
  can_read_as_any_party?: Empty;
}

export interface PartyRight {
  party: string;
}

// ============================================================
// Pruning Service Messages
// ============================================================

export interface GetLatestPrunedOffsetsResponse {
  participant_pruned_up_to_inclusive?: string;
  all_divulged_contracts_pruned_up_to_inclusive?: string;
}

// ============================================================
// Version Service Messages
// ============================================================

export interface GetLedgerApiVersionRequest {
  // empty
}

export interface GetLedgerApiVersionResponse {
  version: string;
  features: FeaturesDescriptor;
}

export interface FeaturesDescriptor {
  user_management?: UserManagementFeature;
  party_management?: PartyManagementFeature;
  experimental?: ExperimentalFeatures;
  // additional feature descriptors
  [key: string]: unknown;
}

export interface UserManagementFeature {
  supported: boolean;
  max_rights_per_user: number;
  max_users_page_size: number;
}

export interface PartyManagementFeature {
  max_parties_page_size: number;
}

export interface ExperimentalFeatures {
  [key: string]: unknown;
}

// ============================================================
// gRPC Service Definitions (for dynamic loading)
// ============================================================

export const CANTON_SERVICES = {
  VERSION_SERVICE: 'com.daml.ledger.api.v2.VersionService',
  STATE_SERVICE: 'com.daml.ledger.api.v2.StateService',
  UPDATE_SERVICE: 'com.daml.ledger.api.v2.UpdateService',
  COMMAND_COMPLETION_SERVICE: 'com.daml.ledger.api.v2.CommandCompletionService',
  // NOTE: InteractiveSubmissionService is under the "interactive" sub-package in Canton 3.4+
  INTERACTIVE_SUBMISSION_SERVICE: 'com.daml.ledger.api.v2.interactive.InteractiveSubmissionService',
  EVENT_QUERY_SERVICE: 'com.daml.ledger.api.v2.EventQueryService',
  PACKAGE_SERVICE: 'com.daml.ledger.api.v2.PackageService',
  PARTY_MANAGEMENT_SERVICE: 'com.daml.ledger.api.v2.admin.PartyManagementService',
  USER_MANAGEMENT_SERVICE: 'com.daml.ledger.api.v2.admin.UserManagementService',
  // NOTE: In Canton 3.4+, GetLatestPrunedOffsets moved to StateService.
  // ParticipantPruningService only has the Prune RPC.
  // We still register the admin pruning service for the Prune RPC if needed.
  PRUNING_SERVICE: 'com.daml.ledger.api.v2.admin.ParticipantPruningService',
} as const;
