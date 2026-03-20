-- CantonTrace: Initial Schema
-- Migration 001 — Core platform tables
-- PostgreSQL 15+

BEGIN;

-- ============================================================================
-- Schema version tracking
-- ============================================================================
CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  filename TEXT NOT NULL,
  applied_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO schema_migrations (version, filename) VALUES (1, '001_initial_schema.sql')
  ON CONFLICT (version) DO NOTHING;

-- ============================================================================
-- connections — Platform sessions and ledger connection state
-- ============================================================================
-- Each row represents a connection from the frontend to a Canton ledger.
-- Stores bootstrap info (offsets, party rights, API version) for session reuse.
CREATE TABLE connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ledger_api_endpoint TEXT NOT NULL,
  iam_url TEXT,                          -- IAM/auth endpoint if applicable
  sandbox_id TEXT,                       -- If connected to a managed sandbox
  api_version TEXT,                      -- Ledger API version reported by server
  pruning_offset TEXT,                   -- Earliest available offset (pruning boundary)
  current_offset TEXT,                   -- Ledger end at last check
  user_id TEXT,                          -- Authenticated user ID (Ledger API UserManagement)
  party_rights JSONB DEFAULT '[]',       -- Array of { party, rights: ["CanActAs", "CanReadAs"] }
  connected_at TIMESTAMPTZ DEFAULT NOW(),
  last_active_at TIMESTAMPTZ DEFAULT NOW(),
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'disconnected', 'error'))
);

-- ============================================================================
-- sandboxes — Managed Canton sandbox instances
-- ============================================================================
-- The platform can spin up isolated Canton sandboxes for testing/CI.
-- Each sandbox has its own ledger API endpoint and lifecycle.
CREATE TABLE sandboxes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status TEXT NOT NULL DEFAULT 'provisioning'
    CHECK (status IN ('provisioning', 'running', 'stopped', 'error')),
  ledger_api_endpoint TEXT,              -- gRPC endpoint once running
  ledger_api_port INTEGER,               -- Port number for the ledger API
  container_id TEXT,                     -- Docker container ID if containerized
  parties JSONB DEFAULT '[]',            -- Array of allocated party IDs
  uploaded_dars JSONB DEFAULT '[]',      -- Array of { darHash, packageIds, uploadedAt }
  profiling_enabled BOOLEAN DEFAULT false,
  share_token TEXT UNIQUE,               -- Token for sharing sandbox access (URL-safe)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_accessed_at TIMESTAMPTZ DEFAULT NOW(),
  auto_cleanup_at TIMESTAMPTZ            -- Scheduled cleanup time for idle sandboxes
);

-- ============================================================================
-- dar_sources — Extracted Daml source files from DAR archives
-- ============================================================================
-- When a DAR is uploaded, source files (.daml) are extracted and stored here
-- so the Transaction Trace Viewer can display original source alongside events.
CREATE TABLE dar_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id TEXT NOT NULL,              -- Daml package ID (hash)
  dar_hash TEXT NOT NULL,                -- SHA-256 of the uploaded DAR file
  file_path TEXT NOT NULL,               -- Relative path, e.g. "Main.daml", "Lib/Utils.daml"
  source_content TEXT NOT NULL,          -- Full file contents
  extracted_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(package_id, file_path)
);

-- ============================================================================
-- package_metadata — Parsed DALF package metadata cache
-- ============================================================================
-- Caches the parsed module/template/choice structure from DALF packages.
-- Used by the Transaction Trace Viewer and ACS Explorer to resolve types.
CREATE TABLE package_metadata (
  package_id TEXT PRIMARY KEY,           -- Daml package ID (hash)
  package_name TEXT,                     -- Human-readable package name
  package_version TEXT,                  -- Semantic version if available
  modules JSONB NOT NULL,               -- Array of module definitions:
                                         -- [{ name, templates: [{ name, key, signatories,
                                         --    observers, choices: [{ name, consuming, argType,
                                         --    returnType }] }], dataTypes: [...] }]
  has_source BOOLEAN DEFAULT false,      -- Whether dar_sources has Daml source for this package
  parsed_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- alert_rules — User-defined alert/notification rules
-- ============================================================================
-- Users can set up rules to be notified about specific error patterns,
-- template events, contention spikes, or custom conditions.
CREATE TABLE alert_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID REFERENCES connections(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  rule_type TEXT NOT NULL
    CHECK (rule_type IN ('error_category', 'template_event', 'contention', 'custom')),
  conditions JSONB NOT NULL,             -- Rule-type-specific conditions:
                                         -- error_category: { categoryId, errorCodes?, threshold? }
                                         -- template_event: { templateId, choices?, eventType }
                                         -- contention: { templateId?, threshold, windowSeconds }
                                         -- custom: { expression }
  actions JSONB NOT NULL,                -- Array of actions:
                                         -- [{ type: "webhook", url, headers? },
                                         --  { type: "email", address },
                                         --  { type: "in_app" }]
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- ci_runs — CI/CD test run history
-- ============================================================================
-- Records each CI test run against a sandbox, including DAR hash,
-- test script, assertion results, and collected transaction traces.
CREATE TABLE ci_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sandbox_id UUID REFERENCES sandboxes(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'passed', 'failed', 'error')),
  dar_hash TEXT NOT NULL,                -- SHA-256 of the DAR under test
  test_script TEXT,                      -- Name of the Daml Script being run
  assertions JSONB DEFAULT '[]',         -- Array of assertion definitions
  results JSONB,                         -- Structured test results after completion
  transaction_traces JSONB DEFAULT '[]', -- Array of update_ids for trace collection
  errors JSONB DEFAULT '[]',             -- Array of errors encountered
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER
);

-- ============================================================================
-- Indexes
-- ============================================================================

-- connections: filter by status for active session listing
CREATE INDEX idx_connections_status ON connections(status);

-- connections: lookup by last_active for idle cleanup
CREATE INDEX idx_connections_last_active ON connections(last_active_at);

-- sandboxes: filter by status for management UI
CREATE INDEX idx_sandboxes_status ON sandboxes(status);

-- sandboxes: share_token already has a unique index from the UNIQUE constraint

-- sandboxes: find sandboxes due for cleanup
CREATE INDEX idx_sandboxes_auto_cleanup ON sandboxes(auto_cleanup_at)
  WHERE auto_cleanup_at IS NOT NULL;

-- dar_sources: lookup by package for source display
CREATE INDEX idx_dar_sources_package_id ON dar_sources(package_id);

-- dar_sources: lookup by DAR hash for deduplication
CREATE INDEX idx_dar_sources_dar_hash ON dar_sources(dar_hash);

-- package_metadata: search by package name
CREATE INDEX idx_package_metadata_name ON package_metadata(package_name)
  WHERE package_name IS NOT NULL;

-- alert_rules: lookup by connection
CREATE INDEX idx_alert_rules_connection ON alert_rules(connection_id);

-- alert_rules: filter enabled rules
CREATE INDEX idx_alert_rules_enabled ON alert_rules(connection_id, enabled)
  WHERE enabled = true;

-- ci_runs: filter by status for dashboard
CREATE INDEX idx_ci_runs_status ON ci_runs(status);

-- ci_runs: lookup by sandbox
CREATE INDEX idx_ci_runs_sandbox ON ci_runs(sandbox_id);

-- ci_runs: lookup by DAR hash to find runs for a specific package
CREATE INDEX idx_ci_runs_dar_hash ON ci_runs(dar_hash);

COMMIT;
