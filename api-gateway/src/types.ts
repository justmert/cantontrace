/**
 * CantonTrace API Gateway — Shared Type Definitions
 *
 * Copied and adapted from /shared-types.ts for API gateway use.
 * These types define the API contract between frontend and backend.
 */

// ============================================================
// Connection & Bootstrap Types
// ============================================================

export interface ConnectionConfig {
  ledgerApiEndpoint: string;
  iamUrl?: string;
  sandboxId?: string;
  /** OAuth2 client ID for client_credentials grant. Auto-discovered from Keycloak if omitted. */
  clientId?: string;
  /** OAuth2 client secret. Auto-discovered from Keycloak if omitted. */
  clientSecret?: string;
  /** OAuth2 audience claim. Defaults to "https://canton.network.global". */
  audience?: string;
}

export interface BootstrapInfo {
  apiVersion: string;
  featureDescriptors: FeatureDescriptor[];
  pruningOffset: string;
  currentOffset: string;
  packages: PackageSummary[];
  userRights: UserRight[];
  /** All known local parties from PartyManagementService (full IDs like alice::1220...). */
  knownParties: string[];
  connectedAt: string;
}

export interface FeatureDescriptor {
  name: string;
  version: string;
}

export interface PackageSummary {
  packageId: string;
  packageName?: string;
  packageVersion?: string;
}

export type UserRight =
  | { type: 'ParticipantAdmin' }
  | { type: 'CanActAs'; party: string }
  | { type: 'CanReadAs'; party: string }
  | { type: 'CanExecuteAs'; party: string }
  | { type: 'CanExecuteAsAnyParty' }
  | { type: 'CanReadAsAnyParty' };

// ============================================================
// ACS Inspector Types
// ============================================================

export interface ActiveContract {
  contractId: string;
  templateId: TemplateId;
  payload: Record<string, unknown>;
  signatories: string[];
  observers: string[];
  createdAt: string;
  contractKey?: Record<string, unknown>;
}

export interface ACSQueryParams {
  offset?: string;
  templateFilter?: TemplateId[];
  partyFilter?: string[];
  pageSize?: number;
  pageToken?: string;
}

export interface ACSResponse {
  contracts: ActiveContract[];
  offset: string;
  nextPageToken?: string;
  isPruned: boolean;
  prunedBefore?: string;
}

// ============================================================
// Template Explorer Types
// ============================================================

export interface TemplateId {
  packageName: string;
  moduleName: string;
  entityName: string;
}

export interface PackageDetail {
  packageId: string;
  packageName?: string;
  packageVersion?: string;
  modules: ModuleDetail[];
  hasSource: boolean;
}

export interface ModuleDetail {
  name: string;
  templates: TemplateDefinition[];
  interfaces: InterfaceDefinition[];
}

export interface TemplateDefinition {
  name: string;
  fields: FieldDefinition[];
  choices: ChoiceDefinition[];
  key?: KeyDefinition;
  signatoryExpression: string;
  observerExpression: string;
  ensureExpression?: string;
  implements: string[];
  sourceCode?: string;
  decompiledLF?: string;
}

export interface FieldDefinition {
  name: string;
  type: string;
  optional: boolean;
}

export interface ChoiceDefinition {
  name: string;
  consuming: boolean;
  parameters: FieldDefinition[];
  returnType: string;
  controllerExpression: string;
  sourceCode?: string;
  decompiledLF?: string;
}

export interface KeyDefinition {
  type: string;
  expression: string;
  maintainerExpression: string;
}

export interface InterfaceDefinition {
  name: string;
  methods: FieldDefinition[];
  choices: ChoiceDefinition[];
}

// ============================================================
// Event Stream Monitor Types
// ============================================================

export type UpdateType = 'transaction' | 'reassignment' | 'topology_transaction' | 'offset_checkpoint';

export interface LedgerUpdate {
  updateId: string;
  updateType: UpdateType;
  offset: string;
  recordTime: string;
  commandId?: string;
  workflowId?: string;
  traceContext?: TraceContext;
  events: LedgerEvent[];
}

export interface TraceContext {
  traceParent?: string;
  traceState?: string;
}

export type LedgerEvent =
  | CreatedEvent
  | ArchivedEvent
  | ExercisedEvent
  | AssignedEvent
  | UnassignedEvent;

export interface CreatedEvent {
  eventType: 'created';
  eventId: string;
  contractId: string;
  templateId: TemplateId;
  payload: Record<string, unknown>;
  signatories: string[];
  observers: string[];
  witnesses: string[];
  contractKey?: Record<string, unknown>;
}

export interface ArchivedEvent {
  eventType: 'archived';
  eventId: string;
  contractId: string;
  templateId: TemplateId;
  witnesses: string[];
}

export interface ExercisedEvent {
  eventType: 'exercised';
  eventId: string;
  contractId: string;
  templateId: TemplateId;
  choice: string;
  choiceArgument: Record<string, unknown>;
  actingParties: string[];
  consuming: boolean;
  witnesses: string[];
  childEventIds: string[];
  exerciseResult?: unknown;
}

