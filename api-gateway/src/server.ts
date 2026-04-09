/**
 * CantonTrace API Gateway — Server Entry Point
 *
 * Fastify server with:
 * - CORS support
 * - WebSocket support for event streaming
 * - OpenAPI/Swagger documentation
 * - Rate limiting
 * - JWT authentication
 * - Canton gRPC client context
 * - Redis caching
 * - PostgreSQL error knowledge base
 *
 * Starts on port 3001 (configurable via PORT env var).
 */

import Fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import websocket from '@fastify/websocket';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import rateLimit from '@fastify/rate-limit';
import { Pool } from 'pg';

// Middleware
import { registerAuthMiddleware, type AuthConfig } from './middleware/auth.js';
import { registerErrorHandler } from './middleware/error-handler.js';
import { registerSessionIdHook, registerCantonContext, disconnectAllSessions } from './middleware/canton-context.js';

// Services
import { CacheService } from './services/cache.js';

// Routes
import { registerConnectionRoutes } from './routes/connection.js';
import { registerACSRoutes } from './routes/acs.js';
import { registerContractRoutes } from './routes/contracts.js';
import { registerPackageRoutes } from './routes/packages.js';
import { registerTransactionRoutes } from './routes/transactions.js';
import { registerEventRoutes } from './routes/events.js';
import { registerCompletionRoutes } from './routes/completions.js';
import { registerErrorRoutes } from './routes/errors.js';
import { registerSimulateRoutes } from './routes/simulate.js';
import { registerTraceRoutes } from './routes/trace.js';
import { registerWorkflowRoutes } from './routes/workflows.js';
import { registerPrivacyRoutes } from './routes/privacy.js';
import { registerSandboxRoutes } from './routes/sandboxes.js';
import { registerReassignmentRoutes } from './routes/reassignments.js';
import { registerCIRoutes } from './routes/ci.js';
import { registerExecuteRoutes } from './routes/execute.js';
import { registerAuthRoutes } from './routes/auth.js';
import { restoreSandboxes, registerDemoSandbox } from './services/sandbox-manager.js';

// ============================================================
// Configuration
// ============================================================

const PORT = parseInt(process.env.PORT ?? '3001', 10);
const HOST = process.env.HOST ?? '0.0.0.0';
const LOG_LEVEL = process.env.LOG_LEVEL ?? 'info';
const REDIS_URL = process.env.REDIS_URL;
const DATABASE_URL = process.env.DATABASE_URL;
const JWKS_URL = process.env.JWKS_URL ?? null;
const JWT_AUDIENCE = process.env.JWT_AUDIENCE;
const JWT_ISSUER = process.env.JWT_ISSUER;
const CORS_ORIGIN = process.env.CORS_ORIGIN ?? 'http://localhost:3000,http://localhost:5174';
const SESSION_SECRET = process.env.SESSION_SECRET ?? 'cantontrace-dev-secret-change-in-production';

// ============================================================
// Server Initialization
// ============================================================

