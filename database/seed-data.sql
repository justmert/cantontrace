-- CantonTrace: Development Seed Data
-- Optional seed data for local development and testing.
-- Run AFTER migrations: psql $DATABASE_URL -f seed-data.sql
--
-- This creates sample connections, sandboxes, and command history
-- so the UI has data to display during development.

BEGIN;

-- ============================================================================
-- Sample Connection: Local Canton Sandbox
-- ============================================================================

INSERT INTO connections (
  id,
  ledger_api_endpoint,
  api_version,
  pruning_offset,
  current_offset,
  user_id,
  party_rights,
  status
) VALUES (
  'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  'localhost:6865',
  '2.0',
  '00000000000000000a',
  '00000000000000002f',
  'alice_user',
  '[
    {"party": "Alice::1220abcdef", "rights": ["CanActAs", "CanReadAs"]},
    {"party": "Bob::1220fedcba", "rights": ["CanReadAs"]}
  ]'::jsonb,
  'active'
);

-- ============================================================================
-- Sample Connection: Remote Participant (disconnected)
-- ============================================================================

INSERT INTO connections (
  id,
  ledger_api_endpoint,
  iam_url,
  api_version,
  current_offset,
  user_id,
  party_rights,
  status,
  connected_at,
  last_active_at
) VALUES (
  'b2c3d4e5-f6a7-8901-bcde-f12345678901',
  'canton-participant.example.com:6865',
  'https://auth.example.com/oauth2/token',
  '2.0',
  '0000000000000001a4',
  'operator',
  '[
    {"party": "Operator::1220112233", "rights": ["CanActAs", "CanReadAs"]}
  ]'::jsonb,
  'disconnected',
  NOW() - INTERVAL '2 hours',
  NOW() - INTERVAL '30 minutes'
);

-- ============================================================================
-- Sample Sandbox: Running instance
-- ============================================================================

INSERT INTO sandboxes (
  id,
  status,
  ledger_api_endpoint,
  ledger_api_port,
  container_id,
  parties,
  uploaded_dars,
  profiling_enabled,
  share_token
) VALUES (
  'c3d4e5f6-a7b8-9012-cdef-123456789012',
  'running',
  'localhost:16865',
  16865,
  'canton-sandbox-abc123def456',
  '["Alice::sandbox1", "Bob::sandbox1", "Bank::sandbox1"]'::jsonb,
  '[
    {
      "darHash": "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      "packageIds": ["pkg-main-1.0.0", "pkg-lib-1.0.0"],
      "uploadedAt": "2026-04-02T10:00:00Z"
    }
  ]'::jsonb,
  false,
  'share_xK9mN2pL5qR8'
);

-- ============================================================================
-- Sample Sandbox: Stopped instance (for history)
-- ============================================================================

INSERT INTO sandboxes (
  id,
  status,
  ledger_api_port,
  parties,
  created_at,
  last_accessed_at
) VALUES (
  'd4e5f6a7-b8c9-0123-defa-234567890123',
  'stopped',
  16866,
  '["TestParty::sandbox2"]'::jsonb,
  NOW() - INTERVAL '1 day',
  NOW() - INTERVAL '6 hours'
);

-- ============================================================================
-- Sample Package Metadata
-- ============================================================================

INSERT INTO package_metadata (package_id, package_name, package_version, modules, has_source) VALUES
(
  'pkg-main-1.0.0',
  'my-daml-app',
  '1.0.0',
  '[
    {
      "name": "Main",
      "templates": [
        {
          "name": "Asset",
          "key": {"type": "Party", "maintainer": "issuer"},
          "signatories": ["issuer"],
          "observers": ["owner"],
          "choices": [
            {"name": "Transfer", "consuming": true, "argType": "Party", "returnType": "ContractId Asset"},
            {"name": "Archive", "consuming": true, "argType": "()", "returnType": "()"}
          ]
        },
        {
          "name": "AssetTransferProposal",
          "key": null,
          "signatories": ["issuer"],
          "observers": ["newOwner"],
          "choices": [
            {"name": "Accept", "consuming": true, "argType": "()", "returnType": "ContractId Asset"},
            {"name": "Reject", "consuming": true, "argType": "()", "returnType": "()"}
          ]
        }
      ],
      "dataTypes": [
        {"name": "AssetDetails", "fields": [{"name": "description", "type": "Text"}, {"name": "quantity", "type": "Int"}]}
      ]
    }
  ]'::jsonb,
  true
),
(
  'pkg-lib-1.0.0',
  'daml-stdlib',
  '1.0.0',
  '[
    {
      "name": "DA.Internal.LF",
      "templates": [],
      "dataTypes": []
    }
  ]'::jsonb,
  false
);

