# CantonTrace

Web-based debugging platform for Canton Network and Daml smart contracts.

Watch the demo: https://youtu.be/xjXGmoFw7xA

## Quick Start

```bash
docker compose up -d
```

Wait ~60 seconds. Open **http://localhost:5174**. Connect to the Demo Sandbox — it comes pre-loaded with parties, contracts, and transactions.

## What It Does

- **ACS Inspector** — Browse active contracts, filter by template/party, time-travel to any historical offset
- **Transaction Explorer** — Inspect transactions with tree view, state diff, and per-party privacy analysis
- **Event Stream** — Real-time WebSocket feed of ledger events with filtering
- **Template Explorer** — Browse deployed packages, view template fields, choices, and decompiled source
- **Debugger** — Build commands, simulate (dry-run), trace step-by-step through the Daml engine, or execute on the ledger
- **Sandbox Manager** — Create and manage local Canton sandbox instances

## Architecture

Three services:

- **Frontend** — React SPA (port 5174)
- **API Gateway** — Node.js/Fastify, bridges REST/WebSocket to Canton gRPC (port 3001)
- **Engine Service** — Scala/JVM, wraps the Daml-LF engine for execution tracing (port 3002)

Plus Canton Sandbox (port 10000), PostgreSQL, and Redis running in Docker.

## Connecting to Canton

**Demo Sandbox** — Click the plug icon → Sandbox tab → Demo Sandbox. Pre-loaded with 4 parties (Alice, Bob, Charlie, Bank), contracts across 7 templates, and transaction history.

**Your own participant** — Click the plug icon → Connect tab. Enter your gRPC endpoint (e.g. `localhost:6865`). For authenticated participants, provide the IAM URL.

## Development

```bash
# Frontend
cd frontend && npm install && npm run dev

# API Gateway
cd api-gateway && npm install && npm run dev

# Engine Service
cd engine-service && sbt run
```

Frontend dev server proxies `/api` to the API gateway automatically.

## Docker Services

| Service | Port | Description |
|---|---|---|
| Frontend | 5174 | React SPA via nginx |
| API Gateway | 3001 | REST + WebSocket API |
| Engine Service | internal | Daml-LF execution engine |
| Canton Sandbox | 10000 | Ledger API v2 (gRPC) |
| PostgreSQL | internal | Error knowledge base |
| Redis | internal | Cache |

## Environment Variables

Set in `.env.production` for deployment:

| Variable | Description |
|---|---|
| `GITHUB_CLIENT_ID` | GitHub OAuth app client ID (enables auth) |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth app secret |
| `SESSION_SECRET` | Cookie signing secret |
| `CANTON_SANDBOX_ENDPOINT` | Canton gRPC endpoint for Demo sandbox |
| `REDIS_URL` | Redis connection URL |
| `DATABASE_URL` | PostgreSQL connection URL |

Auth is disabled when `GITHUB_CLIENT_ID` is not set.

## Tech Stack

- React 18, TypeScript, Tailwind CSS v4, shadcn/ui, TanStack Router/Query, Zustand
- Node.js, Fastify 5, @grpc/grpc-js (server reflection, no .proto files)
- Scala 2.13, Daml-LF Engine 3.4.11, Akka HTTP
- Canton Open-Source 3.4.11