async function buildServer() {
  const app = Fastify({
    logger: {
      level: LOG_LEVEL,
      transport: process.env.NODE_ENV !== 'production'
        ? { target: 'pino-pretty', options: { colorize: true } }
        : undefined,
    },
    maxParamLength: 500,
    bodyLimit: 50 * 1024 * 1024, // 50MB for DAR uploads
  });

  // ============================================================
  // Plugin Registration
  // ============================================================

  // CORS
  await app.register(cors, {
    origin: CORS_ORIGIN.split(',').map((o) => o.trim()),
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    credentials: true,
  });

  // Cookie support (for session management)
  await app.register(cookie, {
    secret: SESSION_SECRET,
  });

  // WebSocket support
  await app.register(websocket, {
    options: {
      maxPayload: 1024 * 1024, // 1MB per message
    },
  });

  // Rate limiting
  await app.register(rateLimit, {
    max: 200,
    timeWindow: '1 minute',
    allowList: ['127.0.0.1', '::1'],
  });

  // Swagger / OpenAPI documentation
  await app.register(swagger, {
    openapi: {
      info: {
        title: 'CantonTrace API Gateway',
        description:
          'REST + WebSocket API for the Canton Network Debugging Platform. ' +
          'Bridges Canton Ledger API v2 (gRPC) to HTTP/WS for the web frontend.',
        version: '1.0.0',
      },
      servers: [
        { url: `http://localhost:${PORT}`, description: 'Local development' },
      ],
      tags: [
        { name: 'Connection', description: 'Canton participant connection management' },
        { name: 'ACS Inspector', description: 'Active Contract Set queries with time-travel' },
        { name: 'Contract Lifecycle', description: 'Contract creation, exercises, and archival' },
        { name: 'Template Explorer', description: 'Package and template metadata' },
        { name: 'Transaction Explorer', description: 'Transaction tree visualization and state diff' },
        { name: 'Event Stream Monitor', description: 'Real-time WebSocket event streaming' },
        { name: 'Error Debugger', description: 'Error knowledge base and command completions' },
        { name: 'Transaction Simulator', description: 'Preflight command simulation (online/offline)' },
        { name: 'Execution Trace', description: 'Step-by-step Daml execution tracing' },
        { name: 'Workflow Debugger', description: 'Cross-transaction workflow reconstruction' },
        { name: 'Privacy Visualizer', description: 'Per-party visibility analysis' },
        { name: 'Sandbox Manager', description: 'Canton sandbox provisioning and management' },
        { name: 'Reassignment Tracker', description: 'Cross-domain contract reassignment tracking' },
        { name: 'CI/CD Integration', description: 'Automated testing pipelines' },
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
            description: 'JWT token from the participant\'s IAM. Not required for sandbox mode.',
          },
        },
      },
    },
  });

  await app.register(swaggerUi, {
    routePrefix: '/documentation',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: true,
    },
  });

  // ============================================================
  // Services Initialization
  // ============================================================

  // Redis cache
  const cache = new CacheService(REDIS_URL);
  if (REDIS_URL) {
    await cache.connect();
    app.log.info('Redis cache connected');
  } else {
    app.log.warn('REDIS_URL not set — caching disabled');
  }

  // PostgreSQL connection pool (for error knowledge base)
  let pgPool: Pool | null = null;
  if (DATABASE_URL) {
    pgPool = new Pool({
      connectionString: DATABASE_URL,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });

    try {
      const pgClient = await pgPool.connect();
      pgClient.release();
      app.log.info('PostgreSQL connected (error knowledge base)');
    } catch (err) {
      app.log.warn({ err }, 'PostgreSQL connection failed — error knowledge base unavailable');
      pgPool = null;
    }
  } else {
    app.log.warn('DATABASE_URL not set — error knowledge base unavailable');
  }

  // ============================================================
  // Middleware Registration
  // ============================================================

  // Global error handler
  registerErrorHandler(app);

  // Session ID resolution (must run before auth and canton-context)
  registerSessionIdHook(app);

  // JWT + platform authentication
  const authConfig: AuthConfig = {
    jwksUrl: JWKS_URL,
    audience: JWT_AUDIENCE,
    issuer: JWT_ISSUER,
    refreshThresholdSeconds: 120,
  };
  registerAuthMiddleware(app, authConfig);

  // Canton client context
  registerCantonContext(app, cache);

  // ============================================================
  // Route Registration
  // ============================================================

  registerAuthRoutes(app);
  registerConnectionRoutes(app, cache);
  registerACSRoutes(app, cache);
  registerContractRoutes(app);
  registerPackageRoutes(app, cache);
  registerTransactionRoutes(app);
  registerEventRoutes(app, cache);
  registerCompletionRoutes(app);
  registerErrorRoutes(app, pgPool);
  registerSimulateRoutes(app, cache);
  registerTraceRoutes(app, cache);
  registerWorkflowRoutes(app);
  registerPrivacyRoutes(app);
  registerSandboxRoutes(app);
  registerReassignmentRoutes(app);
  registerCIRoutes(app);
  registerExecuteRoutes(app);

  // ============================================================
  // Graceful Shutdown
  // ============================================================

  const shutdown = async (signal: string) => {
    app.log.info(`Received ${signal}. Starting graceful shutdown...`);

    // Close Fastify server (stops accepting new connections)
    await app.close();

    // Disconnect all Canton sessions and stop cleanup timer
    disconnectAllSessions();

    // Disconnect services
    await cache.disconnect();
    if (pgPool) {
      await pgPool.end();
    }

    app.log.info('Graceful shutdown complete');
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  return app;
}

// ============================================================
// Start Server
// ============================================================

async function main() {
  try {
    const app = await buildServer();

    // Register Demo sandbox if CANTON_SANDBOX_ENDPOINT is set (Docker mode)
    await registerDemoSandbox();

    // Restore user-created sandboxes from disk
    await restoreSandboxes();

    await app.listen({ port: PORT, host: HOST });
    app.log.info(`CantonTrace API Gateway running on http://${HOST}:${PORT}`);
    app.log.info(`Swagger documentation at http://${HOST}:${PORT}/documentation`);
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

main();

export { buildServer };
