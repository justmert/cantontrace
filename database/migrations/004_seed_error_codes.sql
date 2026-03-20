-- CantonTrace: Seed Error Codes
-- Migration 004 — Seed individual Canton error codes with detailed knowledge base entries
-- PostgreSQL 15+

BEGIN;

INSERT INTO schema_migrations (version, filename) VALUES (4, '004_seed_error_codes.sql')
  ON CONFLICT (version) DO NOTHING;

-- ============================================================================
-- Error Codes for: InvalidIndependentOfSystemState
-- gRPC: INVALID_ARGUMENT
-- These errors indicate the request is structurally invalid regardless of state
-- ============================================================================

INSERT INTO error_codes (error_code_id, category_id, grpc_status_code, human_explanation, common_causes, suggested_fixes, documentation_url, requires_admin, added_in_version) VALUES

(
  'INVALID_ARGUMENT',
  'InvalidIndependentOfSystemState',
  'INVALID_ARGUMENT',
  'The submitted command contains an invalid argument that is rejected regardless of the ledger state. This is a generic validation error that indicates the request payload does not conform to the expected format or constraints. The Ledger API validated the request and found a structural or semantic issue.',
  ARRAY[
    'Protobuf message has incorrect field types or encoding',
    'A numeric field is out of its valid range (e.g., negative amount)',
    'A string field contains characters not allowed by the protocol',
    'A repeated field has too many or too few elements'
  ],
  ARRAY[
    'Check the gRPC metadata for the specific field name that failed validation',
    'Review the Ledger API protobuf definitions for the correct field types and constraints',
    'Validate command payloads client-side before submission using the protobuf schema',
    'Enable debug logging on your gRPC client to inspect the raw request being sent'
  ],
  'https://docs.daml.com/canton/usermanual/error-codes.html#invalidindependentofsystemstate',
  false,
  NULL
),

(
  'INVALID_DEDUPLICATION_PERIOD',
  'InvalidIndependentOfSystemState',
  'INVALID_ARGUMENT',
  'The deduplication period specified in the command submission is outside the allowed range. Canton enforces a maximum deduplication period (configured per participant) and the submitted value exceeds it, or the period is negative/zero which is not permitted. The deduplication period controls how long the participant remembers command IDs to prevent duplicate submissions.',
  ARRAY[
    'Deduplication duration exceeds the participant''s max_deduplication_duration configuration',
    'Deduplication offset points to a pruned or future offset',
    'Duration is zero or negative',
    'Client SDK is using a default deduplication period that is incompatible with this participant'
  ],
  ARRAY[
    'Query the participant''s configuration to find the maximum allowed deduplication duration',
    'Use a deduplication period shorter than the participant''s max_deduplication_duration',
    'If using offset-based deduplication, ensure the offset is between the pruning boundary and the ledger end',
    'Set a reasonable default deduplication period in your application (e.g., 5 minutes)'
  ],
  'https://docs.daml.com/canton/usermanual/error-codes.html#invalidindependentofsystemstate',
  false,
  NULL
),

(
  'MISSING_FIELD',
  'InvalidIndependentOfSystemState',
  'INVALID_ARGUMENT',
  'A required field in the gRPC request is missing or empty. The Ledger API requires certain fields to be populated for each request type and one or more mandatory fields were not provided. This typically indicates an incomplete command construction in your application code.',
  ARRAY[
    'The commands field is empty in a SubmitRequest',
    'party or act_as is not specified in the command',
    'template_id is missing from a CreateCommand or ExerciseCommand',
    'command_id was not set (required for deduplication)'
  ],
  ARRAY[
    'Check the error metadata for the specific field name that is missing',
    'Review the protobuf definition for the request type to identify all required fields',
    'Ensure your client library or SDK is properly constructing the request',
    'Add client-side validation to catch missing fields before submission'
  ],
  'https://docs.daml.com/canton/usermanual/error-codes.html#invalidindependentofsystemstate',
  false,
  NULL
),

(
  'INVALID_FIELD',
  'InvalidIndependentOfSystemState',
  'INVALID_ARGUMENT',
  'A field in the gRPC request has an invalid value. Unlike MISSING_FIELD, the field is present but its value does not meet the required constraints. This can happen with malformed identifiers, invalid party names, incorrectly structured record arguments, or type mismatches in command arguments.',
  ARRAY[
    'Party identifier contains invalid characters (must match [a-zA-Z0-9_-]+)',
    'Template ID has wrong format (expected package_id:module:template)',
    'Choice argument types do not match the expected Daml types',
    'Contract ID is malformed or has an invalid format'
  ],
  ARRAY[
    'Inspect the error metadata for the field name and expected format',
    'Validate identifiers against Canton naming rules before submission',
    'Use the Daml codegen to construct type-safe command arguments',
    'Check that contract IDs are being passed as-is from the ledger without modification'
  ],
  'https://docs.daml.com/canton/usermanual/error-codes.html#invalidindependentofsystemstate',
  false,
  NULL
),