export interface AssignedEvent {
  eventType: 'assigned';
  contractId: string;
  templateId?: TemplateId;
  source: string;
  target: string;
  reassignmentId: string;
}

export interface UnassignedEvent {
  eventType: 'unassigned';
  contractId: string;
  templateId?: TemplateId;
  source: string;
  reassignmentId: string;
}

export interface EventStreamFilter {
  templates?: TemplateId[];
  parties?: string[];
  eventTypes?: string[];
  transactionShape?: 'ACS_DELTA' | 'LEDGER_EFFECTS';
}

// ============================================================
// Transaction Explorer Types
// ============================================================

export interface TransactionDetail {
  updateId: string;
  commandId?: string;
  workflowId?: string;
  offset: string;
  recordTime: string;
  effectiveAt: string;
  traceContext?: TraceContext;
  rootEventIds: string[];
  eventsById: Record<string, LedgerEvent>;
  stateDiff: StateDiff;
}

export interface StateDiff {
  inputs: ActiveContract[];
  outputs: ActiveContract[];
  netChange: string;
}

// ============================================================
// Error Debugger Types
// ============================================================

export type ErrorCategory =
  | 'InvalidIndependentOfSystemState'
  | 'AuthInterceptorInvalidAuthenticationCredentials'
  | 'InvalidGivenCurrentSystemStateOther'
  | 'InvalidGivenCurrentSystemStateResourceMissing'
  | 'InvalidGivenCurrentSystemStateResourceExists'
  | 'ContentionOnSharedResources'
  | 'DeadlineExceededRequestStateUnknown'
  | 'TransientServerFailure'
  | 'SystemInternalAssumptionViolated'
  | 'MaliciousOrFaultyBehaviour'
  | 'InternalUnsupportedOperation';

export interface GrpcStatusMapping {
  category: ErrorCategory;
  grpcCode: string;
  description: string;
}

export interface CommandCompletion {
  commandId: string;
  submissionId?: string;
  updateId?: string;
  status: 'succeeded' | 'failed';
  offset: string;
  recordTime: string;
  actAs: string[];
  error?: CommandError;
}

export interface CommandError {
  errorCodeId: string;
  categoryId: ErrorCategory;
  grpcStatusCode: string;
  message: string;
  correlationId: string;
  errorInfo?: { reason: string; metadata: Record<string, string> };
  requestInfo?: { requestId: string };
  retryInfo?: { retryDelaySeconds: number };
  resourceInfo?: { resourceType: string; resourceName: string; owner: string };
  explanation?: string;
  commonCauses?: string[];
  suggestedFixes?: string[];
}

export interface ContentionTimeline {
  contestedContractId: string;
  yourTransaction: { updateId: string; timestamp: string };
  competingTransaction: { updateId: string; timestamp: string };
  contestedAt: string;
}

// ============================================================
// Contract Lifecycle Tracker Types
// ============================================================

export interface ContractLifecycle {
  contractId: string;
  templateId: TemplateId;
  creation: {
    updateId: string;
    offset: string;
    recordTime: string;
    payload: Record<string, unknown>;
    signatories: string[];
    observers: string[];
  };
  exercises: ContractExercise[];
  archival?: {
    updateId: string;
    offset: string;
    recordTime: string;
    choice: string;
    choiceArgument: Record<string, unknown>;
    actingParties: string[];
    childContractIds: string[];
  };
  isDivulged: boolean;
  isPruned: boolean;
  prunedBefore?: string;
}

export interface ContractExercise {
  updateId: string;
  offset: string;
  recordTime: string;
  choice: string;
  choiceArgument: Record<string, unknown>;
  actingParties: string[];
  consuming: boolean;
  childContractIds: string[];
}

// ============================================================
// Transaction Simulator Types
// ============================================================

export interface SimulationRequest {
  mode: 'online' | 'offline';
  commands: SimulationCommand[];
  actAs: string[];
  readAs: string[];
  synchronizerId?: string;
  disclosedContracts?: DisclosedContract[];
  historicalOffset?: string;
}

export interface SimulationCommand {
  templateId: TemplateId;
  choice?: string;
  contractId?: string;
  arguments: Record<string, unknown>;
}

export interface DisclosedContract {
  contractId: string;
  templateId: TemplateId;
  payload: Record<string, unknown>;
  createdEventBlob?: string;
}

export interface SimulationResult {
  mode: 'online' | 'offline';
  success: boolean;
  transactionTree?: TransactionDetail;
  error?: CommandError;
  costEstimation?: { estimatedCost: string; unit: string };
  hashInfo?: {
    transactionHash: string;
    hashingSchemeVersion: string;
    hashingDetails?: string;
    isAdvisory: boolean;
  };
  inputContracts?: Array<{
    contract: ActiveContract;
    createdAt: string;
  }>;
  globalKeyMapping?: Array<{
    key: Record<string, unknown>;
    contractId?: string;
  }>;
  simulatedAt: string;
  atOffset: string;
  stateDriftWarning: string;
}

