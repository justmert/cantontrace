/**
 * Transaction Routes
 *
 * GET /api/v1/transactions/:updateId — Get transaction by update ID
 *
 * Uses LEDGER_EFFECTS shape to get full transaction tree.
 * Reconstructs tree from events_by_id flat map.
 * Computes state diff (inputs consumed vs outputs created).
 */

import type { FastifyInstance } from 'fastify';
import { requireCantonContext } from '../middleware/canton-context.js';
import type { TransactionDetail, ApiResponse } from '../types.js';

export function registerTransactionRoutes(app: FastifyInstance): void {
  /**
   * GET /api/v1/transactions/:updateId
   *
   * Get a transaction by its globally unique update ID.
   * Uses LEDGER_EFFECTS shape to include exercise events and full tree structure.
   *
   * The response includes:
   * - Reconstructed transaction tree from events_by_id
   * - State diff (inputs consumed, outputs created)
   * - All decoded payloads
   */
  app.get<{
    Params: { updateId: string };
    Querystring: { shape?: string; parties?: string };
  }>('/api/v1/transactions/:updateId', {
    schema: {
      description: 'Get transaction details by update ID with full tree and state diff',
      tags: ['Transaction Explorer'],
      params: {
        type: 'object',
        required: ['updateId'],
        properties: {
          updateId: { type: 'string', description: 'Globally unique update ID' },
        },
      },
      querystring: {
        type: 'object',
        properties: {
          shape: {
            type: 'string',
            enum: ['ACS_DELTA', 'LEDGER_EFFECTS'],
            description: 'Transaction shape. LEDGER_EFFECTS includes exercise events.',
          },
          parties: { type: 'string', description: 'Comma-separated party IDs (required for Canton 3.4+)' },
        },
      },
    },
  }, async (request, reply) => {
    const { client, bootstrapInfo } = requireCantonContext(request);
    const { updateId } = request.params;
    const shape = (request.query.shape as 'ACS_DELTA' | 'LEDGER_EFFECTS') ?? 'LEDGER_EFFECTS';

    // Canton 3.4+ requires parties in the event_format filter
    let parties = request.query.parties
      ? request.query.parties.split(',').map(p => p.trim()).filter(Boolean)
      : bootstrapInfo.userRights
          .filter((r): r is { type: 'CanReadAs'; party: string } => 'party' in r)
          .map(r => r.party);

    if (parties.length === 0 && bootstrapInfo.knownParties?.length > 0) {
      parties = bootstrapInfo.knownParties;
    }

    const txDetail = await client.updateService.getUpdateById(updateId, shape, parties);

    if (!txDetail) {
      return reply.code(404).send({
        code: 'TRANSACTION_NOT_FOUND',
        message: `Transaction with update_id '${updateId}' not found.`,
      });
    }

    // The tree is already reconstructed by the UpdateService wrapper.
    // eventsById contains all events indexed by event ID.
    // rootEventIds lists the top-level events.
    // stateDiff is computed from the events.

    // C3: Enrich consumed contract payloads in the state diff.
    // For contracts consumed from *previous* transactions, the payload isn't
    // available in the transaction tree. We fetch it from
    // EventQueryService.GetEventsByContractId which returns the original
    // Created event with full payload.
    // NOTE: For contracts created and consumed in the *same* transaction,
    // computeStateDiff already copies the payload from the sibling CreatedEvent.
    const inputsNeedingEnrichment = txDetail.stateDiff.inputs.filter(
      (input) => !input.payload || Object.keys(input.payload).length === 0,
    );

    if (inputsNeedingEnrichment.length > 0 && parties.length > 0) {
      const enrichPromises = inputsNeedingEnrichment.map(async (input) => {
        try {
          const contractEvents = await client.eventQueryService.getEventsByContractId(
            input.contractId,
            parties,
          );
          if (contractEvents.created) {
            const createdEvent = contractEvents.created.event;
            input.payload = createdEvent.payload;
            input.signatories = createdEvent.signatories;
            input.observers = createdEvent.observers;
            input.templateId = createdEvent.templateId;
          } else {
            request.log.debug(
              { contractId: input.contractId },
              'EventQueryService returned no created event for consumed contract',
            );
          }
        } catch (err) {
          // Best-effort: if the lookup fails (e.g. pruned), leave payload empty
          request.log.debug(
            { contractId: input.contractId, error: err instanceof Error ? err.message : String(err) },
            'Failed to enrich consumed contract payload',
          );
        }
      });
      await Promise.all(enrichPromises);
    }

    const response: ApiResponse<TransactionDetail> = {
      data: txDetail,
      meta: {
        offset: txDetail.offset,
        timestamp: txDetail.recordTime,
      },
    };

    return reply.send(response);
  });

  /**
   * GET /api/v1/transactions/recent
   *
   * Fetch recent transactions using descending_order + end_inclusive.
   * Returns the most recent N transactions without streaming from the beginning.
   */
  app.get<{
    Querystring: { limit?: string; parties?: string };
  }>('/api/v1/transactions/recent', {
    schema: {
      tags: ['transactions'],
      summary: 'Get recent transactions (reverse chronological)',
      querystring: {
        type: 'object',
        properties: {
          limit: { type: 'string', default: '20' },
          parties: { type: 'string', description: 'Comma-separated party IDs' },
        },
      },
    },
  }, async (request, reply) => {
    const { client, bootstrapInfo } = requireCantonContext(request);
    const limit = Math.min(parseInt(request.query.limit ?? '20', 10) || 20, 100);
    let parties = request.query.parties
      ? request.query.parties.split(',').map(p => p.trim())
      : bootstrapInfo.userRights
          .filter((r): r is { type: 'CanReadAs'; party: string } => 'party' in r)
          .map(r => r.party);

    // Fall back to knownParties in sandbox mode (where userRights is empty)
    if (parties.length === 0 && bootstrapInfo.knownParties?.length > 0) {
      parties = bootstrapInfo.knownParties;
    }

    if (parties.length === 0) {
      return reply.send({ data: [], meta: {} });
    }

    const currentOffset = await client.stateService.getLedgerEnd();
    const updates = await client.updateService.getRecentUpdates(
      currentOffset,
      parties,
      'LEDGER_EFFECTS',
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
}
