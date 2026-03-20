/**
 * Reassignment Tracker Routes
 *
 * GET /api/v1/reassignments — Stream reassignment events, pair by reassignment_id
 *
 * Reassignments move contracts between synchronizers.
 * Each reassignment produces an UnassignedEvent (source) and AssignedEvent (target).
 * They are paired by the shared reassignment_id.
 */

import type { FastifyInstance } from 'fastify';
import { requireCantonContext } from '../middleware/canton-context.js';
import type {
  Reassignment,
  LedgerUpdate,
  ApiResponse,
} from '../types.js';

export function registerReassignmentRoutes(app: FastifyInstance): void {
  /**
   * GET /api/v1/reassignments
   *
   * List reassignment events, paired by reassignment_id.
   *
   * Query params:
   *   parties   — Comma-separated party filter
   *   offset    — Start offset
   *   limit     — Max number of reassignments (default 50)
   *   contractId — Filter by contract ID
   */
  app.get<{
    Querystring: {
      parties?: string;
      offset?: string;
      limit?: string;
      contractId?: string;
    };
  }>('/api/v1/reassignments', {
    schema: {
      description: 'List cross-domain reassignment events paired by reassignment_id',
      tags: ['Reassignment Tracker'],
      querystring: {
        type: 'object',
        properties: {
          parties: { type: 'string', description: 'Comma-separated party filter' },
          offset: { type: 'string', description: 'Start offset' },
          limit: { type: 'string', description: 'Max reassignments (default 50)' },
          contractId: { type: 'string', description: 'Filter by contract ID' },
        },
      },
    },
  }, async (request, reply) => {
    const { client, bootstrapInfo } = requireCantonContext(request);
    const { parties, offset, limit: limitStr, contractId } = request.query;

    const partyList = parties
      ? parties.split(',').map((p) => p.trim()).filter(Boolean)
      : getPartiesFromRights(bootstrapInfo.userRights, bootstrapInfo.knownParties);

    if (partyList.length === 0) {
      return reply.code(400).send({
        code: 'MISSING_PARTIES',
        message: 'At least one party is required.',
      });
    }

    const maxReassignments = Math.min(parseInt(limitStr ?? '50', 10) || 50, 500);
    const startOffset = offset ?? '';

    // Collect reassignment events from the update stream
    const reassignmentMap = new Map<string, Partial<Reassignment>>();

    return new Promise<void>((resolve) => {
      const collected: Reassignment[] = [];

      const { cancel } = client.updateService.getUpdates(
        startOffset,
        partyList,
        'ACS_DELTA',
        bootstrapInfo.currentOffset,
        undefined,
        (update: LedgerUpdate) => {
          if (update.updateType !== 'reassignment') return;

          for (const event of update.events) {
            if (event.eventType === 'unassigned') {
              const existing = reassignmentMap.get(event.reassignmentId) ?? {};
              existing.reassignmentId = event.reassignmentId;
              existing.contractId = event.contractId;
              if (event.templateId) existing.templateId = event.templateId;
              existing.sourceSynchronizer = event.source;
              existing.status = existing.assignedAt ? 'assigned' : 'unassigned';
              existing.unassignedAt = update.recordTime;

              if (contractId && event.contractId !== contractId) {
                reassignmentMap.delete(event.reassignmentId);
                return;
              }

              reassignmentMap.set(event.reassignmentId, existing);
            }

            if (event.eventType === 'assigned') {
              const existing = reassignmentMap.get(event.reassignmentId) ?? {};
              existing.reassignmentId = event.reassignmentId;
              existing.contractId = event.contractId;
              if (event.templateId) existing.templateId = event.templateId;
              existing.sourceSynchronizer = event.source;
              existing.targetSynchronizer = event.target;
              existing.status = 'assigned';
              existing.assignedAt = update.recordTime;

              if (contractId && event.contractId !== contractId) {
                reassignmentMap.delete(event.reassignmentId);
                return;
              }

              reassignmentMap.set(event.reassignmentId, existing);
            }
          }

          if (reassignmentMap.size >= maxReassignments) {
            cancel();
          }
        },
        () => {
          finalize();
        },
        () => {
          finalize();
        },
      );

      function finalize(): void {
        for (const partial of reassignmentMap.values()) {
          const reassignment: Reassignment = {
            reassignmentId: partial.reassignmentId ?? '',
            contractId: partial.contractId ?? '',
            templateId: partial.templateId ?? { packageName: '', moduleName: '', entityName: '' },
            sourceSynchronizer: partial.sourceSynchronizer ?? '',
            targetSynchronizer: partial.targetSynchronizer ?? '',
            status: partial.status ?? 'unassigned',
            unassignedAt: partial.unassignedAt,
            assignedAt: partial.assignedAt,
            latencyMs: computeLatency(partial.unassignedAt, partial.assignedAt),
          };
          collected.push(reassignment);
        }

        // Determine in-flight reassignments (unassigned but not yet assigned)
        for (const r of collected) {
          if (r.unassignedAt && !r.assignedAt) {
            r.status = 'in_flight';
          }
        }

        // Sort by unassigned time
        collected.sort((a, b) => (a.unassignedAt ?? '').localeCompare(b.unassignedAt ?? ''));

        const response: ApiResponse<Reassignment[]> = {
          data: collected,
          meta: {
            totalCount: collected.length,
            timestamp: new Date().toISOString(),
          },
        };

        reply.send(response);
        resolve();
      }

      // Safety timeout
      setTimeout(() => {
        cancel();
        finalize();
      }, 15000);
    });
  });
}

function computeLatency(
  unassignedAt: string | undefined,
  assignedAt: string | undefined,
): number | undefined {
  if (!unassignedAt || !assignedAt) return undefined;
  const start = new Date(unassignedAt).getTime();
  const end = new Date(assignedAt).getTime();
  if (isNaN(start) || isNaN(end)) return undefined;
  return Math.max(0, end - start);
}

function getPartiesFromRights(
  rights: Array<{ type: string; party?: string }>,
  knownParties?: string[],
): string[] {
  const parties = new Set<string>();
  for (const right of rights) {
    if ('party' in right && right.party) {
      parties.add(right.party);
    }
  }
  // Fall back to knownParties in sandbox mode (where userRights may be empty)
  if (parties.size === 0 && knownParties?.length) {
    return knownParties;
  }
  return Array.from(parties);
}