(
  'UNSUPPORTED_LF_VERSION',
  'InvalidIndependentOfSystemState',
  'INVALID_ARGUMENT',
  'The submitted DAR or command references a Daml-LF version that is not supported by this participant. Each Canton version supports a specific range of Daml-LF versions, and the request uses a version outside that range. This commonly happens when a DAR compiled with a newer Daml SDK is uploaded to an older Canton participant.',
  ARRAY[
    'DAR was compiled with a newer Daml SDK than the Canton participant supports',
    'DAR was compiled with a very old Daml-LF version that has been deprecated',
    'Participant was downgraded but existing packages reference newer LF features',
    'Mixed Daml SDK versions in a multi-package project'
  ],
  ARRAY[
    'Check the Canton participant version and its supported Daml-LF version range in the release notes',
    'Recompile the DAR with a Daml SDK version compatible with your Canton participant',
    'Upgrade the Canton participant to a version that supports the required Daml-LF version',
    'Use "daml damlc inspect-dar" to check the Daml-LF version of your DAR before uploading'
  ],
  'https://docs.daml.com/canton/usermanual/error-codes.html#invalidindependentofsystemstate',
  false,
  NULL
)
ON CONFLICT (error_code_id) DO NOTHING;

-- ============================================================================
-- Error Codes for: InvalidGivenCurrentSystemStateResourceMissing
-- gRPC: NOT_FOUND
-- These errors mean a referenced resource doesn't exist on the ledger
-- ============================================================================

INSERT INTO error_codes (error_code_id, category_id, grpc_status_code, human_explanation, common_causes, suggested_fixes, documentation_url, requires_admin, added_in_version) VALUES

(
  'CONTRACT_NOT_FOUND',
  'InvalidGivenCurrentSystemStateResourceMissing',
  'NOT_FOUND',
  'The referenced contract does not exist or is not visible to the submitting parties. In Daml, contracts are only visible to their stakeholders (signatories and observers). If the contract was archived by another transaction, it will also appear as not found. This is one of the most common errors in Daml application development.',
  ARRAY[
    'The contract has been archived (consumed) by another transaction',
    'The submitting party is not a stakeholder of the contract and lacks visibility',
    'The contract ID is stale — it was fetched from an outdated ACS snapshot',
    'The contract was created on a different participant and has not been synchronized yet'
  ],
  ARRAY[
    'Refresh your Active Contract Set (ACS) view before exercising choices on contracts',
    'Verify the submitting party has visibility (is a signatory or observer) on the contract',
    'Implement retry logic for stale contract IDs, fetching a fresh contract ID before retry',
    'Use the Transaction Trace Viewer to check if the contract was archived and by whom'
  ],
  'https://docs.daml.com/canton/usermanual/error-codes.html#invalidgivencurrentsystemstateresourcemissing',
  false,
  NULL
),

(
  'PACKAGE_NOT_FOUND',
  'InvalidGivenCurrentSystemStateResourceMissing',
  'NOT_FOUND',
  'A referenced Daml package has not been uploaded or vetted on this participant. Commands referencing templates or data types from this package cannot be processed until the package is available. The package must be both uploaded AND vetted — uploading alone is not sufficient in Canton.',
  ARRAY[
    'The DAR containing the package was never uploaded to this participant',
    'The package was uploaded but not yet vetted (topology transaction not yet effective)',
    'A dependent package is missing (packages have transitive dependencies)',
    'The package ID in the command does not match any known package (typo or wrong environment)'
  ],
  ARRAY[
    'Upload the DAR containing the package using the PackageManagementService',
    'Check package vetting status on the participant — upload does not automatically vet in all configurations',
    'Ensure all transitive package dependencies are also uploaded and vetted',
    'Use "daml damlc inspect-dar" to verify the package ID matches what you expect'
  ],
  'https://docs.daml.com/canton/usermanual/error-codes.html#invalidgivencurrentsystemstateresourcemissing',
  false,
  NULL
),

(
  'PARTY_NOT_KNOWN_ON_PARTICIPANT',
  'InvalidGivenCurrentSystemStateResourceMissing',
  'NOT_FOUND',
  'The specified party has not been allocated on this participant. In Canton, parties must be explicitly allocated on each participant where they will be used. A party that exists on one participant is not automatically available on another — the party-to-participant mapping must be established through the topology management.',
  ARRAY[
    'The party was never allocated on this participant',
    'The party was allocated on a different participant in the network',
    'The party name is misspelled or uses the wrong format',
    'The party-to-participant topology transaction has not yet been processed'
  ],
  ARRAY[
    'Allocate the party on this participant using the PartyManagementService',
    'If the party exists on another participant, establish the party-to-participant mapping',
    'Verify the party identifier matches exactly (party IDs are case-sensitive)',
    'Check the participant''s topology state to see which parties are currently allocated'
  ],
  'https://docs.daml.com/canton/usermanual/error-codes.html#invalidgivencurrentsystemstateresourcemissing',
  false,
  NULL
),

