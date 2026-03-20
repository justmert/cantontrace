/**
 * Event Stream Routes
 *
 * GET /api/v1/events/recent — REST endpoint for recent events (reverse chronological)
 * GET /api/v1/events/stream — WebSocket route for real-time event streaming
 *
 * Subscribes to UpdateService.GetUpdates via gRPC streaming.
 * Forwards decoded events to WebSocket clients.
 * Supports filter updates from clients.
 * Tracks last offset for reconnection.
 * Handles all 4 update types: transaction, reassignment, topology_transaction, offset_checkpoint.
 */

import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { WebSocket } from '@fastify/websocket';
import { requireCantonContext } from '../middleware/canton-context.js';
import { subscribeToEventStream } from '../services/event-stream.js';
import type { CacheService } from '../services/cache.js';
import type { EventStreamFilter } from '../types.js';
import crypto from 'crypto';

export function registerEventRoutes(app: FastifyInstance, cache: CacheService): void {
  /**
   * GET /api/v1/events/recent
   *
   * Fetch recent events using descending_order to avoid streaming from genesis.
   * Returns the most recent N events in reverse chronological order.
   *
   * Query params:
   *   limit   — Max events to return (default 50, max 100)
   *   parties — Comma-separated party IDs (optional, defaults to user's parties)
   */
  app.get<{
    Querystring: { limit?: string; parties?: string };
  }>('/api/v1/events/recent', {
    schema: {
      description: 'Fetch recent ledger events (reverse chronological)',
      tags: ['Event Stream Monitor'],
      querystring: {
        type: 'object',
        properties: {
          limit: { type: 'string', description: 'Max events to return (default 50, max 100)' },
          parties: { type: 'string', description: 'Comma-separated party IDs' },
        },
      },
    },
  }, async (request, reply) => {
    const ctx = requireCantonContext(request);
    const { client, bootstrapInfo } = ctx;

    const limit = Math.min(parseInt(request.query.limit ?? '50', 10) || 50, 100);
    let parties: string[];
    if (request.query.parties) {
      parties = request.query.parties.split(',').map((p) => p.trim()).filter(Boolean);
    } else {
      parties = getPartiesFromRights(bootstrapInfo.userRights);
      if (parties.length === 0 && bootstrapInfo.knownParties?.length > 0) {
        parties = bootstrapInfo.knownParties;
      }
    }

    if (parties.length === 0) {
      return reply.send({ data: [], meta: {} });
    }

    const currentOffset = await client.stateService.getLedgerEnd();
    const updates = await client.updateService.getRecentUpdates(
      currentOffset,
      parties,
      'ACS_DELTA',
      limit,
    );

    return reply.send({
      data: updates,
      meta: {
        offset: currentOffset,
        timestamp: new Date().toISOString(),
        totalCount: updates.length,
      },
    });
  });

  /**
   * GET /api/v1/events/stream
   *
   * WebSocket endpoint for real-time event streaming.
   *
   * Query params:
   *   parties  — Comma-separated party IDs (required)
   *   offset   — Start offset (optional, defaults to current)
   *   shape    — ACS_DELTA or LEDGER_EFFECTS (default LEDGER_EFFECTS)
   *
   * Client can send filter updates via WebSocket messages:
   *   { "type": "filter_update", "filter": { ... } }
   *
   * Server sends events:
   *   { "type": "update", "data": LedgerUpdate }
   *   { "type": "error", "data": { "message": "..." } }
   *   { "type": "stream_end", "data": { "lastOffset": "..." } }
   */
  app.get<{
    Querystring: {
      parties?: string;
      offset?: string;
      shape?: string;
      templates?: string;
      eventTypes?: string;
    };
  }>('/api/v1/events/stream', {
    websocket: true,
    schema: {
      description: 'WebSocket stream of Canton ledger updates (all 4 update types)',
      tags: ['Event Stream Monitor'],
      querystring: {
        type: 'object',
        properties: {
          parties: { type: 'string', description: 'Comma-separated party IDs' },
          offset: { type: 'string', description: 'Start offset (exclusive)' },
          shape: { type: 'string', enum: ['ACS_DELTA', 'LEDGER_EFFECTS'] },
          templates: { type: 'string', description: 'Comma-separated template filters' },
          eventTypes: { type: 'string', description: 'Comma-separated event types to include' },
        },
      },
    },
  }, async (socket: WebSocket, request: FastifyRequest<{
    Querystring: {
      parties?: string;
      offset?: string;
      shape?: string;
      templates?: string;
      eventTypes?: string;
    };
  }>) => {
    let ctx;
    try {
      ctx = requireCantonContext(request);
    } catch (err) {
      socket.send(JSON.stringify({
        type: 'error',
        data: { message: 'Not connected to Canton participant. Call POST /api/v1/connect first.' },
      }));
      socket.close(4003, 'Not connected');
      return;
    }

    const { client, bootstrapInfo } = ctx;
    const { parties, offset, shape, templates, eventTypes } = request.query;

    // Parse parties — fallback to knownParties from bootstrap
    let partyList: string[];
    if (parties) {
      partyList = parties.split(',').map((p) => p.trim()).filter(Boolean);
    } else {
      partyList = getPartiesFromRights(bootstrapInfo.userRights);
      if (partyList.length === 0 && bootstrapInfo.knownParties?.length > 0) {
        partyList = bootstrapInfo.knownParties;
      }
    }

    if (partyList.length === 0) {
      socket.send(JSON.stringify({
        type: 'error',
        data: { message: 'At least one party is required.' },
      }));
      socket.close(4001, 'Missing parties');
      return;
    }

    // Determine start offset
    let startOffset = offset ?? '';
    if (!startOffset) {
      // Try to resume from cached offset
      const subscriptionId = `ws-${request.userId}-${partyList.join(',')}`;
      const cachedOffset = await cache.getLastOffset(subscriptionId);
      startOffset = cachedOffset ?? bootstrapInfo.currentOffset;
    }

    // Build initial filter
    const filter: EventStreamFilter = {
      templates: templates
        ? templates.split(',').map((t) => {
            const parts = t.trim().split(':');
            return { packageName: parts[0] ?? '', moduleName: parts[1] ?? '', entityName: parts[2] ?? '' };
          })
        : undefined,
      parties: partyList,
      eventTypes: eventTypes ? eventTypes.split(',').map((e) => e.trim()) : undefined,
      transactionShape: (shape as 'ACS_DELTA' | 'LEDGER_EFFECTS') ?? 'LEDGER_EFFECTS',
    };

    // Generate subscription ID
    const subscriptionId = `ws-${request.userId}-${crypto.randomUUID().slice(0, 8)}`;

    // Subscribe to the event stream
    subscribeToEventStream(
      subscriptionId,
      client,
      socket,
      filter,
      partyList,
      startOffset,
      cache,
    );
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
