#!/usr/bin/env bash
# CantonTrace Database Migration Runner
# Runs all SQL migrations in order against a PostgreSQL database.
#
# Usage:
#   ./migrate.sh [DATABASE_URL]
#
# Environment:
#   DATABASE_URL — PostgreSQL connection string (default: from environment)
#
# Examples:
#   ./migrate.sh postgres://user:pass@localhost:5432/cantontrace
#   DATABASE_URL=postgres://... ./migrate.sh
#   ./migrate.sh  # uses DATABASE_URL from environment

set -euo pipefail

# --- Configuration -----------------------------------------------------------

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIGRATIONS_DIR="${SCRIPT_DIR}/migrations"

# Accept DATABASE_URL as argument or from environment
DATABASE_URL="${1:-${DATABASE_URL:-}}"

if [[ -z "${DATABASE_URL}" ]]; then
  echo "ERROR: No database URL provided."
  echo ""
  echo "Usage: $0 [DATABASE_URL]"
  echo "   or: DATABASE_URL=postgres://... $0"
  echo ""
  echo "Example: $0 postgres://cantontrace:cantontrace@localhost:5432/cantontrace"
  exit 1
fi

# --- Color output (if terminal supports it) -----------------------------------

if [[ -t 1 ]]; then
  RED='\033[0;31m'
  GREEN='\033[0;32m'
  YELLOW='\033[0;33m'
  BLUE='\033[0;34m'
  NC='\033[0m' # No Color
else
  RED=''
  GREEN=''
  YELLOW=''
  BLUE=''
  NC=''
fi

log_info()  { echo -e "${BLUE}[INFO]${NC}  $*"; }
log_ok()    { echo -e "${GREEN}[OK]${NC}    $*"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
log_error() { echo -e "${RED}[ERROR]${NC} $*"; }

# --- Preflight checks --------------------------------------------------------

if ! command -v psql &>/dev/null; then
  log_error "psql is not installed or not in PATH."
  echo "  Install PostgreSQL client tools:"
  echo "    macOS:  brew install libpq && brew link --force libpq"
  echo "    Debian: apt-get install postgresql-client"
  exit 1
fi

if [[ ! -d "${MIGRATIONS_DIR}" ]]; then
  log_error "Migrations directory not found: ${MIGRATIONS_DIR}"
  exit 1
fi

# Test database connectivity
if ! psql "${DATABASE_URL}" -c "SELECT 1;" &>/dev/null; then
  log_error "Cannot connect to database."
  echo "  Verify the connection string and that the database is running."
  echo "  URL: $(echo "${DATABASE_URL}" | sed 's|://[^:]*:[^@]*@|://***:***@|')"  # Mask credentials in output
  exit 1
fi

log_info "Connected to database successfully."

# --- Ensure schema_migrations table exists ------------------------------------

# The first migration creates this table, but if running migrations for the
# first time we need to handle the case where it doesn't exist yet.
# We check if the table exists; if not, the first migration will create it.
TABLE_EXISTS=$(psql "${DATABASE_URL}" -tAc \
  "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'schema_migrations');" \
  2>/dev/null || echo "f")

if [[ "${TABLE_EXISTS}" == "t" ]]; then
  log_info "schema_migrations table found. Checking applied migrations..."
else
  log_info "schema_migrations table not found. Will be created by first migration."
fi

# --- Collect and run migrations -----------------------------------------------

MIGRATION_COUNT=0
APPLIED_COUNT=0
SKIPPED_COUNT=0
FAILED=0

# Sort migration files by name (which gives numeric order with NNN_ prefix)
for migration_file in "${MIGRATIONS_DIR}"/*.sql; do
  [[ -f "${migration_file}" ]] || continue

  filename="$(basename "${migration_file}")"
  # Extract version number from filename (e.g., "001" from "001_initial_schema.sql")
  version_str="${filename%%_*}"
  version=$((10#${version_str}))  # Remove leading zeros for numeric comparison

  MIGRATION_COUNT=$((MIGRATION_COUNT + 1))

  # Check if already applied
  if [[ "${TABLE_EXISTS}" == "t" ]]; then
    already_applied=$(psql "${DATABASE_URL}" -tAc \
      "SELECT EXISTS (SELECT 1 FROM schema_migrations WHERE version = ${version});" \
      2>/dev/null || echo "f")

    if [[ "${already_applied}" == "t" ]]; then
      log_ok "Migration ${filename} — already applied, skipping."
      SKIPPED_COUNT=$((SKIPPED_COUNT + 1))
      continue
    fi
  fi

  # Apply migration
  log_info "Applying migration: ${filename} ..."

  if psql "${DATABASE_URL}" -v ON_ERROR_STOP=1 -f "${migration_file}" 2>&1; then
    log_ok "Migration ${filename} — applied successfully."
    APPLIED_COUNT=$((APPLIED_COUNT + 1))
    # After first migration, the table should exist
    TABLE_EXISTS="t"
  else
    log_error "Migration ${filename} — FAILED!"
    FAILED=1
    break
  fi
done

# --- Summary ------------------------------------------------------------------

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo " Migration Summary"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Total migrations found:  ${MIGRATION_COUNT}"
echo "  Already applied (skip):  ${SKIPPED_COUNT}"
echo "  Newly applied:           ${APPLIED_COUNT}"

if [[ ${FAILED} -eq 1 ]]; then
  log_error "Migration run FAILED. Database may be in an inconsistent state."
  echo "  Fix the failing migration and re-run this script."
  exit 1
else
  log_ok "All migrations applied successfully."
fi

# Show current state
if [[ "${TABLE_EXISTS}" == "t" ]]; then
  echo ""
  log_info "Applied migrations:"
  psql "${DATABASE_URL}" -c \
    "SELECT version, filename, applied_at FROM schema_migrations ORDER BY version;" \
    2>/dev/null
fi