(
  'TEMPLATE_NOT_FOUND',
  'InvalidGivenCurrentSystemStateResourceMissing',
  'NOT_FOUND',
  'The specified template is not found in any vetted package on this participant. This means either the package containing the template has not been uploaded/vetted, or the template identifier (package ID, module name, template name) is incorrect. Template resolution requires an exact match on all three components.',
  ARRAY[
    'The DAR containing this template was not uploaded to the participant',
    'The template identifier has a typo in the module or template name',
    'The package ID portion of the template ID references the wrong package version',
    'The package is uploaded but not yet vetted'
  ],
  ARRAY[
    'Verify the full template identifier: package_id:Module.Name:TemplateName',
    'Upload and vet the DAR containing the template on this participant',
    'Use the PackageService to list available packages and their contents',
    'If using codegen, regenerate the bindings to ensure template IDs match the deployed packages'
  ],
  'https://docs.daml.com/canton/usermanual/error-codes.html#invalidgivencurrentsystemstateresourcemissing',
  false,
  NULL
),

(
  'USER_NOT_FOUND',
  'InvalidGivenCurrentSystemStateResourceMissing',
  'NOT_FOUND',
  'The specified user does not exist in the User Management Service. This error occurs when attempting to get, update, or delete a user that has not been created, or when the user was deleted by another administrator. The User Management Service maintains its own registry separate from party allocation.',
  ARRAY[
    'The user was never created via the UserManagementService',
    'The user was deleted by another administrator',
    'The user ID is misspelled or uses the wrong format',
    'Attempting to use a party ID where a user ID is expected (they are different concepts)'
  ],
  ARRAY[
    'Create the user first using UserManagementService.CreateUser',
    'Verify the user ID is correct (user IDs are case-sensitive)',
    'List existing users to check available user IDs',
    'Do not confuse user IDs (for API access) with party IDs (for ledger operations)'
  ],
  'https://docs.daml.com/canton/usermanual/error-codes.html#invalidgivencurrentsystemstateresourcemissing',
  false,
  NULL
)
ON CONFLICT (error_code_id) DO NOTHING;

-- ============================================================================
-- Error Codes for: InvalidGivenCurrentSystemStateResourceExists
-- gRPC: ALREADY_EXISTS
-- These errors mean the resource already exists and can't be created again
-- ============================================================================

INSERT INTO error_codes (error_code_id, category_id, grpc_status_code, human_explanation, common_causes, suggested_fixes, documentation_url, requires_admin, added_in_version) VALUES

(
  'DUPLICATE_COMMAND',
  'InvalidGivenCurrentSystemStateResourceExists',
  'ALREADY_EXISTS',
  'A command with the same command ID has already been submitted within the deduplication window. Canton uses command IDs to prevent duplicate submissions — if the same command ID is seen twice within the deduplication period, the second submission is rejected. This is a safety mechanism, not a bug, and protects against accidental double-submissions.',
  ARRAY[
    'Application retried a command submission without generating a new command ID',
    'Two parts of the application independently submitted commands with the same ID',
    'The deduplication window has not expired since the last submission with this ID',
    'Client reconnected after a timeout and resubmitted the same command'
  ],
  ARRAY[
    'Generate a unique command ID (UUID) for each new command submission',
    'If retrying after a timeout, first check the completion stream to see if the original succeeded',
    'Use the deduplication mechanism intentionally: same command ID = same intent',
    'Reduce the deduplication period if rapid reuse of command patterns is needed'
  ],
  'https://docs.daml.com/canton/usermanual/error-codes.html#invalidgivencurrentsystemstateresourceexists',
  false,
  NULL
),

(
  'DUPLICATE_CONTRACT_KEY',
  'InvalidGivenCurrentSystemStateResourceExists',
  'ALREADY_EXISTS',
  'A contract with the specified contract key already exists on the ledger. In Daml, contract keys must be unique — only one active contract can have a given key at any time. This error occurs when attempting to create a new contract whose key matches an already-active contract. The uniqueness is enforced globally across the domain.',
  ARRAY[
    'Attempting to create a contract when one with the same key already exists',
    'A race condition where two transactions try to create contracts with the same key',
    'Application logic did not check for existing contracts before creation',
    'The previous contract with this key was not archived before creating the new one'
  ],
  ARRAY[
    'Use fetchByKey or lookupByKey to check if a contract with the key already exists before creating',
    'Archive the existing contract before creating a new one with the same key',
    'Use createAndExercise or exercise-then-create patterns to atomically replace keyed contracts',
    'Review your Daml model: consider if the key definition is too broad, causing unintended collisions'
  ],
  'https://docs.daml.com/canton/usermanual/error-codes.html#invalidgivencurrentsystemstateresourceexists',
  false,
  NULL
),

