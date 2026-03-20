/**
 * Workflow Debugger Routes
 *
 * GET /api/v1/workflows — Three correlation mechanisms:
 *   1. trace_context.trace_parent -> group by trace ID
 *   2. Contract chain following
 *   3. workflow_id grouping
 */

import type { FastifyInstance } from 'fastify';
import { requireCantonContext } from '../middleware/canton-context.js';
import type {
  WorkflowTimeline,
  WorkflowTransaction,
  ContractFlow,
  LedgerUpdate,
  LedgerEvent,
  ApiResponse,
} from '../types.js';

export function registerWorkflowRoutes(app: FastifyInstance): void {
  /**
   * GET /api/v1/workflows
   *
   * Discover and reconstruct workflows using three correlation mechanisms:
   *
   * 1. trace_context.trace_parent -> Extract W3C trace ID, group all updates sharing the same trace
   * 2. Contract chain following -> Start from a contract, follow the chain of creates/archives
   * 3. workflow_id grouping -> Group all updates with the same workflow_id
   */
  app.get<{
    Querystring: {
      correlationType: string;
      correlationKey: string;
      parties?: string;
      limit?: string;
    };
  }>('/api/v1/workflows', {
    schema: {
      description: 'Reconstruct workflows using correlation mechanisms',
      tags: ['Workflow Debugger'],
      querystring: {
        type: 'object',
        required: ['correlationType', 'correlationKey'],
        properties: {
          correlationType: {
            type: 'string',
            enum: ['trace_context', 'contract_chain', 'workflow_id', 'update_id'],
          },
          correlationKey: { type: 'string', description: 'Trace ID, contract ID, workflow ID, or update ID' },
          parties: { type: 'string', description: 'Comma-separated parties' },
          limit: { type: 'string', description: 'Max number of transactions to include' },
        },
      },
    },
  }, async (request, reply) => {
    const { client, bootstrapInfo } = requireCantonContext(request);
    const { correlationType, correlationKey, parties, limit: limitStr } = request.query;

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

    const maxTransactions = Math.min(parseInt(limitStr ?? '50', 10) || 50, 200);

    let timeline: WorkflowTimeline;

    switch (correlationType) {
      case 'trace_context':
        timeline = await correlateByTraceContext(
          client, partyList, correlationKey, maxTransactions, bootstrapInfo.currentOffset,
        );
        break;

      case 'contract_chain':
        timeline = await correlateByContractChain(
          client, partyList, correlationKey, maxTransactions,
        );
        break;

      case 'workflow_id':
        timeline = await correlateByWorkflowId(
          client, partyList, correlationKey, maxTransactions, bootstrapInfo.currentOffset,
        );
        break;

      case 'update_id':
        timeline = await correlateByUpdateId(
          client, partyList, correlationKey, maxTransactions,
        );
        break;

      default:
        return reply.code(400).send({
          code: 'INVALID_CORRELATION_TYPE',
          message: `Unknown correlation type: ${correlationType}`,
        });
    }

    const response: ApiResponse<WorkflowTimeline> = {
      data: timeline,
      meta: {
        timestamp: new Date().toISOString(),
      },
    };

    return reply.send(response);
  });
}

// ============================================================
// Correlation Mechanism 1: W3C Trace Context
// ============================================================

async function correlateByTraceContext(
  client: ReturnType<typeof requireCantonContext>['client'],
  parties: string[],
  traceId: string,
  maxTransactions: number,
  startOffset: string,
): Promise<WorkflowTimeline> {
  const transactions: WorkflowTransaction[] = [];
  const contractFlows: ContractFlow[] = [];

  // Stream updates and collect those matching the trace ID
  return new Promise((resolve) => {
    const collected: LedgerUpdate[] = [];
    let count = 0;

    const { cancel } = client.updateService.getUpdates(
      '', // From beginning (ideally we'd have a better start point)
      parties,
      'LEDGER_EFFECTS',
      startOffset,
      undefined,
      (update) => {
        // Match W3C trace_parent format: version-traceId-parentId-flags
        const updateTraceId = update.traceContext?.traceParent?.split('-')?.[1];
        if (updateTraceId === traceId) {
          collected.push(update);
          count++;
          if (count >= maxTransactions) {
            cancel();
          }
        }
      },
      () => {
        resolve(buildTimeline('trace_context', traceId, collected));
      },
      () => {
        resolve(buildTimeline('trace_context', traceId, collected));
      },
    );

    // Safety timeout
    setTimeout(() => {
      cancel();
      resolve(buildTimeline('trace_context', traceId, collected));
    }, 15000);
  });
}

// ============================================================
// Correlation Mechanism 2: Contract Chain Following
// ============================================================

