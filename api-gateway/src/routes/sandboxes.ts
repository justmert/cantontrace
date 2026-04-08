/**
 * Sandbox Management Routes
 *
 * POST   /api/v1/sandboxes                — Provision sandbox
 * GET    /api/v1/sandboxes                — List sandboxes
 * DELETE /api/v1/sandboxes/:id            — Tear down sandbox
 * POST   /api/v1/sandboxes/:id/reset      — Reset sandbox (stop, clear, restart)
 * POST   /api/v1/sandboxes/:id/dars       — Upload DAR, trigger source extraction
 * POST   /api/v1/sandboxes/:id/parties    — Allocate party
 */

import type { FastifyInstance } from 'fastify';
import {
  createSandbox,
  listSandboxes,
  getSandbox,
  deleteSandbox,
  resetSandbox,
  uploadDar,
  allocatePartyOnSandbox,
} from '../services/sandbox-manager.js';
import type { SandboxCreateRequest, ApiResponse, Sandbox } from '../types.js';

export function registerSandboxRoutes(app: FastifyInstance): void {
  /**
   * POST /api/v1/sandboxes
   *
   * Provision a new Canton Sandbox instance.
   */
  app.post<{
    Body: SandboxCreateRequest;
  }>('/api/v1/sandboxes', {
    schema: {
      description: 'Provision a new Canton Sandbox instance',
      tags: ['Sandbox Manager'],
      body: {
        type: 'object',
        properties: {
          darFile: { type: 'string', description: 'Base64-encoded DAR file' },
          parties: { type: 'array', items: { type: 'string' } },
          enableProfiling: { type: 'boolean' },
        },
      },
    },
  }, async (request, reply) => {
    try {
      const sandbox = await createSandbox(request.body);

      const response: ApiResponse<Sandbox> = {
        data: sandbox,
        meta: {
          timestamp: new Date().toISOString(),
        },
      };

      return reply.code(201).send(response);
    } catch (err) {
      const statusCode = (err as { statusCode?: number }).statusCode ?? 500;
      const message = err instanceof Error ? err.message : 'Failed to create sandbox';
      request.log.error({ err }, 'Sandbox creation failed');
      return reply.code(statusCode).send({
        code: 'SANDBOX_CREATE_FAILED',
        message,
      });
    }
  });

  /**
   * GET /api/v1/sandboxes
   *
   * List all managed sandbox instances.
   */
  app.get('/api/v1/sandboxes', {
    schema: {
      description: 'List all managed sandboxes',
      tags: ['Sandbox Manager'],
    },
  }, async (_request, reply) => {
    const sandboxes = listSandboxes();

    const response: ApiResponse<Sandbox[]> = {
      data: sandboxes,
      meta: {
        totalCount: sandboxes.length,
        timestamp: new Date().toISOString(),
      },
    };

    return reply.send(response);
  });

  /**
   * GET /api/v1/sandboxes/:id
   *
   * Get details of a specific sandbox.
   */
  app.get<{
    Params: { id: string };
  }>('/api/v1/sandboxes/:id', {
    schema: {
      description: 'Get sandbox details',
      tags: ['Sandbox Manager'],
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const sandbox = getSandbox(request.params.id);

    if (!sandbox) {
      return reply.code(404).send({
        code: 'SANDBOX_NOT_FOUND',
        message: `Sandbox '${request.params.id}' not found.`,
      });
    }

    return reply.send({
      data: sandbox,
      meta: { timestamp: new Date().toISOString() },
    });
  });

  /**
   * DELETE /api/v1/sandboxes/:id
   *
   * Tear down a sandbox and clean up resources.
   */
  app.delete<{
    Params: { id: string };
  }>('/api/v1/sandboxes/:id', {
    schema: {
      description: 'Tear down a sandbox instance',
      tags: ['Sandbox Manager'],
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const { id } = request.params;

    try {
      await deleteSandbox(id);
    } catch (err) {
      const statusCode = (err as { statusCode?: number }).statusCode ?? 500;
      const message = err instanceof Error ? err.message : 'Failed to delete sandbox';
      request.log.error({ err, sandboxId: id }, 'Sandbox deletion failed');
      return reply.code(statusCode).send({
        code: 'SANDBOX_DELETE_FAILED',
        message,
      });
    }

    return reply.send({
      data: { deleted: true, sandboxId: id },
      meta: { timestamp: new Date().toISOString() },
    });
  });

  /**
   * POST /api/v1/sandboxes/:id/reset
   *
   * Reset a sandbox: stop the process, clear state, restart with same config.
   */
  app.post<{
    Params: { id: string };
  }>('/api/v1/sandboxes/:id/reset', {
    schema: {
      description: 'Reset a sandbox (stop, clear state, restart with same config)',
      tags: ['Sandbox Manager'],
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const { id } = request.params;

    try {
      const sandbox = await resetSandbox(id);

      const response: ApiResponse<Sandbox> = {
        data: sandbox,
        meta: {
          timestamp: new Date().toISOString(),
        },
      };

      return reply.send(response);
    } catch (err) {
      const statusCode = (err as { statusCode?: number }).statusCode ?? 500;
      const message = err instanceof Error ? err.message : 'Failed to reset sandbox';
      request.log.error({ err, sandboxId: id }, 'Sandbox reset failed');
      return reply.code(statusCode).send({
        code: 'SANDBOX_RESET_FAILED',
        message,
      });
    }
  });

  /**
   * POST /api/v1/sandboxes/:id/dars
   *
   * Upload a DAR file to a running sandbox.
   * Triggers source extraction from the DAR archive.
   */
  app.post<{
    Params: { id: string };
    Body: { darFile: string };
  }>('/api/v1/sandboxes/:id/dars', {
    schema: {
      description: 'Upload DAR to sandbox and extract source code',
      tags: ['Sandbox Manager'],
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string' },
        },
      },
      body: {
        type: 'object',
        required: ['darFile'],
        properties: {
          darFile: { type: 'string', description: 'Base64-encoded DAR file' },
        },
      },
    },
  }, async (request, reply) => {
    const { id } = request.params;
    const { darFile } = request.body;

    try {
      await uploadDar(id, darFile);
    } catch (err) {
      const statusCode = (err as { statusCode?: number }).statusCode ?? 500;
      const message = err instanceof Error ? err.message : 'Failed to upload DAR';
      request.log.error({ err, sandboxId: id }, 'DAR upload failed');
      return reply.code(statusCode).send({
        code: 'DAR_UPLOAD_FAILED',
        message,
      });
    }

    // Attempt source extraction from the DAR
    let sourceFiles: Record<string, string> = {};
    try {
      const { extractSourceFromDAR } = await import('../services/package-parser.js');
      const darBytes = Buffer.from(darFile, 'base64');
      sourceFiles = extractSourceFromDAR(new Uint8Array(darBytes));
    } catch {
      // Source extraction is best-effort
    }

    return reply.send({
      data: {
        sandboxId: id,
        uploaded: true,
        sourceFilesExtracted: Object.keys(sourceFiles).length,
        sourceFiles: Object.keys(sourceFiles),
      },
      meta: { timestamp: new Date().toISOString() },
    });
  });

  /**
   * POST /api/v1/sandboxes/:id/parties
   *
   * Allocate a party on a running sandbox.
   */
  app.post<{
    Params: { id: string };
    Body: { partyHint?: string; displayName?: string };
  }>('/api/v1/sandboxes/:id/parties', {
    schema: {
      description: 'Allocate a party on a sandbox',
      tags: ['Sandbox Manager'],
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string' },
        },
      },
      body: {
        type: 'object',
        properties: {
          partyHint: { type: 'string' },
          displayName: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const { id } = request.params;
    const { partyHint, displayName } = request.body;

    try {
      const party = await allocatePartyOnSandbox(id, partyHint, displayName);

      return reply.send({
        data: { sandboxId: id, party },
        meta: { timestamp: new Date().toISOString() },
      });
    } catch (err) {
      const statusCode = (err as { statusCode?: number }).statusCode ?? 500;
      const message = err instanceof Error ? err.message : 'Failed to allocate party';
      request.log.error({ err, sandboxId: id }, 'Party allocation failed');
      return reply.code(statusCode).send({
        code: 'PARTY_ALLOCATE_FAILED',
        message,
      });
    }
  });
}