(
  'PARTY_ALREADY_EXISTS',
  'InvalidGivenCurrentSystemStateResourceExists',
  'ALREADY_EXISTS',
  'The party has already been allocated on this participant. Party allocation is idempotent in intent — if you want to use a party that already exists, you can proceed without allocating it again. This error occurs when the allocation request uses a party ID hint that matches an already-allocated party.',
  ARRAY[
    'Calling AllocateParty with a party ID hint that already exists',
    'Application startup logic allocates parties without checking if they already exist',
    'Multiple instances of the same application racing to allocate the same party'
  ],
  ARRAY[
    'Check if the party already exists using ListKnownParties before allocating',
    'Treat this error as a success if your intent was to ensure the party exists',
    'Use a try-allocate-or-lookup pattern in your application initialization',
    'Generate unique party ID hints if you need distinct parties'
  ],
  'https://docs.daml.com/canton/usermanual/error-codes.html#invalidgivencurrentsystemstateresourceexists',
  false,
  NULL
),

(
  'USER_ALREADY_EXISTS',
  'InvalidGivenCurrentSystemStateResourceExists',
  'ALREADY_EXISTS',
  'A user with the specified user ID already exists in the User Management Service. User IDs must be unique within a participant. This error occurs when calling CreateUser with a user ID that has already been registered.',
  ARRAY[
    'Application initialization creates users without checking if they already exist',
    'Multiple application instances racing to create the same user',
    'Re-running a setup script that already created the user'
  ],
  ARRAY[
    'Check if the user exists using GetUser before calling CreateUser',
    'Use a try-create-or-get pattern in your application initialization code',
    'If the user exists, use UpdateUser to modify their rights instead of recreating',
    'Implement idempotent user setup that handles the ALREADY_EXISTS case gracefully'
  ],
  'https://docs.daml.com/canton/usermanual/error-codes.html#invalidgivencurrentsystemstateresourceexists',
  false,
  NULL
)
ON CONFLICT (error_code_id) DO NOTHING;

-- ============================================================================
-- Error Codes for: ContentionOnSharedResources
-- gRPC: ABORTED
-- These errors are retryable — contention is expected in concurrent systems
-- ============================================================================

INSERT INTO error_codes (error_code_id, category_id, grpc_status_code, human_explanation, common_causes, suggested_fixes, documentation_url, requires_admin, added_in_version) VALUES

(
  'CONTRACT_NOT_ACTIVE',
  'ContentionOnSharedResources',
  'ABORTED',
  'The contract was consumed (archived) by another transaction between the time your transaction read it and the time it attempted to use it. This is classic UTXO contention — multiple transactions competing for the same contract. In Canton, this manifests as an ABORTED error because the transaction can and should be retried with a fresh view of the ledger.',
  ARRAY[
    'High-frequency operations on the same contract (e.g., a shared counter or account)',
    'Multiple parties simultaneously exercising choices on the same contract',
    'Long-running transactions that hold stale contract references',
    'Hot-spot contracts that are used by many concurrent workflows'
  ],
  ARRAY[
    'Implement automatic retry with exponential backoff — this is the primary mitigation',
    'Redesign your Daml model to reduce contention hotspots (e.g., sharding, batching)',
    'Fetch fresh contract state immediately before exercising choices, minimizing the window',
    'Use the CantonTrace contention heatmap to identify which templates have the most contention'
  ],
  'https://docs.daml.com/canton/usermanual/error-codes.html#contentiononsharedresources',
  false,
  NULL
),

(
  'INTERPRETATION_TIME_EXCEEDED',
  'ContentionOnSharedResources',
  'ABORTED',
  'The Daml engine exceeded its time limit while interpreting the transaction. Canton imposes a timeout on Daml interpretation to prevent runaway computations from blocking the system. This can happen with complex Daml logic, large data structures, or deeply recursive computations. The categorization as contention (ABORTED) means the system treats this as retryable.',
  ARRAY[
    'Daml choice body contains deeply recursive or iterative logic over large lists',
    'Complex contract key lookups or fetches that trigger cascading reads',
    'Transaction involves a very large number of sub-transactions or contract operations',
    'The participant is under heavy load, causing slower interpretation'
  ],
  ARRAY[
    'Simplify the Daml logic — break complex operations into smaller, sequential transactions',
    'Reduce the size of data structures processed within a single transaction',
    'Profile the Daml interpretation using Canton''s built-in profiling support',
    'If the participant is under load, retry during lower-traffic periods or scale the participant'
  ],
  'https://docs.daml.com/canton/usermanual/error-codes.html#contentiononsharedresources',
  false,
  NULL
),