-- ============================================================================
-- Sample DAR Source
-- ============================================================================

INSERT INTO dar_sources (package_id, dar_hash, file_path, source_content) VALUES
(
  'pkg-main-1.0.0',
  'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
  'Main.daml',
  E'module Main where\n\nimport Daml.Script\n\ntemplate Asset\n  with\n    issuer : Party\n    owner : Party\n    details : AssetDetails\n  where\n    signatory issuer\n    observer owner\n    key issuer : Party\n    maintainer key\n\n    choice Transfer : ContractId Asset\n      with\n        newOwner : Party\n      controller owner\n      do\n        create this with owner = newOwner\n\ndata AssetDetails = AssetDetails\n  with\n    description : Text\n    quantity : Int\n  deriving (Eq, Show)\n\ntemplate AssetTransferProposal\n  with\n    issuer : Party\n    newOwner : Party\n    asset : AssetDetails\n  where\n    signatory issuer\n    observer newOwner\n\n    choice Accept : ContractId Asset\n      controller newOwner\n      do\n        create Asset with\n          issuer\n          owner = newOwner\n          details = asset\n\n    choice Reject : ()\n      controller newOwner\n      do\n        pure ()\n'
);

-- ============================================================================
-- Sample Command History (mix of successes and failures)
-- ============================================================================

-- Successful create command
INSERT INTO command_history (
  connection_id,
  command_id,
  submission_id,
  update_id,
  status,
  template_id,
  act_as,
  submitted_at,
  completed_at
) VALUES (
  'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  'cmd-001-create-asset',
  'sub-001',
  'update-001',
  'succeeded',
  'pkg-main-1.0.0:Main:Asset',
  ARRAY['Alice::1220abcdef'],
  NOW() - INTERVAL '10 minutes',
  NOW() - INTERVAL '10 minutes' + INTERVAL '200 milliseconds'
);

-- Successful exercise command
INSERT INTO command_history (
  connection_id,
  command_id,
  submission_id,
  update_id,
  status,
  template_id,
  choice,
  act_as,
  submitted_at,
  completed_at
) VALUES (
  'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  'cmd-002-transfer-asset',
  'sub-002',
  'update-002',
  'succeeded',
  'pkg-main-1.0.0:Main:Asset',
  'Transfer',
  ARRAY['Alice::1220abcdef'],
  NOW() - INTERVAL '8 minutes',
  NOW() - INTERVAL '8 minutes' + INTERVAL '350 milliseconds'
);

-- Failed command: contract not found
INSERT INTO command_history (
  connection_id,
  command_id,
  submission_id,
  status,
  template_id,
  choice,
  act_as,
  error_code_id,
  error_details,
  submitted_at,
  completed_at
) VALUES (
  'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  'cmd-003-exercise-archived',
  'sub-003',
  'failed',
  'pkg-main-1.0.0:Main:Asset',
  'Transfer',
  ARRAY['Alice::1220abcdef'],
  'CONTRACT_NOT_FOUND',
  '{
    "grpcStatus": "NOT_FOUND",
    "message": "Contract could not be found with id 00abcdef...",
    "metadata": {
      "errorCode": "CONTRACT_NOT_FOUND",
      "correlationId": "corr-abc-123"
    },
    "definiteAnswer": true
  }'::jsonb,
  NOW() - INTERVAL '5 minutes',
  NOW() - INTERVAL '5 minutes' + INTERVAL '150 milliseconds'
);