async function correlateByContractChain(
  client: ReturnType<typeof requireCantonContext>['client'],
  parties: string[],
  startContractId: string,
  maxTransactions: number,
): Promise<WorkflowTimeline> {
  const updates: LedgerUpdate[] = [];
  const visited = new Set<string>();
  const contractQueue = [startContractId];

  while (contractQueue.length > 0 && updates.length < maxTransactions) {
    const contractId = contractQueue.shift()!;
    if (visited.has(contractId)) continue;
    visited.add(contractId);

    // Get events for this contract
    const events = await client.eventQueryService.getEventsByContractId(contractId, parties);

    if (events.created) {
      // If there's an archiving transaction, get its full details
      if (events.archived) {
        const eventId = events.archived.event.eventId;
        const updateId = extractUpdateId(eventId);

        if (updateId) {
          const txDetail = await client.updateService.getUpdateById(updateId, 'LEDGER_EFFECTS', parties);
          if (txDetail) {
            const update: LedgerUpdate = {
              updateId: txDetail.updateId,
              updateType: 'transaction',
              offset: txDetail.offset,
              recordTime: txDetail.recordTime,
              commandId: txDetail.commandId,
              workflowId: txDetail.workflowId,
              traceContext: txDetail.traceContext,
              events: Object.values(txDetail.eventsById),
            };

            if (!updates.find((u) => u.updateId === update.updateId)) {
              updates.push(update);
            }

            // Follow child contracts
            for (const event of Object.values(txDetail.eventsById)) {
              if (event.eventType === 'created') {
                contractQueue.push(event.contractId);
              }
            }
          }
        }
      }
    }
  }

  return buildTimeline('contract_chain', startContractId, updates);
}

// ============================================================
// Correlation Mechanism 3: Workflow ID Grouping
// ============================================================

async function correlateByWorkflowId(
  client: ReturnType<typeof requireCantonContext>['client'],
  parties: string[],
  workflowId: string,
  maxTransactions: number,
  startOffset: string,
): Promise<WorkflowTimeline> {
  return new Promise((resolve) => {
    const collected: LedgerUpdate[] = [];
    let count = 0;

    const { cancel } = client.updateService.getUpdates(
      '',
      parties,
      'LEDGER_EFFECTS',
      startOffset,
      undefined,
      (update) => {
        if (update.workflowId === workflowId) {
          collected.push(update);
          count++;
          if (count >= maxTransactions) {
            cancel();
          }
        }
      },
      () => {
        resolve(buildTimeline('workflow_id', workflowId, collected));
      },
      () => {
        resolve(buildTimeline('workflow_id', workflowId, collected));
      },
    );

    setTimeout(() => {
      cancel();
      resolve(buildTimeline('workflow_id', workflowId, collected));
    }, 15000);
  });
}

// ============================================================
// Correlation Mechanism 4: Single Update ID
// ============================================================

async function correlateByUpdateId(
  client: ReturnType<typeof requireCantonContext>['client'],
  parties: string[],
  updateId: string,
  _maxTransactions: number,
): Promise<WorkflowTimeline> {
  const txDetail = await client.updateService.getUpdateById(updateId, 'LEDGER_EFFECTS', parties);

  if (!txDetail) {
    return {
      correlationType: 'update_id',
      correlationKey: updateId,
      transactions: [],
      contractFlows: [],
    };
  }

  const events = Object.values(txDetail.eventsById);
  const update: LedgerUpdate = {
    updateId: txDetail.updateId,
    updateType: 'transaction',
    offset: txDetail.offset,
    recordTime: txDetail.recordTime,
    commandId: txDetail.commandId,
    workflowId: txDetail.workflowId,
    traceContext: txDetail.traceContext,
    events,
  };

  return buildTimeline('update_id', updateId, [update]);
}

// ============================================================
// Shared Helpers
// ============================================================

function buildTimeline(
  correlationType: string,
  correlationKey: string,
  updates: LedgerUpdate[],
): WorkflowTimeline {
  // Sort by record time
  updates.sort((a, b) => a.recordTime.localeCompare(b.recordTime));

  const transactions: WorkflowTransaction[] = updates.map((u) => {
    const contractsCreated: string[] = [];
    const contractsConsumed: string[] = [];
    let templateId = { packageName: '', moduleName: '', entityName: '' };
    let choice: string | undefined;
    const actingParties = new Set<string>();

    for (const event of u.events) {
      if (event.eventType === 'created') {
        contractsCreated.push(event.contractId);
        templateId = event.templateId;
      }
      if (event.eventType === 'archived') {
        contractsConsumed.push(event.contractId);
      }
      if (event.eventType === 'exercised') {
        contractsConsumed.push(event.contractId);
        templateId = event.templateId;
        choice = event.choice;
        for (const party of event.actingParties) {
          actingParties.add(party);
        }
      }
    }

    return {
      updateId: u.updateId,
      offset: u.offset,
      recordTime: u.recordTime,
      commandId: u.commandId,
      workflowId: u.workflowId,
      traceContext: u.traceContext,
      templateId,
      choice,
      actingParties: Array.from(actingParties),
      contractsCreated,
      contractsConsumed,
    };
  });

  // Build contract flows (links between transactions via shared contracts)
  const contractFlows: ContractFlow[] = [];
  const contractCreators = new Map<string, { updateId: string; templateId: typeof transactions[0]['templateId'] }>();

  for (const tx of transactions) {
    for (const cid of tx.contractsCreated) {
      contractCreators.set(cid, { updateId: tx.updateId, templateId: tx.templateId });
    }
  }

  for (const tx of transactions) {
    for (const cid of tx.contractsConsumed) {
      const creator = contractCreators.get(cid);
      if (creator && creator.updateId !== tx.updateId) {
        contractFlows.push({
          fromUpdateId: creator.updateId,
          toUpdateId: tx.updateId,
          contractId: cid,
          templateId: creator.templateId,
        });
      }
    }
  }

  return {
    correlationType,
    correlationKey,
    transactions,
    contractFlows,
  };
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

function extractUpdateId(eventId: string): string | null {
  if (eventId.startsWith('#')) {
    const parts = eventId.slice(1).split(':');
    if (parts[0]) return parts[0];
  }
  return null;
}