(
  'SEQUENCER_REQUEST_REFUSED',
  'ContentionOnSharedResources',
  'ABORTED',
  'The domain sequencer refused the request, typically due to rate limiting or resource constraints. The sequencer is the ordering component in Canton that ensures consistent transaction ordering across participants. When it is overloaded or the request exceeds configured limits (e.g., maximum message size, maximum rate), it rejects the request with an ABORTED status to signal retryability.',
  ARRAY[
    'The participant is submitting transactions faster than the sequencer rate limit allows',
    'The transaction payload exceeds the sequencer''s maximum message size',
    'The sequencer is experiencing high load from multiple participants',
    'Network issues causing request queuing and eventual rejection'
  ],
  ARRAY[
    'Implement client-side rate limiting to stay within sequencer bounds',
    'Reduce transaction payload size by minimizing contract argument sizes',
    'Retry with exponential backoff — the sequencer will accept requests once load decreases',
    'Contact the domain operator to review sequencer capacity and rate limits'
  ],
  'https://docs.daml.com/canton/usermanual/error-codes.html#contentiononsharedresources',
  false,
  NULL
)
ON CONFLICT (error_code_id) DO NOTHING;

-- ============================================================================
-- Error Codes for: AuthInterceptorInvalidAuthenticationCredentials
-- gRPC: UNAUTHENTICATED / PERMISSION_DENIED
-- These errors relate to authentication and authorization
-- ============================================================================

INSERT INTO error_codes (error_code_id, category_id, grpc_status_code, human_explanation, common_causes, suggested_fixes, documentation_url, requires_admin, added_in_version) VALUES

(
  'UNAUTHENTICATED',
  'AuthInterceptorInvalidAuthenticationCredentials',
  'UNAUTHENTICATED',
  'No authentication credentials were provided with the request, but the participant requires authentication. When Canton is configured with authentication enabled, every gRPC request must include a valid JWT in the Authorization header. This error means the header was entirely absent or empty.',
  ARRAY[
    'gRPC client is not configured to send the Authorization metadata header',
    'Token provider/interceptor failed silently and sent an empty token',
    'Application is targeting an authenticated participant but was configured for an unauthenticated one',
    'Load balancer or proxy stripped the Authorization header'
  ],
  ARRAY[
    'Configure your gRPC client to include the JWT in the Authorization header as "Bearer <token>"',
    'Verify your token provider is returning a valid token (check for empty/null responses)',
    'Check if the participant requires authentication by reviewing its configuration',
    'If using a proxy or load balancer, ensure it forwards the Authorization header'
  ],
  'https://docs.daml.com/canton/usermanual/authentication.html',
  false,
  NULL
),

(
  'PERMISSION_DENIED',
  'AuthInterceptorInvalidAuthenticationCredentials',
  'PERMISSION_DENIED',
  'The provided JWT is valid but does not grant sufficient rights for the requested operation. The token was parsed and verified, but the claims it contains do not authorize the action — for example, the token grants CanReadAs for a party but the command requires CanActAs, or the token does not include admin rights for an admin-only operation.',
  ARRAY[
    'Token grants CanReadAs but the operation requires CanActAs',
    'Token does not include the admin claim required for administrative operations',
    'Token is scoped to different parties than those used in the command',
    'Token audience does not match the participant ID'
  ],
  ARRAY[
    'Request a token with the correct rights (CanActAs for command submission, admin for management)',
    'Verify the token claims match the parties specified in act_as and read_as',
    'Check that the token audience includes this participant''s ID',
    'Use the UserManagementService to grant the appropriate rights to the user'
  ],
  'https://docs.daml.com/canton/usermanual/authentication.html',
  false,
  NULL
),

(
  'TOKEN_EXPIRED',
  'AuthInterceptorInvalidAuthenticationCredentials',
  'UNAUTHENTICATED',
  'The JWT token has expired. The token''s exp (expiration) claim indicates a timestamp in the past, so the participant rejects it. This is a normal occurrence in long-running applications that do not refresh their tokens before expiration. The token must be refreshed and the request resubmitted.',
  ARRAY[
    'Long-running application did not implement token refresh logic',
    'Token TTL is too short for the application''s operation patterns',
    'Clock skew between the token issuer and the participant',
    'Token was cached and reused beyond its expiration time'
  ],
  ARRAY[
    'Implement proactive token refresh: renew the token before it expires (e.g., at 80% of TTL)',
    'Add a gRPC interceptor that automatically refreshes expired tokens and retries',
    'Increase the token TTL in your identity provider configuration if appropriate',
    'Ensure time synchronization (NTP) between the token issuer and the participant'
  ],
  'https://docs.daml.com/canton/usermanual/authentication.html',
  false,
  NULL
)
ON CONFLICT (error_code_id) DO NOTHING;

