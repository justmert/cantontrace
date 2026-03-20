# CantonTrace

Web-based debugging platform for Canton Network / Daml smart contracts.

CantonTrace provides Canton developers with source-level execution tracing, preflight transaction simulation, visual transaction debugging, contract state inspection, and workflow analysis -- capabilities that do not exist in the Canton ecosystem today.

## Architecture

```
Browser (React + Vite)
    |
    v
+--------------------------------------------------+
| nginx (port 80)                                  |
|   /        -> static SPA assets                  |
|   /api/*   -> proxy to api-gateway               |
+--------+-----------------------------------------+
         |
         v
+--------------------------------------------------+
| api-gateway (Node.js + Fastify, port 3001)       |
|   REST API, WebSocket, gRPC-to-REST bridge       |
+--------+------------+---------------------------+
         |            |
         v            v
+----------------+  +-----------------------------+
| PostgreSQL 16  |  | Redis 7                     |
| (port 5432)    |  | (port 6379)                 |
| Platform state |  | ACS cache, sessions,        |
+----------------+  | package metadata            |
                    +-----------------------------+
         |
         v
+--------------------------------------------------+
| engine-service (Scala/JVM, port 3002)            |
|   Forked daml-lf-engine with instrumented        |
|   Speedy machine for source-level tracing        |
+--------------------------------------------------+
         |
         v (gRPC / Ledger API v2)
+--------------------------------------------------+
| Canton Participant Node (or hosted sandbox)       |
|   UpdateService, StateService,                   |
|   InteractiveSubmissionService,                  |
|   EventQueryService, PackageService, ...         |
+--------------------------------------------------+
```

## Prerequisites

- **Node.js** 20+ (frontend and api-gateway)
- **JDK** 17+ (engine-service / Daml SDK)
- **sbt** 1.9+ (engine-service build)
- **Docker** and **Docker Compose** v2
- **dpm** (Daml Platform Manager) -- optional, for Canton sandbox provisioning

## Quick Start

```bash
# Clone and configure
git clone <repo-url> cantontrace
cd cantontrace
cp .env.example .env

# Start all services in production mode
docker compose up -d

# Or start with development hot-reload
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d
```

The initialization script automates environment setup:

```bash
# Start infrastructure (postgres + redis) and run migrations
./docker/scripts/init-dev.sh

# Start everything including a Canton sandbox
./docker/scripts/init-dev.sh --all --sandbox

# Reset volumes and start fresh
./docker/scripts/init-dev.sh --reset --all
```

Once running:

| Service         | URL                          |
|-----------------|------------------------------|
| Frontend        | http://localhost:5173 (dev) / http://localhost (prod) |
| API Gateway     | http://localhost:3001        |
| Swagger UI      | http://localhost:3001/api/docs |
| Engine Service  | http://localhost:3002        |
| PostgreSQL      | localhost:5432               |
| Redis           | localhost:6379               |

## Development Setup

### Frontend

```bash
cd frontend
npm install
npm run dev
# Runs on http://localhost:5173 with hot-reload
```

### API Gateway

```bash
cd api-gateway
npm install
npm run dev
# Runs on http://localhost:3001 with tsx watch
```

### Engine Service

```bash
cd engine-service
sbt run
# Runs on http://localhost:3002
# Requires JDK 17+ and access to Daml Maven repository
```

### Database

PostgreSQL runs via Docker. Migrations are in `database/migrations/` and are applied automatically by `init-dev.sh` or manually:

```bash
docker compose exec postgres psql -U cantontrace -d cantontrace < database/migrations/001_initial_schema.sql
```

## Features

CantonTrace provides 14 integrated debugging and inspection tools:

### Core Features

1. **Daml Execution Trace (Source-Level Debugger)** -- Step through Daml contract execution with source-level visibility into the Speedy machine. See variable bindings, contract fetches, and authorization checks at each step.

2. **Transaction Simulator (Preflight)** -- Dry-run transactions before submission using `InteractiveSubmissionService.PrepareTransaction`. Preview state changes, authorization requirements, and potential failures.

3. **Error Debugger (with Contention Visualization)** -- Diagnose Canton errors using an 11-category error taxonomy with full gRPC status code mapping. Visualize resource contention patterns across contracts and parties.

4. **Transaction Explorer (with State Diff)** -- Inspect completed transactions with a tree view of all events (creates, exercises, archives). See before/after state diffs for each affected contract.

5. **Contract Lifecycle Tracker** -- Follow a single contract from creation through exercises to archival. View the full chain of events via `EventQueryService`.

6. **Workflow Debugger (Cross-Transaction Trace)** -- Trace multi-step workflows that span multiple transactions. Visualize the causal chain from proposal through acceptance to settlement.

7. **ACS Inspector (with Time Travel)** -- Browse the Active Contract Set at any historical offset. Compare ACS snapshots across time to understand how state evolved.

8. **Template Explorer (with Source Code)** -- Browse all Daml templates, their choices, key definitions, and signatories. View original Daml source extracted from uploaded DARs alongside parsed DALF metadata.

9. **Event Stream Monitor** -- Real-time streaming view of ledger events via `UpdateService.GetUpdates`. Filter by party, template, or event type with WebSocket push to the browser.

10. **Privacy Visualizer** -- Visualize which parties can see which parts of a transaction. Map out the privacy topology of multi-party workflows.

### Complementary Features

11. **Sandbox Manager** -- Provision and manage isolated Canton sandbox instances for testing. Upload DARs, allocate parties, and share sandbox access via tokens.

12. **Cross-Domain Reassignment Tracker** -- Track contract reassignments (transfers) across Canton synchronization domains. Visualize the lifecycle of contracts as they move between domains.

