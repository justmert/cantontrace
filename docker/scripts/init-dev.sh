#!/usr/bin/env bash
# init-dev.sh — Initialize CantonTrace development environment
#
# This script:
#   1. Copies .env.example to .env if .env doesn't exist
#   2. Starts Docker services (postgres, redis)
#   3. Waits for services to be healthy
#   4. Runs database migrations
#   5. Optionally starts a Canton sandbox for integration testing
#
# Usage:
#   ./docker/scripts/init-dev.sh              # Start infra only
#   ./docker/scripts/init-dev.sh --sandbox    # Start infra + Canton sandbox
#   ./docker/scripts/init-dev.sh --all        # Start all services (frontend, api, engine)
#   ./docker/scripts/init-dev.sh --reset      # Reset volumes and restart

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No color

info()  { echo -e "${BLUE}[INFO]${NC}  $*"; }
ok()    { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }

# --- Parse arguments ---
START_SANDBOX=false
START_ALL=false
RESET_VOLUMES=false

for arg in "$@"; do
    case $arg in
        --sandbox)  START_SANDBOX=true ;;
        --all)      START_ALL=true ;;
        --reset)    RESET_VOLUMES=true ;;
        --help|-h)
            echo "Usage: $(basename "$0") [--sandbox] [--all] [--reset]"
            echo ""
            echo "Options:"
            echo "  --sandbox   Start a Canton sandbox for integration testing"
            echo "  --all       Start all services (frontend, api-gateway, engine-service)"
            echo "  --reset     Remove existing volumes and start fresh"
            echo "  --help      Show this help message"
            exit 0
            ;;
        *)
            warn "Unknown argument: $arg"
            ;;
    esac
done

cd "$PROJECT_ROOT"

# --- Step 1: Environment file ---
info "Checking environment configuration..."
if [ ! -f .env ]; then
    cp .env.example .env
    ok "Created .env from .env.example"
    warn "Review .env and update values for your environment"
else
    ok ".env already exists"
fi

# --- Step 2: Check prerequisites ---
info "Checking prerequisites..."

if ! command -v docker &> /dev/null; then
    error "Docker is not installed. Install it from https://docs.docker.com/get-docker/"
fi

if ! docker info &> /dev/null 2>&1; then
    error "Docker daemon is not running. Start Docker Desktop or the Docker service."
fi

if ! command -v docker compose &> /dev/null && ! docker compose version &> /dev/null 2>&1; then
    error "Docker Compose (v2) is not available. Update Docker or install the compose plugin."
fi

ok "Docker and Docker Compose are available"

# --- Step 3: Reset volumes if requested ---
if [ "$RESET_VOLUMES" = true ]; then
    warn "Resetting all Docker volumes..."
    docker compose down -v 2>/dev/null || true
    ok "Volumes removed"
fi

# --- Step 4: Start infrastructure services ---
info "Starting infrastructure services (postgres, redis)..."
docker compose up -d postgres redis

# --- Step 5: Wait for services to be healthy ---
info "Waiting for PostgreSQL to be ready..."
RETRIES=30
until docker compose exec -T postgres pg_isready -U cantontrace > /dev/null 2>&1; do
    RETRIES=$((RETRIES - 1))
    if [ $RETRIES -le 0 ]; then
        error "PostgreSQL did not become ready in time"
    fi
    sleep 1
done
ok "PostgreSQL is ready"

info "Waiting for Redis to be ready..."
RETRIES=30
until docker compose exec -T redis redis-cli ping 2>/dev/null | grep -q PONG; do
    RETRIES=$((RETRIES - 1))
    if [ $RETRIES -le 0 ]; then
        error "Redis did not become ready in time"
    fi
    sleep 1
done
ok "Redis is ready"

# --- Step 6: Run database migrations ---
info "Waiting for database initialization to complete..."
RETRIES=15
until docker compose exec -T postgres psql -U cantontrace -d cantontrace -tAc \
    "SELECT 1 FROM schema_migrations LIMIT 1" > /dev/null 2>&1; do
    RETRIES=$((RETRIES - 1))
    if [ $RETRIES -le 0 ]; then
        warn "schema_migrations table not found — applying all migrations from scratch"
        break
    fi
    sleep 2
done

info "Running database migrations..."
for migration in database/migrations/*.sql; do
    if [ -f "$migration" ]; then
        filename=$(basename "$migration")
        # Check if migration was already applied
        applied=$(docker compose exec -T postgres psql -U cantontrace -d cantontrace -tAc \
            "SELECT COUNT(*) FROM schema_migrations WHERE filename = '$filename'" 2>/dev/null || echo "0")
        applied=$(echo "$applied" | tr -d '[:space:]')

        if [ "$applied" = "0" ] || [ "$applied" = "" ]; then
            info "  Applying $filename..."
            docker compose exec -T postgres psql -U cantontrace -d cantontrace < "$migration"
            ok "  Applied $filename"
        else
            ok "  $filename already applied — skipping"
        fi
    fi
done
ok "Database migrations complete"

# --- Step 7: Start all services if requested ---
if [ "$START_ALL" = true ]; then
    info "Starting all services with dev overrides..."
    docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d
    ok "All services started"
    echo ""
    info "Services:"
    echo "  Frontend:       http://localhost:5173"
    echo "  API Gateway:    http://localhost:3001"
    echo "  Engine Service: http://localhost:3002"
    echo "  PostgreSQL:     localhost:5432"
    echo "  Redis:          localhost:6379"
    echo "  Swagger UI:     http://localhost:3001/api/docs"
fi

# --- Step 8: Start Canton sandbox if requested ---
if [ "$START_SANDBOX" = true ]; then
    info "Starting Canton sandbox..."
    if command -v dpm &> /dev/null; then
        if [ -d test-fixtures/test-daml ] && [ -f test-fixtures/test-daml/.daml/dist/*.dar ] 2>/dev/null; then
            DAR_FILE=$(ls test-fixtures/test-daml/.daml/dist/*.dar 2>/dev/null | head -1)
            dpm sandbox --dar "$DAR_FILE" &
            SANDBOX_PID=$!
            info "Canton sandbox starting (PID: $SANDBOX_PID)"
            ok "Sandbox started — run test-fixtures/scripts/ to set up test data"
        else
            warn "No DAR file found. Build the test DAR first:"
            echo "  cd test-fixtures/test-daml && daml build"
            dpm sandbox &
            ok "Sandbox started without DAR — upload one manually"
        fi
    else
        warn "dpm (Daml Platform Manager) not found on PATH"
        echo "  Install it from: https://docs.daml.com/getting-started/installation.html"
        echo "  Or skip --sandbox and connect to an existing participant node"
    fi
fi

# --- Done ---
echo ""
ok "CantonTrace development environment is ready"

if [ "$START_ALL" != true ]; then
    echo ""
    info "Infrastructure is running. To start application services:"
    echo ""
    echo "  # Option 1: Docker Compose (hot-reload)"
    echo "  docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d"
    echo ""
    echo "  # Option 2: Run services locally"
    echo "  cd frontend && npm install && npm run dev"
    echo "  cd api-gateway && npm install && npm run dev"
    echo "  cd engine-service && sbt run"
fi