-- ============================================================================
-- Error Codes for: TransientServerFailure
-- gRPC: UNAVAILABLE / INTERNAL
-- These errors are transient infrastructure failures — always retryable
-- ============================================================================

INSERT INTO error_codes (error_code_id, category_id, grpc_status_code, human_explanation, common_causes, suggested_fixes, documentation_url, requires_admin, added_in_version) VALUES

(
  'SERVICE_NOT_RUNNING',
  'TransientServerFailure',
  'UNAVAILABLE',
  'A required participant component is not yet running or ready to accept requests. Canton participants consist of multiple internal services that start up sequentially. If a request arrives before all components are initialized, it is rejected with UNAVAILABLE to signal that the client should retry. This commonly happens during participant startup or after a component restart.',
  ARRAY[
    'The participant is still starting up and has not completed initialization',
    'A specific component (e.g., the indexer, the sync service) is restarting',
    'Health checks passed before all internal services were fully initialized',
    'A dependent service (e.g., the domain connection) has not been established yet'
  ],
  ARRAY[
    'Retry with exponential backoff — the service will become available once startup completes',
    'Use the HealthService gRPC endpoint to check participant readiness before sending requests',
    'Implement a startup probe in your application that waits for the participant to be ready',
    'If the error persists for more than a few minutes, check participant logs for startup errors'
  ],
  'https://docs.daml.com/canton/usermanual/error-codes.html#transientserverfailure',
  false,
  NULL
),

(
  'SERVER_IS_SHUTTING_DOWN',
  'TransientServerFailure',
  'UNAVAILABLE',
  'The participant is in the process of graceful shutdown and is no longer accepting new requests. Existing in-flight requests may still complete, but new submissions are rejected. This is an orderly shutdown — the participant is draining its work queue before terminating.',
  ARRAY[
    'Participant is being restarted as part of a planned maintenance or upgrade',
    'Auto-scaling infrastructure is terminating the participant instance',
    'Operator initiated a graceful shutdown',
    'Container orchestrator (Kubernetes) is cycling the pod'
  ],
  ARRAY[
    'Retry against a different participant instance if available (load balancer should handle this)',
    'Wait for the participant to restart and become available again',
    'If using Kubernetes, ensure readiness probes are configured so the load balancer stops routing',
    'Implement connection failover in your application for high-availability setups'
  ],
  'https://docs.daml.com/canton/usermanual/error-codes.html#transientserverfailure',
  false,
  NULL
),

(
  'DB_STORAGE_DEGRADED',
  'TransientServerFailure',
  'UNAVAILABLE',
  'The participant''s database storage layer is experiencing issues. This can be caused by database connectivity problems, storage capacity issues, or serialization failures at the database level. Canton relies on a PostgreSQL or Oracle database for persistent state, and this error indicates the database is temporarily unreachable or underperforming.',
  ARRAY[
    'Database connection pool exhaustion under high load',
    'Database server is temporarily unreachable (network blip)',
    'Storage capacity is running low on the database server',
    'Database serialization conflict (concurrent access to the same rows)'
  ],
  ARRAY[
    'Retry the request — database transient failures typically resolve quickly',
    'Check database connectivity and health metrics (connections, CPU, disk I/O)',
    'Review database connection pool settings — they may need to be increased for your load',
    'Contact your infrastructure/database team if errors persist beyond a few minutes'
  ],
  'https://docs.daml.com/canton/usermanual/error-codes.html#transientserverfailure',
  true,
  NULL
)
ON CONFLICT (error_code_id) DO NOTHING;

-- ============================================================================
-- Error Codes for: DeadlineExceededRequestStateUnknown
-- gRPC: DEADLINE_EXCEEDED
-- Outcome is unknown — check before retrying!
-- ============================================================================

INSERT INTO error_codes (error_code_id, category_id, grpc_status_code, human_explanation, common_causes, suggested_fixes, documentation_url, requires_admin, added_in_version) VALUES

(
  'REQUEST_DEADLINE_EXCEEDED',
  'DeadlineExceededRequestStateUnknown',
  'DEADLINE_EXCEEDED',
  'The client-specified deadline expired before the participant could complete the request. The gRPC deadline (timeout) set by the client was reached, but this does NOT mean the request was not processed — the participant may still be working on it. The outcome is genuinely unknown: the transaction may have been committed, may still be in flight, or may have failed.',
  ARRAY[
    'Client deadline is too aggressive for the network latency and ledger processing time',
    'The ledger is under heavy load, increasing processing latency',
    'Network latency between client and participant is higher than expected',
    'A complex transaction requires more time for consensus than the deadline allows'
  ],
  ARRAY[
    'CRITICAL: Check the command completion stream for the command ID before retrying to avoid duplicates',
    'Increase the gRPC deadline to account for realistic processing times (Canton recommends 30-60 seconds)',
    'Monitor end-to-end latency metrics to establish appropriate deadline values',
    'Use the command deduplication mechanism as a safety net against accidental double-submissions'
  ],
  'https://docs.daml.com/canton/usermanual/error-codes.html#deadlineexceededrequeststateunknown',
  false,
  NULL
),

