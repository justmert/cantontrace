-- CantonTrace: Error Knowledge Base Schema
-- Migration 002 — Error taxonomy tables for the Error Debugger
-- PostgreSQL 15+

BEGIN;

INSERT INTO schema_migrations (version, filename) VALUES (2, '002_error_knowledge_base.sql')
  ON CONFLICT (version) DO NOTHING;

-- ============================================================================
-- error_categories — Canton's 11 error categories
-- ============================================================================
-- Canton organizes all errors into categories based on their gRPC status code
-- and retryability semantics. Each category has consistent behavior that
-- developers can rely on when building retry/recovery logic.
CREATE TABLE error_categories (
  id TEXT PRIMARY KEY,                   -- Machine-readable ID, e.g. 'ContentionOnSharedResources'
  grpc_status_code TEXT NOT NULL,        -- gRPC code, e.g. 'ABORTED', 'NOT_FOUND'
  display_name TEXT NOT NULL,            -- Human-friendly name for UI display
  description TEXT NOT NULL,             -- Full description of this category
  general_guidance TEXT NOT NULL,        -- General advice for handling errors in this category
  severity TEXT NOT NULL
    CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  is_retryable BOOLEAN DEFAULT false,   -- Whether errors in this category can be retried
  is_security_sensitive BOOLEAN DEFAULT false  -- Whether error details are stripped from API responses
);

-- ============================================================================
-- error_codes — Individual Canton error codes within categories
-- ============================================================================
-- Each error code represents a specific failure mode. The knowledge base
-- provides human explanations, common causes, and suggested fixes so
-- developers can quickly diagnose and resolve issues.
CREATE TABLE error_codes (
  error_code_id TEXT PRIMARY KEY,        -- Machine-readable error code, e.g. 'CONTRACT_NOT_FOUND'
  category_id TEXT NOT NULL REFERENCES error_categories(id),
  grpc_status_code TEXT NOT NULL,        -- gRPC status code for this specific error
  human_explanation TEXT NOT NULL,        -- 2-3 sentence explanation of what happened and why
  common_causes TEXT[] NOT NULL DEFAULT '{}',  -- Array of common causes
  suggested_fixes TEXT[] NOT NULL DEFAULT '{}', -- Array of actionable fixes
  documentation_url TEXT,                -- Link to Canton documentation
  affects_template TEXT,                 -- Template ID if error is template-specific
  requires_admin BOOLEAN DEFAULT false,  -- Whether resolution requires admin/operator access
  added_in_version TEXT                  -- Canton version this error was introduced
);

-- ============================================================================
-- Indexes
-- ============================================================================

-- error_codes: lookup by category for category drill-down
CREATE INDEX idx_error_codes_category ON error_codes(category_id);

-- error_codes: lookup by gRPC status code for raw error mapping
CREATE INDEX idx_error_codes_grpc_status ON error_codes(grpc_status_code);

-- error_codes: filter admin-required errors
CREATE INDEX idx_error_codes_requires_admin ON error_codes(requires_admin)
  WHERE requires_admin = true;

COMMIT;
