-- CantonTrace: Seed Error Categories
-- Migration 003 — Seed all 11 Canton error categories
-- PostgreSQL 15+

BEGIN;

INSERT INTO schema_migrations (version, filename) VALUES (3, '003_seed_error_categories.sql')
  ON CONFLICT (version) DO NOTHING;

-- ============================================================================
-- Canton Error Categories (all 11)
-- ============================================================================
-- Reference: https://docs.daml.com/canton/usermanual/error-codes.html
-- Canton classifies every error into exactly one of these categories.
-- The category determines the gRPC status code, retryability, and security
-- sensitivity of the error response.

INSERT INTO error_categories (id, grpc_status_code, display_name, description, general_guidance, severity, is_retryable, is_security_sensitive) VALUES

-- 1. InvalidIndependentOfSystemState
(
  'InvalidIndependentOfSystemState',
  'INVALID_ARGUMENT',
  'Invalid Request (Static)',
  'The request is invalid regardless of the current state of the system. This includes malformed protobuf messages, unsupported Daml-LF versions, invalid field values, and structurally incorrect commands. The request would fail no matter when it is submitted or what state the ledger is in.',
  'Check your request structure carefully. Validate field values before submission. Ensure you are using a compatible Daml-LF version. These errors indicate a bug in your application code — the request itself is malformed and needs to be fixed before resubmitting.',
  'medium',
  false,
  false
),

-- 2. AuthInterceptorInvalidAuthenticationCredentials
(
  'AuthInterceptorInvalidAuthenticationCredentials',
  'UNAUTHENTICATED',
  'Authentication Failure',
  'The request failed authentication. This means the JWT token is missing, malformed, expired, has an incorrect audience, or was signed with an unknown key. The Ledger API rejected the request before processing it. For security reasons, error details may be stripped from the API response to prevent information leakage.',
  'Verify your JWT token is present, not expired, and signed correctly. Check the token audience matches the participant ID. If using a token provider, ensure it is configured for the correct environment. Refresh expired tokens before retrying. These errors require obtaining valid credentials before any retry attempt.',
  'high',
  false,
  true
),

-- 3. InvalidGivenCurrentSystemStateOther
(
  'InvalidGivenCurrentSystemStateOther',
  'FAILED_PRECONDITION',
  'Precondition Failed (Mutable State)',
  'The request is well-formed but cannot be processed because the current system state does not meet a required precondition. This differs from static validation errors because the same request might succeed later if the system state changes — for example, after a required package is uploaded or a party is allocated. Failures here relate to packages not being vetted, party-to-participant mappings not being established, deduplication conflicts, or other mutable preconditions.',
  'Identify which precondition is not met and address it. Common remediation includes: uploading and vetting required packages, allocating parties on the participant, waiting for deduplication windows to expire, or ensuring required topology state is established. Some of these errors may resolve if retried after the underlying state changes.',
  'medium',
  true,
  false
),

-- 4. InvalidGivenCurrentSystemStateResourceMissing
(
  'InvalidGivenCurrentSystemStateResourceMissing',
  'NOT_FOUND',
  'Resource Not Found',
  'A referenced resource does not exist on the ledger. This includes contracts that have been archived or never existed, packages that have not been uploaded, parties that have not been allocated, templates not present in any vetted package, or users that do not exist in the user management service. The submitting parties may also lack visibility to see the resource even if it exists.',
  'Verify the resource identifier is correct. For contracts, check that the contract has not been archived and that the submitting parties have visibility. For packages, ensure the package has been uploaded and vetted on the participant. For parties, allocate the party first. These errors are generally not retryable unless you expect the resource to be created by another process.',
  'medium',
  false,
  false
),

-- 5. InvalidGivenCurrentSystemStateResourceExists
(
  'InvalidGivenCurrentSystemStateResourceExists',
  'ALREADY_EXISTS',
  'Resource Already Exists',
  'The operation attempted to create a resource that already exists. This includes submitting a command with a command ID that was already used within the deduplication window, creating a contract with a key that is already active, allocating a party that already exists, or creating a user that already exists. The ledger enforces uniqueness constraints to prevent duplicate state.',
  'Use unique command IDs for each submission. If you hit a duplicate command ID, either wait for the deduplication window to expire or use a new command ID. For duplicate contract keys, archive the existing contract first or use a different key. For parties and users, check existence before attempting creation.',
  'medium',
  false,
  false
),