(
  'SUBMISSION_RESULT_UNKNOWN',
  'DeadlineExceededRequestStateUnknown',
  'DEADLINE_EXCEEDED',
  'The command was submitted to the ledger but the result could not be determined within the timeout. This is different from REQUEST_DEADLINE_EXCEEDED in that the submission was acknowledged, but the confirmation (commit or reject) was not received in time. The transaction is likely still being processed by the domain.',
  ARRAY[
    'Domain consensus is taking longer than expected due to network latency between participants',
    'The mediator or sequencer is under heavy load',
    'One of the confirming participants is slow to respond',
    'Network partition temporarily separated the participant from the domain'
  ],
  ARRAY[
    'Query the command completion stream to check if the transaction was eventually committed',
    'Do NOT blindly retry — the original transaction may still commit and you''d create a duplicate',
    'Use command deduplication with the same command ID if you need to retry safely',
    'If the outcome matters immediately, query the ACS for the expected state change'
  ],
  'https://docs.daml.com/canton/usermanual/error-codes.html#deadlineexceededrequeststateunknown',
  false,
  NULL
)
ON CONFLICT (error_code_id) DO NOTHING;

-- ============================================================================
-- Error Codes for: SystemInternalAssumptionViolated
-- gRPC: INTERNAL
-- These are platform bugs — not fixable by the developer
-- ============================================================================

INSERT INTO error_codes (error_code_id, category_id, grpc_status_code, human_explanation, common_causes, suggested_fixes, documentation_url, requires_admin, added_in_version) VALUES

(
  'INTERNAL_ERROR',
  'SystemInternalAssumptionViolated',
  'INTERNAL',
  'An unexpected internal error occurred within the Canton participant. This indicates a bug or an unanticipated state in the platform software. The error details should contain a correlation ID that can be used to find the full stack trace in the participant''s server-side logs. This is not caused by your application code.',
  ARRAY[
    'A bug in the Canton participant software triggered an unexpected exception',
    'Data corruption or inconsistency in the participant''s internal state',
    'An edge case in the Daml engine that was not handled',
    'Incompatibility between participant components after a partial upgrade'
  ],
  ARRAY[
    'Record the correlation ID from the error response for debugging',
    'Check the participant server logs for the full stack trace using the correlation ID',
    'Report the issue to your Canton operator or Digital Asset support with full details',
    'If blocking a critical workflow, try restarting the participant as a temporary workaround'
  ],
  'https://docs.daml.com/canton/usermanual/error-codes.html#systeminternalassumptionviolated',
  true,
  NULL
),

(
  'LEDGER_API_INTERNAL_ERROR',
  'SystemInternalAssumptionViolated',
  'INTERNAL',
  'An internal error occurred specifically in the Ledger API server component of the participant. The Ledger API translates between the gRPC interface and the Canton participant internals. This error means the translation layer hit an unexpected state, which may be different from errors in the core Canton components.',
  ARRAY[
    'Bug in the Ledger API server''s request/response handling',
    'Unexpected data format received from the Canton sync service',
    'Memory pressure causing serialization failures in the API layer',
    'Incompatible state between the Ledger API indexer and the underlying ledger'
  ],
  ARRAY[
    'Record the correlation ID and check the participant''s Ledger API server logs',
    'If the error is reproducible, capture the exact request that triggers it for a bug report',
    'Try the operation again — some internal errors are caused by transient conditions',
    'Report to your Canton operator with the correlation ID, request details, and Canton version'
  ],
  'https://docs.daml.com/canton/usermanual/error-codes.html#systeminternalassumptionviolated',
  true,
  NULL
)
ON CONFLICT (error_code_id) DO NOTHING;

-- ============================================================================
-- Error Codes for: InvalidGivenCurrentSystemStateOther
-- gRPC: FAILED_PRECONDITION
-- Mutable state preconditions not met — may be retryable after state changes
-- ============================================================================

INSERT INTO error_codes (error_code_id, category_id, grpc_status_code, human_explanation, common_causes, suggested_fixes, documentation_url, requires_admin, added_in_version) VALUES