// ============================================================
// Execution Trace Types
// ============================================================

export interface TraceRequest {
  command: SimulationCommand;
  actAs: string[];
  readAs: string[];
  disclosedContracts?: DisclosedContract[];
  historicalOffset?: string;
}

export type TraceStepType =
  | 'evaluate_expression'
  | 'fetch_contract'
  | 'fetch_package'
  | 'check_authorization'
  | 'evaluate_guard'
  | 'create_contract'
  | 'exercise_choice'
  | 'archive_contract';

export interface TraceStep {
  stepNumber: number;
  stepType: TraceStepType;
  sourceLocation?: SourceLocation;
  summary: string;
  variables: Record<string, unknown>;
  context: TraceStepContext;
  passed: boolean;
  error?: string;
}

export interface SourceLocation {
  file: string;
  startLine: number;
  startCol: number;
  endLine: number;
  endCol: number;
}

export interface TraceStepContext {
  contractPayloads?: Record<string, Record<string, unknown>>;
  requiredAuthority?: string[];
  providedAuthority?: string[];
  guardExpression?: string;
  guardResult?: boolean;
  actionType?: string;
  templateId?: TemplateId;
  choice?: string;
  arguments?: Record<string, unknown>;
  resultingContractId?: string;
}

export interface ExecutionTrace {
  steps: TraceStep[];
  sourceFiles: Record<string, string>;
  sourceAvailable: boolean;
  resultTransaction?: TransactionDetail;
  error?: string;
  profilerData?: unknown;
}

// ============================================================
// Workflow Debugger Types
// ============================================================

export type WorkflowCorrelation =
  | { type: 'trace_context'; traceId: string }
  | { type: 'contract_chain'; startContractId: string }
  | { type: 'workflow_id'; workflowId: string }
  | { type: 'update_id'; updateId: string };

export interface WorkflowTimeline {
  correlationType: string;
  correlationKey: string;
  transactions: WorkflowTransaction[];
  contractFlows: ContractFlow[];
}

export interface WorkflowTransaction {
  updateId: string;
  offset: string;
  recordTime: string;
  commandId?: string;
  workflowId?: string;
  traceContext?: TraceContext;
  templateId: TemplateId;
  choice?: string;
  actingParties: string[];
  contractsCreated: string[];
  contractsConsumed: string[];
}

export interface ContractFlow {
  fromUpdateId: string;
  toUpdateId: string;
  contractId: string;
  templateId: TemplateId;
}

// ============================================================
// Privacy Visualizer Types
// ============================================================

export interface PrivacyAnalysis {
  updateId: string;
  parties: string[];
  visibilityMatrix: Record<string, string[]>;
  events: PrivacyEvent[];
  disclosedContractBoundaries: DisclosedBoundary[];
}

export interface PrivacyEvent {
  eventId: string;
  eventType: string;
  templateId: TemplateId;
  signatories: string[];
  observers: string[];
  witnesses: string[];
  actingParties: string[];
  isDisclosed: boolean;
}

export interface DisclosedBoundary {
  eventId: string;
  contractId: string;
  accessedBy: string;
  reason: string;
}

// ============================================================
// Sandbox Manager Types
// ============================================================

export interface Sandbox {
  id: string;
  status: 'provisioning' | 'running' | 'stopped' | 'error';
  ledgerApiEndpoint: string;
  createdAt: string;
  parties: string[];
  uploadedDars: string[];
  profilingEnabled: boolean;
  shareUrl?: string;
}

export interface SandboxCreateRequest {
  darFile?: string;
  parties?: string[];
  enableProfiling?: boolean;
}

// ============================================================
// Reassignment Tracker Types
// ============================================================

export interface Reassignment {
  reassignmentId: string;
  contractId: string;
  templateId: TemplateId;
  sourceSynchronizer: string;
  targetSynchronizer: string;
  status: 'unassigned' | 'in_flight' | 'assigned' | 'failed';
  unassignedAt?: string;
  assignedAt?: string;
  latencyMs?: number;
}

// ============================================================
// CI/CD Integration Types
// ============================================================

export interface CIRunRequest {
  darFile: string;
  testScript?: string;
  assertions?: CIAssertion[];
}

export interface CIAssertion {
  type: 'contract_exists' | 'contract_count' | 'no_errors';
  templateId?: TemplateId;
  expectedCount?: number;
}

export interface CIRunResult {
  runId: string;
  status: 'passed' | 'failed' | 'error';
  sandboxId: string;
  duration: number;
  transactionTraces: string[];
  acsSnapshot: ActiveContract[];
  errors: CommandError[];
  assertions: Array<CIAssertion & { passed: boolean; actual?: unknown }>;
  platformUrl: string;
}

// ============================================================
// API Response Wrapper
// ============================================================

export interface ApiResponse<T> {
  data: T;
  meta?: {
    offset?: string;
    timestamp?: string;
    pageToken?: string;
    totalCount?: number;
  };
}

export interface ApiError {
  code: string;
  message: string;
  category?: ErrorCategory;
  details?: Record<string, unknown>;
}
