-- CantonTrace: Session Tracking
-- Migration 005 — Command history and simulation tracking tables
-- PostgreSQL 15+

BEGIN;

INSERT INTO schema_migrations (version, filename) VALUES (5, '005_session_tracking.sql')
  ON CONFLICT (version) DO NOTHING;

-- ============================================================================
-- command_history — Track commands submitted through each connection
-- ============================================================================
-- Records every command submission for the Error Debugger's history view.
-- Links to the error knowledge base when commands fail, providing instant
-- access to explanations and suggested fixes.
CREATE TABLE command_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID REFERENCES connections(id) ON DELETE CASCADE,
  command_id TEXT NOT NULL,              -- Ledger API command ID
  submission_id TEXT,                    -- Submission ID (for tracking through async submission)
  update_id TEXT,                        -- Transaction/update ID if command succeeded
  status TEXT NOT NULL
    CHECK (status IN ('pending', 'succeeded', 'failed')),
  template_id TEXT,                      -- Full template ID (package:module:template)
  choice TEXT,                           -- Choice name if this was an exercise command
  act_as TEXT[],                         -- Parties that submitted the command
  error_code_id TEXT REFERENCES error_codes(error_code_id), -- Link to knowledge base on failure
  error_details JSONB,                   -- Full error details from the Ledger API:
                                         -- { grpcStatus, message, metadata, correlationId,
                                         --   retryIn, definiteAnswer }
  submitted_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- ============================================================================
-- simulation_history — Track Daml command simulations
-- ============================================================================
-- Records simulation (dry-run) results for comparison with actual execution.
-- Supports both online simulations (against live ledger) and offline
-- simulations (against a cached/modified ACS snapshot).
CREATE TABLE simulation_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID REFERENCES connections(id) ON DELETE CASCADE,
  command_id TEXT,                       -- Optional: link to a real command for comparison
  mode TEXT NOT NULL
    CHECK (mode IN ('online', 'offline')),
  request JSONB NOT NULL,               -- The simulation request payload:
                                         -- { commands, actAs, readAs, offset? }
  result JSONB NOT NULL,                -- The simulation result:
                                         -- { transaction?, error?, disclosures, warnings }
  at_offset TEXT NOT NULL,               -- Ledger offset at which the simulation was run
  simulated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- Indexes for command_history
-- ============================================================================

-- Lookup commands by connection (primary access pattern)
CREATE INDEX idx_command_history_connection ON command_history(connection_id);

-- Lookup by command ID (for deduplication checks and completion correlation)
CREATE INDEX idx_command_history_command_id ON command_history(command_id);

-- Filter by status (for dashboard: pending commands, failed commands)
CREATE INDEX idx_command_history_status ON command_history(status);

-- Lookup by update ID (for linking transactions back to commands)
CREATE INDEX idx_command_history_update_id ON command_history(update_id)
  WHERE update_id IS NOT NULL;

-- Lookup by error code (for error analytics: "which errors occur most?")
CREATE INDEX idx_command_history_error_code ON command_history(error_code_id)
  WHERE error_code_id IS NOT NULL;

-- Time-range queries for history browsing
CREATE INDEX idx_command_history_submitted_at ON command_history(connection_id, submitted_at DESC);

-- Lookup by template for template-specific error analysis
CREATE INDEX idx_command_history_template ON command_history(template_id)
  WHERE template_id IS NOT NULL;

-- ============================================================================
-- Indexes for simulation_history
-- ============================================================================

-- Lookup simulations by connection
CREATE INDEX idx_simulation_history_connection ON simulation_history(connection_id);

-- Lookup simulations by command ID (for comparing sim vs. actual)
CREATE INDEX idx_simulation_history_command_id ON simulation_history(command_id)
  WHERE command_id IS NOT NULL;

-- Time-range queries for simulation history browsing
CREATE INDEX idx_simulation_history_simulated_at ON simulation_history(connection_id, simulated_at DESC);

COMMIT;