-- 6. ContentionOnSharedResources
(
  'ContentionOnSharedResources',
  'ABORTED',
  'Resource Contention',
  'The operation failed due to contention on shared resources. This is the most common error in high-throughput Daml applications. It occurs when multiple transactions attempt to use the same contract simultaneously (UTXO contention), when the Daml engine exceeds its time limit during interpretation, or when sequencer/mediator resource limits are hit. The ABORTED status code signals that the operation can and should be retried.',
  'Implement automatic retry with exponential backoff. Contention errors are expected in concurrent systems and your application should handle them gracefully. To reduce contention frequency: consider redesigning contracts to minimize shared mutable state, use contract key-based lookups instead of contract ID where possible, batch related operations, and review your Daml model for contention hotspots.',
  'high',
  true,
  false
),

-- 7. DeadlineExceededRequestStateUnknown
(
  'DeadlineExceededRequestStateUnknown',
  'DEADLINE_EXCEEDED',
  'Deadline Exceeded (State Unknown)',
  'The request timed out and the outcome is unknown. This is a critical category because the command may or may not have been processed by the ledger. The client does not know whether the transaction was committed. This can happen due to network latency, slow ledger processing, or overly aggressive client deadlines. The gRPC DEADLINE_EXCEEDED status indicates the client-set deadline expired before a response was received.',
  'IMPORTANT: Before retrying, you MUST check whether the original command was processed by querying the command completion stream or checking for the expected ledger state change. Blind retries can cause duplicate submissions. Increase client deadlines if timeouts are frequent. Monitor end-to-end latency to identify bottlenecks. Consider using the command deduplication mechanism as a safety net against accidental double submissions.',
  'critical',
  true,
  false
),

-- 8. TransientServerFailure
(
  'TransientServerFailure',
  'UNAVAILABLE',
  'Transient Server Failure',
  'A transient infrastructure failure prevented the request from being processed. This includes database connectivity issues, serialization failures at the storage layer, gRPC transport errors, and participant components that are temporarily unavailable. These failures are expected to resolve on their own and the request should be retried. Some errors in this category may use the INTERNAL gRPC status code for DB serialization failures.',
  'Retry with exponential backoff. These errors typically resolve within seconds to minutes. If they persist, investigate infrastructure health: database connectivity, network stability, and participant resource utilization. Contact your operator if the participant appears to be consistently unhealthy. Monitor for patterns that might indicate a systemic infrastructure issue rather than transient blips.',
  'high',
  true,
  false
),

-- 9. SystemInternalAssumptionViolated
(
  'SystemInternalAssumptionViolated',
  'INTERNAL',
  'Internal System Error',
  'An internal assumption in the Canton/Daml runtime was violated. This indicates a bug in the platform software, an unexpected state in the system, or a corrupted internal data structure. These errors should not occur during normal operation. Developers cannot fix these errors themselves — they require operator or platform team intervention.',
  'Collect the full error details including the correlation ID and error trace, then report to your Canton operator or file a bug report. Do not retry the operation as it is unlikely to succeed and may cause further issues. Check if the participant needs to be restarted. Review recent configuration changes or upgrades that might have triggered the issue.',
  'critical',
  false,
  false
),

-- 10. MaliciousOrFaultyBehaviour
(
  'MaliciousOrFaultyBehaviour',
  'INTERNAL',
  'Malicious or Faulty Behaviour',
  'A security-related failure was detected. This category covers protocol violations, unexpected messages from other participants, invalid signatures, and other behaviors that may indicate a compromised or malfunctioning node in the network. Error details are deliberately hidden from the API response to prevent information leakage that could aid an attacker. This category uses INTERNAL rather than a more specific code to avoid revealing security-sensitive information.',
  'These errors require operator investigation. The error details are logged server-side but stripped from API responses for security. Contact your Canton operator with the correlation ID so they can investigate the server-side logs. Do not retry the operation. If you see these errors frequently, there may be a misconfigured or compromised participant in the network.',
  'critical',
  false,
  true
),

-- 11. InternalUnsupportedOperation
(
  'InternalUnsupportedOperation',
  'UNIMPLEMENTED',
  'Unsupported Operation',
  'The requested API endpoint or operation is not supported by this participant. This can occur when calling an endpoint that has not been implemented yet, when using a feature that is not available in the current Canton edition (e.g., Enterprise-only features on Community edition), or when the participant is running an older version that does not support the requested operation.',
  'Check the Canton documentation for your version and edition to confirm the operation is supported. If you need this functionality, consider upgrading to a newer Canton version or a different edition. There is no retry possible — the operation is fundamentally unavailable on this participant.',
  'low',
  false,
  false
)
ON CONFLICT (id) DO NOTHING;

COMMIT;
