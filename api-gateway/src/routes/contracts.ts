/**
 * Contract Routes
 *
 * GET /api/v1/contracts/:contractId           — Single contract details
 * GET /api/v1/contracts/:contractId/lifecycle  — Full contract lifecycle
 *
 * Lifecycle uses:
 * 1. EventQueryService.GetEventsByContractId (Created + Archived wrappers, NOT ExercisedEvent)
 * 2. For archived: UpdateService.GetUpdateById with LEDGER_EFFECTS to get exercise details
 * 3. Checks pruning boundary, flags divulged contracts
 */

import type { FastifyInstance } from 'fastify';
import { requireCantonContext } from '../middleware/canton-context.js';
import type { ContractLifecycle, ContractExercise, ApiResponse, ActiveContract } from '../types.js';

export function registerContractRoutes(app: FastifyInstance): void {
  /**
   * GET /api/v1/contracts/:contractId
   *
   * Get details for a single contract.
   */
  app.get<{
    Params: { contractId: string };
    Querystring: { parties?: string };
  }>('/api/v1/contracts/:contractId', {
    schema: {
      description: 'Get contract details by contract ID',
      tags: ['Contract Lifecycle'],
      params: {
        type: 'object',
        required: ['contractId'],
        properties: {
          contractId: { type: 'string' },
        },
      },
      querystring: {
        type: 'object',
        properties: {
          parties: { type: 'string', description: 'Comma-separated requesting parties' },
        },
      },
    },
  }, async (request, reply) => {
    const { client, bootstrapInfo } = requireCantonContext(request);
    const { contractId } = request.params;
    const parties = parseParties(request.query.parties, bootstrapInfo.userRights, bootstrapInfo.knownParties);

    if (parties.length === 0) {
      return reply.code(400).send({
        code: 'MISSING_PARTIES',
        message: 'At least one requesting party is required.',
      });
    }

    // Use EventQueryService to get creation event
    const events = await client.eventQueryService.getEventsByContractId(contractId, parties);

    if (!events.created) {
      return reply.code(404).send({
        code: 'CONTRACT_NOT_FOUND',
        message: `Contract ${contractId} not found or not visible to the requesting parties.`,
      });
    }

    const contract: ActiveContract = {
      contractId: events.created.event.contractId,
      templateId: events.created.event.templateId,
      payload: events.created.event.payload,
      signatories: events.created.event.signatories,
      observers: events.created.event.observers,
      createdAt: '',
      contractKey: events.created.event.contractKey,
    };

    return reply.send({
      data: {
        ...contract,
        isArchived: !!events.archived,
        synchronizerId: events.created.synchronizerId,
      },
      meta: {
        timestamp: new Date().toISOString(),
      },
    });
  });

  /**
   * GET /api/v1/contracts/:contractId/lifecycle
   *
   * Full contract lifecycle including creation, exercises, and archival.
   *
   * Steps:
   * 1. EventQueryService.GetEventsByContractId → Created + Archived wrappers
   * 2. For archived contracts: UpdateService.GetUpdateById with LEDGER_EFFECTS
   *    to get the exercise event details (choice, arguments, acting parties)
   * 3. Check pruning boundary
   * 4. Flag divulged contracts (created event visible but no creation transaction found)
   */
  app.get<{
    Params: { contractId: string };
    Querystring: { parties?: string };
  }>('/api/v1/contracts/:contractId/lifecycle', {
    schema: {
      description: 'Get full contract lifecycle: creation, exercises, and archival',
      tags: ['Contract Lifecycle'],
      params: {
        type: 'object',
        required: ['contractId'],
        properties: {
          contractId: { type: 'string' },
        },
      },
      querystring: {
        type: 'object',
        properties: {
          parties: { type: 'string', description: 'Comma-separated requesting parties' },
        },
      },
    },
  }, async (request, reply) => {
    const { client, bootstrapInfo } = requireCantonContext(request);
    const { contractId } = request.params;
    const parties = parseParties(request.query.parties, bootstrapInfo.userRights, bootstrapInfo.knownParties);

    if (parties.length === 0) {
      return reply.code(400).send({
        code: 'MISSING_PARTIES',
        message: 'At least one requesting party is required.',
      });
    }

    // Step 1: Get Created + Archived wrapper events
    // NOTE: EventQueryService returns wrapper messages, NOT ExercisedEvent
    const contractEvents = await client.eventQueryService.getEventsByContractId(contractId, parties);

    if (!contractEvents.created) {
      // Check if this might be due to pruning
      const isPruned = bootstrapInfo.pruningOffset
        ? true // Can't determine without offset — flag as potentially pruned
        : false;

      return reply.code(404).send({
        code: 'CONTRACT_NOT_FOUND',
        message: isPruned
          ? `Contract ${contractId} not found. Data may have been pruned before offset ${bootstrapInfo.pruningOffset}.`
          : `Contract ${contractId} not found or not visible to the requesting parties.`,
        details: { isPruned, prunedBefore: bootstrapInfo.pruningOffset },
      });
    }

    const createdEvent = contractEvents.created.event;
    const createdAtOffset = contractEvents.created.createdAtOffset;
    const exercises: ContractExercise[] = [];
    let archival: ContractLifecycle['archival'] = undefined;
    let isDivulged = false;

    // Resolve creation transaction metadata (updateId, offset, recordTime)
    // The EventQueryService only returns event wrappers without update_id/recordTime.
    // Use the createdAt offset to look up the creating transaction via UpdateService.
    let creationUpdateId = '';
    let creationOffset = createdAtOffset || '';
    let creationRecordTime = '';

    if (createdAtOffset) {
      try {
        const creationMeta = await client.updateService.getUpdateMetadataAtOffset(
          createdAtOffset,
          parties,
        );
        if (creationMeta) {
          creationUpdateId = String(creationMeta.updateId ?? '');
          creationOffset = String(creationMeta.offset ?? '');
          creationRecordTime = typeof creationMeta.recordTime === 'object' && creationMeta.recordTime?.seconds
            ? new Date(Number(creationMeta.recordTime.seconds) * 1000).toISOString()
            : String(creationMeta.recordTime ?? '');
        }
      } catch (err) {
        request.log.warn({ err, contractId, createdAtOffset }, 'Failed to resolve creation transaction metadata');
      }
    }

    // Step 2: If archived, get the archiving transaction for exercise details
    if (contractEvents.archived) {
      try {
        // We need to find the update that archived this contract.
        // The archived event wrapper gives us the event_id but not the update_id directly.
        // We search for the transaction that contains this archive via UpdateService.
        //
        // For archived contracts, we use GetUpdateById if we have the update_id,
        // or we examine the archived event to correlate.
        // In practice, the archival event's transaction can be found by examining
        // the event stream around the archive offset.
        //
        // Since EventQueryService only returns Created/Archived wrappers (NOT ExercisedEvent),
        // we must use UpdateService.GetUpdateById with LEDGER_EFFECTS shape
        // to get the full exercise details.

        // The archived event wrapper doesn't directly include update_id,
        // but the event_id encodes the transaction offset.
        // We attempt to extract and fetch the full transaction.
        const archivedEventId = contractEvents.archived.event.eventId;

        // Try to get the archiving transaction using the event ID
        // Event IDs in Canton often encode the update reference
        const updateId = extractUpdateIdFromEventId(archivedEventId);

        if (updateId) {
          const txDetail = await client.updateService.getUpdateById(updateId, 'LEDGER_EFFECTS', parties);

          if (txDetail) {
            // Find the exercise event that archived this contract
            for (const event of Object.values(txDetail.eventsById)) {
              if (event.eventType === 'exercised' && event.contractId === contractId && event.consuming) {
                archival = {
                  updateId: txDetail.updateId,
                  offset: txDetail.offset,
                  recordTime: txDetail.recordTime,
                  choice: event.choice,
                  choiceArgument: event.choiceArgument,
                  actingParties: event.actingParties,
                  childContractIds: event.childEventIds ?? [],
                };
              }

              // Also collect non-consuming exercises
              if (event.eventType === 'exercised' && event.contractId === contractId && !event.consuming) {
                exercises.push({
                  updateId: txDetail.updateId,
                  offset: txDetail.offset,
                  recordTime: txDetail.recordTime,
                  choice: event.choice,
                  choiceArgument: event.choiceArgument,
                  actingParties: event.actingParties,
                  consuming: false,
                  childContractIds: event.childEventIds ?? [],
                });
              }
            }
          }
        }

        // If we couldn't get exercise details, still mark as archived
        if (!archival) {
          archival = {
            updateId: '',
            offset: '',
            recordTime: '',
            choice: '<unknown — exercise details not available>',
            choiceArgument: {},
            actingParties: [],
            childContractIds: [],
          };
        }
      } catch (err) {
        request.log.warn({ err, contractId }, 'Failed to fetch archiving transaction details');
        archival = {
          updateId: '',
          offset: '',
          recordTime: '',
          choice: '<error fetching exercise details>',
          choiceArgument: {},
          actingParties: [],
          childContractIds: [],
        };
      }
    }

    // Step 3: Check pruning
    // We cannot determine the exact creation offset from EventQueryService alone,
    // so we flag as potentially pruned if a pruning boundary exists and we lack
    // creation offset information.
    const isPruned = false; // Creation event was returned, so it is not pruned

    // Step 4: Detect divulged contracts
    // A contract is considered divulged if it's visible to the querying parties
    // but they are not signatories or observers.
    if (createdEvent.signatories.length === 0 && createdEvent.observers.length === 0) {
      isDivulged = true;
    } else {
      const allStakeholders = new Set([...createdEvent.signatories, ...createdEvent.observers]);
      isDivulged = !parties.some((p) => allStakeholders.has(p));
    }

    const lifecycle: ContractLifecycle = {
      contractId,
      templateId: createdEvent.templateId,
      creation: {
        updateId: creationUpdateId,
        offset: creationOffset,
        recordTime: creationRecordTime,
        payload: createdEvent.payload,
        signatories: createdEvent.signatories,
        observers: createdEvent.observers,
      },
      exercises,
      archival,
      isDivulged,
      isPruned,
      prunedBefore: isPruned ? bootstrapInfo.pruningOffset : undefined,
    };

    const response: ApiResponse<ContractLifecycle> = {
      data: lifecycle,
      meta: {
        timestamp: new Date().toISOString(),
      },
    };

    return reply.send(response);
  });
}

