/**
 * Privacy Visualizer Routes
 *
 * GET /api/v1/transactions/:updateId/privacy — Build visibility matrix
 *
 * Fetches transaction with LEDGER_EFFECTS shape and builds per-party visibility.
 */

import type { FastifyInstance } from 'fastify';
import { requireCantonContext } from '../middleware/canton-context.js';
import type {
  PrivacyAnalysis,
  PrivacyEvent,
  DisclosedBoundary,
  LedgerEvent,
  ApiResponse,
} from '../types.js';

export function registerPrivacyRoutes(app: FastifyInstance): void {
  /**
   * GET /api/v1/transactions/:updateId/privacy
   *
   * Analyze the privacy structure of a transaction.
   * Builds a visibility matrix showing which parties can see which events.
   *
   * Uses LEDGER_EFFECTS shape to get full witness information.
   */
  app.get<{
    Params: { updateId: string };
  }>('/api/v1/transactions/:updateId/privacy', {
    schema: {
      description: 'Analyze transaction privacy — per-party visibility matrix',
      tags: ['Privacy Visualizer'],
      params: {
        type: 'object',
        required: ['updateId'],
        properties: {
          updateId: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const { client, bootstrapInfo } = requireCantonContext(request);
    const { updateId } = request.params;

    // Canton 3.4+ requires parties in the event_format filter
    let requestingParties = bootstrapInfo.userRights
      .filter((r): r is { type: 'CanReadAs'; party: string } => 'party' in r)
      .map(r => r.party);
    if (requestingParties.length === 0 && bootstrapInfo.knownParties?.length > 0) {
      requestingParties = bootstrapInfo.knownParties;
    }

    // Fetch with LEDGER_EFFECTS to get full witness information
    const txDetail = await client.updateService.getUpdateById(updateId, 'LEDGER_EFFECTS', requestingParties);

    if (!txDetail) {
      return reply.code(404).send({
        code: 'TRANSACTION_NOT_FOUND',
        message: `Transaction '${updateId}' not found.`,
      });
    }

    // Collect all parties across all events
    const allParties = new Set<string>();
    const privacyEvents: PrivacyEvent[] = [];
    const visibilityMatrix: Record<string, string[]> = {};
    const disclosedBoundaries: DisclosedBoundary[] = [];

    for (const [eventId, event] of Object.entries(txDetail.eventsById)) {
      const pe = buildPrivacyEvent(eventId, event);
      privacyEvents.push(pe);

      // Collect parties
      for (const party of pe.signatories) allParties.add(party);
      for (const party of pe.observers) allParties.add(party);
      for (const party of pe.witnesses) allParties.add(party);
      for (const party of pe.actingParties) allParties.add(party);
    }

    // Build visibility matrix
    const parties = Array.from(allParties).sort();

    for (const party of parties) {
      const visibleEventIds: string[] = [];

      for (const pe of privacyEvents) {
        if (isVisibleToParty(pe, party)) {
          visibleEventIds.push(pe.eventId);
        }
      }

      visibilityMatrix[party] = visibleEventIds;
    }

    // Detect disclosed contract boundaries
    for (const pe of privacyEvents) {
      if (pe.isDisclosed) {
        for (const party of parties) {
          if (
            isVisibleToParty(pe, party) &&
            !pe.signatories.includes(party) &&
            !pe.observers.includes(party)
          ) {
            disclosedBoundaries.push({
              eventId: pe.eventId,
              contractId: extractContractId(pe, txDetail.eventsById),
              accessedBy: party,
              reason: 'Witness via LEDGER_EFFECTS (informed party, not stakeholder)',
            });
          }
        }
      }
    }

    const analysis: PrivacyAnalysis = {
      updateId,
      parties,
      visibilityMatrix,
      events: privacyEvents,
      disclosedContractBoundaries: disclosedBoundaries,
    };

    const response: ApiResponse<PrivacyAnalysis> = {
      data: analysis,
      meta: {
        timestamp: new Date().toISOString(),
      },
    };

    return reply.send(response);
  });
}

function buildPrivacyEvent(eventId: string, event: LedgerEvent): PrivacyEvent {
  const base = {
    eventId,
    eventType: event.eventType,
    templateId: ('templateId' in event && event.templateId) ? event.templateId : { packageName: '', moduleName: '', entityName: '' },
  };

  switch (event.eventType) {
    case 'created':
      return {
        ...base,
        signatories: event.signatories,
        observers: event.observers,
        witnesses: event.witnesses,
        actingParties: [],
        isDisclosed: false,
      };

    case 'archived':
      return {
        ...base,
        signatories: [],
        observers: [],
        witnesses: event.witnesses,
        actingParties: [],
        isDisclosed: false,
      };

    case 'exercised':
      return {
        ...base,
        signatories: [],
        observers: [],
        witnesses: event.witnesses,
        actingParties: event.actingParties,
        isDisclosed: event.witnesses.length > event.actingParties.length,
      };

    default:
      return {
        ...base,
        signatories: [],
        observers: [],
        witnesses: [],
        actingParties: [],
        isDisclosed: false,
      };
  }
}

function isVisibleToParty(pe: PrivacyEvent, party: string): boolean {
  return (
    pe.signatories.includes(party) ||
    pe.observers.includes(party) ||
    pe.witnesses.includes(party) ||
    pe.actingParties.includes(party)
  );
}

function extractContractId(
  pe: PrivacyEvent,
  eventsById: Record<string, LedgerEvent>,
): string {
  const event = eventsById[pe.eventId];
  if (event && 'contractId' in event) {
    return event.contractId;
  }
  return '';
}
