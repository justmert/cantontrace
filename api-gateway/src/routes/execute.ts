/**
 * Execute Routes
 *
 * POST /api/v1/execute — Submit commands to the ledger via CommandService
 *
 * Uses CommandService.SubmitAndWaitForTransaction which works in sandbox mode
 * without JWT auth (unlike InteractiveSubmissionService which requires JWT claims).
 */

import type { FastifyInstance } from 'fastify';
import { requireCantonContext } from '../middleware/canton-context.js';
import type {
  ExecuteRequest,
  ExecuteResult,
  ApiResponse,
} from '../types.js';
import crypto from 'crypto';

export function registerExecuteRoutes(app: FastifyInstance): void {
  app.post<{
    Body: ExecuteRequest;
  }>('/api/v1/execute', {
    schema: {
      description: 'Execute a Daml command on the ledger via CommandService',
      tags: ['Transaction Executor'],
      body: {
        type: 'object',
        required: ['commands', 'actAs'],
        properties: {
          commands: {
            type: 'array',
            items: {
              type: 'object',
              required: ['templateId', 'arguments'],
              properties: {
                templateId: {
                  type: 'object',
                  properties: {
                    packageName: { type: 'string' },
                    moduleName: { type: 'string' },
                    entityName: { type: 'string' },
                  },
                },
                choice: { type: 'string' },
                contractId: { type: 'string' },
                arguments: { type: 'object' },
              },
            },
          },
          actAs: { type: 'array', items: { type: 'string' } },
          readAs: { type: 'array', items: { type: 'string' } },
          synchronizerId: { type: 'string' },
          disclosedContracts: { type: 'array' },
        },
      },
    },
  }, async (request, reply) => {
    const { client, bootstrapInfo } = requireCantonContext(request);
    const body = request.body;

    const commandId = `exec-${crypto.randomUUID()}`;
    const userId = 'cantontrace-executor';

    // Ensure the user exists with required rights
    await client.userManagementService.ensureUserWithRights(
      userId,
      body.actAs,
      body.readAs ?? [],
    );

    // Resolve packageName -> packageId
    const resolvedCommands = body.commands.map((cmd) => {
      const pkg = bootstrapInfo.packages.find(
        (p) => p.packageName === cmd.templateId.packageName
      );
      return {
        ...cmd,
        templateId: {
          ...cmd.templateId,
          packageName: pkg?.packageId ?? cmd.templateId.packageName,
        },
      };
    });

    try {
      const result = await client.commandService.submitAndWait(
        resolvedCommands,
        body.actAs,
        body.readAs ?? [],
        userId,
        commandId,
        body.synchronizerId,
        body.disclosedContracts,
      );

      const response: ApiResponse<ExecuteResult> = {
        data: {
          success: true,
          committed: true,
          updateId: result.updateId,
          completionOffset: result.completionOffset,
          transactionTree: result.transactionTree,
          executedAt: new Date().toISOString(),
        },
        meta: {
          offset: result.completionOffset,
          timestamp: new Date().toISOString(),
        },
      };

      reply.send(response);
    } catch (err) {
      const { CantonError } = await import('../canton/errors.js');
      if (err instanceof CantonError) {
        const response: ApiResponse<ExecuteResult> = {
          data: {
            success: false,
            committed: true,
            updateId: '',
            completionOffset: '',
            error: err.commandError,
            executedAt: new Date().toISOString(),
          },
          meta: {
            timestamp: new Date().toISOString(),
          },
        };
        reply.send(response);
      } else {
        throw err;
      }
    }
  });
}