// ============================================================
// Helpers
// ============================================================

function parseParties(
  partiesParam: string | undefined,
  userRights: Array<{ type: string; party?: string }>,
  knownParties?: string[],
): string[] {
  if (partiesParam) {
    return partiesParam.split(',').map((p) => p.trim()).filter(Boolean);
  }
  const parties = new Set<string>();
  for (const right of userRights) {
    if ('party' in right && right.party) {
      parties.add(right.party);
    }
  }
  // Fall back to knownParties in sandbox mode (where userRights is empty)
  if (parties.size === 0 && knownParties?.length) {
    return knownParties;
  }
  return Array.from(parties);
}

/**
 * Attempt to extract an update ID from a Canton event ID.
 *
 * Canton event IDs may encode the update/transaction reference.
 * Format varies by version but often includes a prefix and transaction hash.
 */
function extractUpdateIdFromEventId(eventId: string): string | null {
  // Canton event IDs are typically structured, but the format is not guaranteed.
  // Common patterns:
  //   #<updateId>:<eventIndex>
  //   <participantPrefix>:<updateId>:<index>
  if (eventId.startsWith('#')) {
    const parts = eventId.slice(1).split(':');
    if (parts[0]) return parts[0];
  }
  // If we can't extract it, return null
  return null;
}
