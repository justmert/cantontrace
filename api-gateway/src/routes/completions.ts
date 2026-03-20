/**
 * Completions Routes
 *
 * GET /api/v1/completions              — Query completions with filters
 * GET /api/v1/completions/:commandId   — Specific command outcome
 */

import type { FastifyInstance } from 'fastify';
import { requireCantonContext } from '../middleware/canton-context.js';
import type { CommandCompletion, ApiResponse } from '../types.js';

export function registerCompletionRoutes(app: FastifyInstance): void {
  /**
   * GET /api/v1/completions
   *
   * Query command completions with optional filters.
   */
  app.get<{
    Querystring: {
      applicationId?: string;
      parties?: string;
      offset?: string;
      commandId?: string;
      status?: string;
      category?: string;
      dateFrom?: string;
      dateTo?: string;
      pageSize?: string;
      pageToken?: string;
    };
  }>('/api/v1/completions', {
    schema: {
      description: 'Query command completions',
      tags: ['Error Debugger'],
      querystring: {
        type: 'object',
        properties: {
          applicationId: { type: 'string', description: 'Application ID filter' },
          parties: { type: 'string', description: 'Comma-separated party filter' },
          offset: { type: 'string', description: 'Start offset (exclusive)' },
          commandId: { type: 'string', description: 'Filter by specific command ID' },
          status: { type: 'string', description: 'Filter by status: succeeded or failed' },
          category: { type: 'string', description: 'Filter by error category' },
          dateFrom: { type: 'string', description: 'Filter completions from this datetime (ISO 8601)' },
          dateTo: { type: 'string', description: 'Filter completions up to this datetime (ISO 8601)' },
          pageSize: { type: 'string', description: 'Maximum number of results to return' },
          pageToken: { type: 'string', description: 'Pagination token' },
        },
      },
    },
  }, async (request, reply) => {
    const { client, bootstrapInfo } = requireCantonContext(request);
    const {
      applicationId = 'cantontrace',
      parties,
      offset,
      commandId,
      status,
      category,
      dateFrom,
      dateTo,
      pageSize,
    } = request.query;

    let partyList = parties
      ? parties.split(',').map((p) => p.trim()).filter(Boolean)
      : getPartiesFromRights(bootstrapInfo.userRights);

    // Fall back to knownParties in sandbox mode (where userRights is empty)
    if (partyList.length === 0 && bootstrapInfo.knownParties?.length > 0) {
      partyList = bootstrapInfo.knownParties;
    }

    if (partyList.length === 0) {
      return reply.code(400).send({
        code: 'MISSING_PARTIES',
        message: 'At least one party is required.',
      });
    }

    let completions = await client.commandCompletionService.getCompletions(
      applicationId,
      partyList,
      offset ?? bootstrapInfo.currentOffset,
      undefined,
      commandId,
    );

    // Apply server-side filters
    if (status) {
      completions = completions.filter((c) => c.status === status);
    }

    if (category) {
      completions = completions.filter((c) => c.error?.categoryId === category);
    }

    if (dateFrom) {
      const from = new Date(dateFrom).getTime();
      if (!isNaN(from)) {
        completions = completions.filter((c) => new Date(c.recordTime).getTime() >= from);
      }
    }

    if (dateTo) {
      const to = new Date(dateTo).getTime();
      if (!isNaN(to)) {
        completions = completions.filter((c) => new Date(c.recordTime).getTime() <= to);
      }
    }

    const limit = pageSize ? Math.min(parseInt(pageSize, 10) || 50, 500) : 500;
    completions = completions.slice(0, limit);

    const response: ApiResponse<CommandCompletion[]> = {
      data: completions,
      meta: {
        totalCount: completions.length,
        timestamp: new Date().toISOString(),
      },
    };

    return reply.send(response);
  });

  /**
   * GET /api/v1/completions/:commandId
   *
   * Get the outcome of a specific command.
   */
  app.get<{
    Params: { commandId: string };
    Querystring: {
      applicationId?: string;
      parties?: string;
    };
  }>('/api/v1/completions/:commandId', {
    schema: {
      description: 'Get outcome of a specific command',
      tags: ['Error Debugger'],
      params: {
        type: 'object',
        required: ['commandId'],
        properties: {
          commandId: { type: 'string' },
        },
      },
      querystring: {
        type: 'object',
        properties: {
          applicationId: { type: 'string' },
          parties: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const { client, bootstrapInfo } = requireCantonContext(request);
    const { commandId } = request.params;
    const {
      applicationId = 'cantontrace',
      parties,
    } = request.query;

    let partyList = parties
      ? parties.split(',').map((p) => p.trim()).filter(Boolean)
      : getPartiesFromRights(bootstrapInfo.userRights);

    // Fall back to knownParties in sandbox mode
    if (partyList.length === 0 && bootstrapInfo.knownParties?.length > 0) {
      partyList = bootstrapInfo.knownParties;
    }

    if (partyList.length === 0) {
      return reply.code(400).send({
        code: 'MISSING_PARTIES',
        message: 'At least one party is required.',
      });
    }

    const completions = await client.commandCompletionService.getCompletions(
      applicationId,
      partyList,
      undefined,
      undefined,
      commandId,
    );

    const completion = completions.find((c) => c.commandId === commandId);

    if (!completion) {
      return reply.code(404).send({
        code: 'COMPLETION_NOT_FOUND',
        message: `No completion found for command_id '${commandId}'.`,
      });
    }

    const response: ApiResponse<CommandCompletion> = {
      data: completion,
      meta: {
        timestamp: new Date().toISOString(),
      },
    };

    return reply.send(response);
  });
}

function getPartiesFromRights(rights: Array<{ type: string; party?: string }>): string[] {
  const parties = new Set<string>();
  for (const right of rights) {
    if ('party' in right && right.party) {
      parties.add(right.party);
    }
  }
  return Array.from(parties);
}