(
  'PACKAGE_NOT_VETTED',
  'InvalidGivenCurrentSystemStateOther',
  'FAILED_PRECONDITION',
  'A referenced package has been uploaded to the participant but has not been vetted yet. In Canton, packages must go through a vetting process (a topology transaction) before they can be used in commands. The package exists on the participant''s local store but is not authorized for use on the domain.',
  ARRAY[
    'The DAR was uploaded but the automatic vetting topology transaction has not been processed yet',
    'The package was uploaded with vetting disabled and requires manual vetting',
    'The domain topology manager has not yet processed the vetting request',
    'The vetting was rejected by the domain due to policy constraints'
  ],
  ARRAY[
    'Wait a few seconds and retry — vetting topology transactions may still be in flight',
    'Check the vetting status using the topology management endpoints',
    'If manual vetting is required, approve the package vetting through the admin console',
    'Contact the domain operator if vetting is consistently failing'
  ],
  'https://docs.daml.com/canton/usermanual/error-codes.html#invalidgivencurrentsystemstateother',
  false,
  NULL
),

(
  'PARTY_NOT_ENABLED_ON_DOMAIN',
  'InvalidGivenCurrentSystemStateOther',
  'FAILED_PRECONDITION',
  'The party is allocated on this participant but is not enabled on the target domain. In Canton, a party must have an active party-to-participant mapping on the specific domain where the transaction is being processed. The party exists but cannot transact on this domain.',
  ARRAY[
    'The party was allocated locally but the domain topology mapping is not yet established',
    'The party was disabled on this domain by an administrator',
    'The domain is new and party mappings have not been migrated',
    'A multi-domain setup where the party is enabled on a different domain'
  ],
  ARRAY[
    'Enable the party on the target domain through the topology management admin commands',
    'Wait for the topology transaction to propagate if it was recently submitted',
    'Verify which domains the party is enabled on using the topology queries',
    'Contact the domain operator if you lack admin permissions to manage party-domain mappings'
  ],
  'https://docs.daml.com/canton/usermanual/error-codes.html#invalidgivencurrentsystemstateother',
  false,
  NULL
)
ON CONFLICT (error_code_id) DO NOTHING;

-- ============================================================================
-- Error Codes for: MaliciousOrFaultyBehaviour
-- gRPC: INTERNAL (deliberately vague for security)
-- Security-sensitive — details hidden from API responses
-- ============================================================================

INSERT INTO error_codes (error_code_id, category_id, grpc_status_code, human_explanation, common_causes, suggested_fixes, documentation_url, requires_admin, added_in_version) VALUES

(
  'MALICIOUS_SUBMISSION',
  'MaliciousOrFaultyBehaviour',
  'INTERNAL',
  'A security check failed during transaction processing. The details of this failure are deliberately withheld from the API response to prevent information leakage. This error indicates that something in the transaction processing pipeline detected behavior that does not conform to the Canton protocol — this could be a misconfigured participant, a software bug, or potentially malicious activity.',
  ARRAY[
    'A participant in the network sent an invalid or unexpected protocol message',
    'Signature verification failed for a transaction component',
    'A participant attempted to authorize an action it should not have access to',
    'Protocol version mismatch between participants causing message validation failures'
  ],
  ARRAY[
    'Contact your Canton operator — they can see the full details in the server-side logs',
    'Provide the correlation ID so the operator can investigate the specific failure',
    'Check if there were recent Canton version upgrades that might cause protocol mismatches',
    'Do not retry — the security check will fail again for the same transaction'
  ],
  'https://docs.daml.com/canton/usermanual/error-codes.html#maliciousorfaultybehaviour',
  true,
  NULL
)
ON CONFLICT (error_code_id) DO NOTHING;

-- ============================================================================
-- Error Codes for: InternalUnsupportedOperation
-- gRPC: UNIMPLEMENTED
-- The operation is not supported on this participant
-- ============================================================================

INSERT INTO error_codes (error_code_id, category_id, grpc_status_code, human_explanation, common_causes, suggested_fixes, documentation_url, requires_admin, added_in_version) VALUES

(
  'UNSUPPORTED_OPERATION',
  'InternalUnsupportedOperation',
  'UNIMPLEMENTED',
  'The requested API operation is not implemented or not available on this participant. This can occur when using an API endpoint that is only available in Canton Enterprise, when calling an endpoint that has been removed in the current version, or when the participant does not support the requested feature.',
  ARRAY[
    'Using an Enterprise-only feature on Canton Community Edition',
    'Calling an API endpoint that was deprecated and removed in this Canton version',
    'The participant version does not support this specific operation',
    'Feature flags disable this operation on the current deployment'
  ],
  ARRAY[
    'Check the Canton documentation for your version to confirm the operation is available',
    'Verify whether the feature requires Canton Enterprise edition',
    'Upgrade to a newer Canton version if the feature was added in a later release',
    'Use an alternative API endpoint that provides similar functionality'
  ],
  'https://docs.daml.com/canton/usermanual/error-codes.html#internalunsupportedoperation',
  false,
  NULL
)
ON CONFLICT (error_code_id) DO NOTHING;

COMMIT;