-- Failed command: contention
INSERT INTO command_history (
  connection_id,
  command_id,
  submission_id,
  status,
  template_id,
  choice,
  act_as,
  error_code_id,
  error_details,
  submitted_at,
  completed_at
) VALUES (
  'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  'cmd-004-contention',
  'sub-004',
  'failed',
  'pkg-main-1.0.0:Main:Asset',
  'Transfer',
  ARRAY['Alice::1220abcdef'],
  'CONTRACT_NOT_ACTIVE',
  '{
    "grpcStatus": "ABORTED",
    "message": "Contract was consumed by a concurrent transaction",
    "metadata": {
      "errorCode": "CONTRACT_NOT_ACTIVE",
      "correlationId": "corr-def-456",
      "retryIn": "100ms"
    },
    "definiteAnswer": true
  }'::jsonb,
  NOW() - INTERVAL '3 minutes',
  NOW() - INTERVAL '3 minutes' + INTERVAL '90 milliseconds'
);

-- Pending command (in-flight)
INSERT INTO command_history (
  connection_id,
  command_id,
  submission_id,
  status,
  template_id,
  act_as,
  submitted_at
) VALUES (
  'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  'cmd-005-pending',
  'sub-005',
  'pending',
  'pkg-main-1.0.0:Main:AssetTransferProposal',
  ARRAY['Alice::1220abcdef'],
  NOW() - INTERVAL '10 seconds'
);

-- ============================================================================
-- Sample Simulation
-- ============================================================================

INSERT INTO simulation_history (
  connection_id,
  command_id,
  mode,
  request,
  result,
  at_offset
) VALUES (
  'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  'cmd-002-transfer-asset',
  'online',
  '{
    "commands": [{
      "exercise": {
        "templateId": "pkg-main-1.0.0:Main:Asset",
        "contractId": "#1:0",
        "choice": "Transfer",
        "argument": {"newOwner": "Bob::1220fedcba"}
      }
    }],
    "actAs": ["Alice::1220abcdef"]
  }'::jsonb,
  '{
    "transaction": {
      "events": [
        {"archived": {"contractId": "#1:0", "templateId": "pkg-main-1.0.0:Main:Asset"}},
        {"created": {"contractId": "#2:0", "templateId": "pkg-main-1.0.0:Main:Asset", "signatories": ["Alice::1220abcdef"], "observers": ["Bob::1220fedcba"]}}
      ]
    },
    "warnings": []
  }'::jsonb,
  '00000000000000002e'
);

-- ============================================================================
-- Sample Alert Rule
-- ============================================================================

INSERT INTO alert_rules (
  connection_id,
  name,
  rule_type,
  conditions,
  actions,
  enabled
) VALUES (
  'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  'High Contention Alert',
  'contention',
  '{
    "templateId": "pkg-main-1.0.0:Main:Asset",
    "threshold": 5,
    "windowSeconds": 60
  }'::jsonb,
  '[
    {"type": "in_app"},
    {"type": "webhook", "url": "https://hooks.slack.example.com/cantontrace"}
  ]'::jsonb,
  true
);

-- ============================================================================
-- Sample CI Run
-- ============================================================================

INSERT INTO ci_runs (
  sandbox_id,
  status,
  dar_hash,
  test_script,
  assertions,
  results,
  transaction_traces,
  started_at,
  completed_at,
  duration_ms
) VALUES (
  'c3d4e5f6-a7b8-9012-cdef-123456789012',
  'passed',
  'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
  'Main:testAssetTransfer',
  '[
    {"name": "asset_created", "type": "contract_exists", "templateId": "Main:Asset"},
    {"name": "transfer_succeeded", "type": "choice_succeeded", "templateId": "Main:Asset", "choice": "Transfer"}
  ]'::jsonb,
  '{
    "passed": 2,
    "failed": 0,
    "assertions": [
      {"name": "asset_created", "passed": true},
      {"name": "transfer_succeeded", "passed": true}
    ]
  }'::jsonb,
  '["update-ci-001", "update-ci-002"]'::jsonb,
  NOW() - INTERVAL '30 minutes',
  NOW() - INTERVAL '29 minutes',
  4523
);

COMMIT;