13. **Programmatic REST API** -- Full REST API with OpenAPI/Swagger documentation for all platform capabilities. Enables CI/CD integration and scripted debugging workflows.

14. **CI/CD Integration** -- Run automated test suites against Canton sandboxes. Collect transaction traces, assertion results, and error reports for integration into CI pipelines.

## Tech Stack

| Layer          | Technology                                         |
|----------------|----------------------------------------------------|
| Frontend       | React 18, TypeScript, Vite, shadcn/ui, TanStack Query/Router, Zustand, Monaco Editor, ReactFlow, Recharts |
| API Gateway    | Node.js 20, Fastify 5, TypeScript, gRPC client     |
| Engine Service | Scala 2.13, Akka HTTP, Daml LF Engine 2.9, JDK 17 |
| Database       | PostgreSQL 16                                       |
| Cache          | Redis 7                                             |
| Infrastructure | Docker, Docker Compose, nginx                       |

## Project Structure

```
cantontrace/
├── frontend/                   # React + Vite SPA
│   ├── src/
│   │   ├── components/         # shadcn/ui and shared components
│   │   ├── features/           # Feature-specific modules
│   │   ├── lib/                # Utilities, API clients
│   │   ├── hooks/              # Custom React hooks
│   │   └── stores/             # Zustand state stores
│   ├── public/                 # Static assets
│   ├── docker/                 # Frontend-specific Docker assets
│   │   └── nginx.conf          # Nginx config for production
│   ├── Dockerfile              # Multi-stage (dev / build / production)
│   └── package.json
├── api-gateway/                # REST API gateway (Node.js + Fastify)
│   ├── src/
│   │   └── server.ts           # Fastify server entry point
│   ├── Dockerfile              # Multi-stage (dev / build / production)
│   └── package.json
├── engine-service/             # Scala/JVM engine wrapper
│   ├── src/main/scala/         # Akka HTTP server + Daml LF engine
│   ├── project/                # sbt build configuration
│   ├── Dockerfile
│   └── build.sbt
├── database/
│   ├── migrations/             # Versioned SQL migrations
│   │   ├── 001_initial_schema.sql
│   │   ├── 002_error_knowledge_base.sql
│   │   └── 003_seed_error_categories.sql
│   └── docker-init.sql         # Combined init script for Docker
├── docker/
│   └── scripts/
│       ├── init-dev.sh         # Development environment bootstrap
│       └── wait-for-it.sh      # TCP dependency waiter
├── test-fixtures/
│   ├── test-daml/              # Test Daml project with sample templates
│   └── scripts/                # Sandbox setup and test data scripts
├── docker-compose.yml          # Production compose
├── docker-compose.dev.yml      # Development overrides (hot-reload)
├── shared-types.ts             # Shared TypeScript type definitions
├── .env.example                # Environment variable template
└── README.md
```

## Environment Variables

| Variable                      | Default                          | Description                              |
|-------------------------------|----------------------------------|------------------------------------------|
| `PORT`                        | `3001`                           | API gateway listen port                  |
| `NODE_ENV`                    | `development`                    | Node environment                         |
| `JWT_SECRET`                  | (required in production)         | Secret for signing session JWTs          |
| `DATABASE_URL`                | `postgresql://cantontrace:cantontrace@localhost:5432/cantontrace` | PostgreSQL connection string |
| `POSTGRES_USER`               | `cantontrace`                    | PostgreSQL user                          |
| `POSTGRES_PASSWORD`           | `cantontrace`                    | PostgreSQL password                      |
| `POSTGRES_DB`                 | `cantontrace`                    | PostgreSQL database name                 |
| `REDIS_URL`                   | `redis://localhost:6379`         | Redis connection string                  |
| `ENGINE_SERVICE_URL`          | `http://localhost:3002`          | Engine service endpoint                  |
| `CANTON_LEDGER_API_ENDPOINT`  | (empty)                          | Canton participant gRPC endpoint         |
| `CANTON_IAM_URL`              | (empty)                          | OAuth 2.0 token issuer for Canton auth   |
| `VITE_API_URL`                | `http://localhost:3001`          | API URL injected into frontend at build  |
| `LOG_LEVEL`                   | `info`                           | Logging verbosity (debug, info, warn, error) |

## Canton Sandbox Setup

For local development and testing, you can run a Canton sandbox:

### Using dpm (Daml Platform Manager)

```bash
# Install dpm if not already installed
# See: https://docs.daml.com/getting-started/installation.html

# Start a sandbox (no auth, local-only)
dpm sandbox

# Start with a pre-uploaded DAR
dpm sandbox --dar path/to/your-project.dar

# The sandbox exposes a Ledger API on localhost:6865 by default
```

### Using the CantonTrace Sandbox Manager

Once CantonTrace is running, use the Sandbox Manager feature in the web UI to:

1. Create a new sandbox instance
2. Upload your DAR files
3. Allocate test parties
4. Run Daml scripts to seed test data
5. Share sandbox access with teammates via token URLs

### Connecting to an Existing Participant Node

1. Set `CANTON_LEDGER_API_ENDPOINT` to your participant's gRPC endpoint
2. Set `CANTON_IAM_URL` to your organization's OAuth 2.0 issuer
3. Authenticate through the platform UI -- you will be redirected to your IAM provider
4. The platform uses short-lived JWTs for all Ledger API calls

## API Documentation

When the API gateway is running, interactive Swagger documentation is available at:

```
http://localhost:3001/api/docs
```

The REST API follows the pattern `/api/v1/<resource>` and provides programmatic access to all platform features. See the Swagger UI for complete endpoint documentation, request/response schemas, and authentication requirements.

## License

Apache 2.0
