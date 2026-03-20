/**
 * UpdateService wrapper — GetUpdates (streaming), GetUpdateById
 *
 * Handles all 4 update types: transaction, reassignment, topology_transaction, offset_checkpoint.
 * Supports both ACS_DELTA and LEDGER_EFFECTS transaction shapes.
 *
 * In Canton 3.4+, the request format changed:
 * - GetUpdatesRequest uses `update_format` (not `filter`/`verbose`/`transaction_shape`)
 * - GetUpdateByIdRequest uses `update_format` (not `transaction_shape`)
 * - Offsets are int64 (sent as strings via proto-loader)
 */

import type * as grpc from '@grpc/grpc-js';
import type {
  GetUpdatesResponse,
  Transaction,
  Reassignment as ProtoReassignment,
  TopologyTransaction,
  OffsetCheckpoint,
  TreeEvent,
} from '../proto/types.js';
import { TransactionShape } from '../proto/types.js';
import {
  createMetadata,
  makeUnaryCall,
  makeServerStreamCall,
  timestampToISO,
  buildTransactionFilter,
} from './shared.js';
import { valueToObject } from './state-service.js';
import type {
  LedgerUpdate,
  LedgerEvent,
  TransactionDetail,
  StateDiff,
  ActiveContract,
  TemplateId,
} from '../../types.js';

export class UpdateServiceClient {
  constructor(
    private readonly client: grpc.Client,
    private readonly getToken: () => string | null,
  ) {}

  /**
   * Subscribe to updates via server streaming.
   *
   * @param beginExclusive - Start offset (exclusive).
   * @param parties - Parties to filter updates for.
   * @param shape - Transaction shape (ACS_DELTA or LEDGER_EFFECTS).
   * @param endInclusive - Optional end offset (inclusive).
   * @param templateFilter - Optional template filters.
   * @param onUpdate - Callback for each update.
   * @param onError - Callback for errors.
   * @param onEnd - Callback when stream ends.
   * @returns Cancel function to stop the stream.
   */
  getUpdates(
    beginExclusive: string,
    parties: string[],
    shape: 'ACS_DELTA' | 'LEDGER_EFFECTS',
    endInclusive?: string,
    templateFilter?: TemplateId[],
    onUpdate?: (update: LedgerUpdate) => void,
    onError?: (error: Error) => void,
    onEnd?: () => void,
    descendingOrder?: boolean,
  ): { cancel: () => void } {
    const metadata = createMetadata(this.getToken());
    const filter = buildTransactionFilter(parties, templateFilter);
    const transactionShape =
      shape === 'LEDGER_EFFECTS'
        ? TransactionShape.TRANSACTION_SHAPE_LEDGER_EFFECTS
        : TransactionShape.TRANSACTION_SHAPE_ACS_DELTA;

    // Canton 3.4+ API: GetUpdatesRequest uses update_format, not filter/verbose/transaction_shape.
    // update_format.include_transactions = { event_format, transaction_shape }
    // update_format.include_reassignments = event_format (for reassignment events)
    const eventFormat = {
      filters_by_party: filter.filters_by_party,
      verbose: true,
    };

    const request: Record<string, unknown> = {
      begin_exclusive: beginExclusive,
      update_format: {
        include_transactions: {
          event_format: eventFormat,
          transaction_shape: transactionShape,
        },
        include_reassignments: eventFormat,
      },
    };

    if (endInclusive) {
      request.end_inclusive = endInclusive;
    }

    if (descendingOrder) {
      if (!endInclusive) {
        throw new Error(
          'descending_order requires end_inclusive to be set. Canton will reject the request without it.',
        );
      }
      request.descending_order = true;
    }

    const stream = makeServerStreamCall(this.client, 'GetUpdates', request, metadata);

    stream.on('data', (data: GetUpdatesResponse) => {
      try {
        const update = mapGetUpdatesResponse(data);
        if (update && onUpdate) {
          onUpdate(update);
        }
      } catch (err) {
        onError?.(err instanceof Error ? err : new Error(String(err)));
      }
    });

    stream.on('error', (error: Error) => {
      onError?.(error);
    });

    stream.on('end', () => {
      onEnd?.();
    });

    return {
      cancel: () => {
        stream.cancel();
      },
    };
  }

  /**
   * Fetch recent updates in reverse chronological order.
   * Uses `descending_order` + `end_inclusive` as specified in Canton 3.5.
   */
  getRecentUpdates(
    endOffset: string,
    parties: string[],
    shape: 'ACS_DELTA' | 'LEDGER_EFFECTS' = 'LEDGER_EFFECTS',
    limit: number = 20,
    templateFilter?: TemplateId[],
  ): Promise<LedgerUpdate[]> {
    return new Promise((resolve, reject) => {
      const updates: LedgerUpdate[] = [];
      let resolved = false;
      let streamRef: { cancel: () => void } | null = null;

      streamRef = this.getUpdates(
        '0',         // beginExclusive — start from the beginning (int64 as string, 0 = genesis)
        parties,
        shape,
        endOffset,   // endInclusive — required for descending_order
        templateFilter,
        (update) => {
          if (resolved) return;
          updates.push(update);
          if (updates.length >= limit) {
            resolved = true;
            streamRef?.cancel();
            resolve(updates);
          }
        },
        (error) => {
          if (!resolved) {
            resolved = true;
            reject(error);
          }
        },
        () => {
          // Stream ended naturally (fewer updates than limit)
          if (!resolved) {
            resolved = true;
            resolve(updates);
          }
        },
        true, // descendingOrder
      );
    });
  }

  /**
   * Get a single update by its ID.
   *
   * @param updateId - The globally unique update ID.
   * @param shape - Transaction shape.
   * @param parties - Requesting parties (REQUIRED in Canton 3.4+ for event_format filters).
   */
  async getUpdateById(
    updateId: string,
    shape: 'ACS_DELTA' | 'LEDGER_EFFECTS' = 'LEDGER_EFFECTS',
    parties?: string[],
  ): Promise<TransactionDetail | null> {
    const metadata = createMetadata(this.getToken());
    const transactionShape =
      shape === 'LEDGER_EFFECTS'
        ? TransactionShape.TRANSACTION_SHAPE_LEDGER_EFFECTS
        : TransactionShape.TRANSACTION_SHAPE_ACS_DELTA;

    // Canton 3.4+ API: GetUpdateByIdRequest uses update_format, not transaction_shape.
    // event_format.filters_by_party MUST be non-empty (Canton rejects empty filters).
    const eventFormat: Record<string, unknown> = {
      verbose: true,
    };

    if (parties && parties.length > 0) {
      eventFormat.filters_by_party = buildTransactionFilter(parties).filters_by_party;
    }

    const response = await makeUnaryCall<
      Record<string, unknown>,
      GetUpdatesResponse
    >(
      this.client,
      'GetUpdateById',
      {
        update_id: updateId,
        update_format: {
          include_transactions: {
            event_format: eventFormat,
            transaction_shape: transactionShape,
          },
          include_reassignments: eventFormat,
        },
      },
      metadata,
    );

    if (response.transaction) {
      return mapTransactionToDetail(response.transaction);
    }

    return null;
  }
}

// ============================================================
// Response Mapping
// ============================================================

function mapGetUpdatesResponse(response: GetUpdatesResponse): LedgerUpdate | null {
  if (response.transaction) {
    return mapTransactionToUpdate(response.transaction);
  }
  if (response.reassignment) {
    return mapReassignmentToUpdate(response.reassignment);
  }
  if (response.topology_transaction) {
    return mapTopologyToUpdate(response.topology_transaction);
  }
  if (response.offset_checkpoint) {
    return mapOffsetCheckpointToUpdate(response.offset_checkpoint);
  }
  return null;
}

function mapTransactionToUpdate(tx: Transaction): LedgerUpdate {
  const events = mapTreeEvents(tx.events ?? [], tx.events_by_id);

  return {
    updateId: tx.update_id,
    updateType: 'transaction',
    offset: tx.offset,
    recordTime: timestampToISO(tx.record_time),
    commandId: tx.command_id || undefined,
    workflowId: tx.workflow_id || undefined,
    traceContext: tx.trace_context
      ? { traceParent: tx.trace_context.traceparent, traceState: tx.trace_context.tracestate }
      : undefined,
    events,
  };
}

function mapReassignmentToUpdate(reassignment: ProtoReassignment): LedgerUpdate {
  const events: LedgerEvent[] = [];

  if (reassignment.unassigned_event) {
    const ue = reassignment.unassigned_event;
    events.push({
      eventType: 'unassigned',
      contractId: ue.contract_id,
      templateId: ue.template_id
        ? {
            packageName: ue.package_name ?? ue.template_id.package_id ?? '',
            moduleName: ue.template_id.module_name ?? '',
            entityName: ue.template_id.entity_name ?? '',
          }
        : undefined,
      source: ue.source,
      reassignmentId: ue.unassign_id,
    });
  }

  if (reassignment.assigned_event) {
    const ae = reassignment.assigned_event;
    const ce = ae.created_event;
    events.push({
      eventType: 'assigned',
      contractId: ce?.contract_id ?? '',
      templateId: ce?.template_id
        ? {
            packageName: ce.package_name ?? ce.template_id.package_id ?? '',
            moduleName: ce.template_id.module_name ?? '',
            entityName: ce.template_id.entity_name ?? '',
          }
        : undefined,
      source: ae.source,
      target: ae.target,
      reassignmentId: ae.unassign_id,
    });
  }

  return {
    updateId: reassignment.update_id,
    updateType: 'reassignment',
    offset: reassignment.offset,
    recordTime: timestampToISO(reassignment.record_time),
    commandId: reassignment.command_id || undefined,
    workflowId: reassignment.workflow_id || undefined,
    traceContext: reassignment.trace_context
      ? { traceParent: reassignment.trace_context.traceparent, traceState: reassignment.trace_context.tracestate }
      : undefined,
    events,
  };
}

function mapTopologyToUpdate(topology: TopologyTransaction): LedgerUpdate {
  return {
    updateId: topology.update_id,
    updateType: 'topology_transaction',
    offset: topology.offset,
    recordTime: timestampToISO(topology.record_time),
    traceContext: topology.trace_context
      ? { traceParent: topology.trace_context.traceparent, traceState: topology.trace_context.tracestate }
      : undefined,
    events: [],
  };
}

function mapOffsetCheckpointToUpdate(checkpoint: OffsetCheckpoint): LedgerUpdate {
  const recordTime =
    checkpoint.synchronizer_times?.[0]?.record_time
      ? timestampToISO(checkpoint.synchronizer_times[0].record_time)
      : new Date().toISOString();

  return {
    updateId: `checkpoint-${checkpoint.offset}`,
    updateType: 'offset_checkpoint',
    offset: checkpoint.offset,
    recordTime,
    events: [],
  };
}

// ============================================================
// Event Mapping
// ============================================================

function mapTreeEvents(
  flatEvents: TreeEvent[],
  eventsById?: Record<string, TreeEvent>,
): LedgerEvent[] {
  const events: LedgerEvent[] = [];

  // Handle flat event list (ACS_DELTA shape)
  for (const te of flatEvents) {
    const mapped = mapTreeEvent(te);
    if (mapped) events.push(mapped);
  }

  // Handle events_by_id map (LEDGER_EFFECTS shape)
  if (eventsById) {
    for (const te of Object.values(eventsById)) {
      const mapped = mapTreeEvent(te);
      if (mapped) events.push(mapped);
    }
  }

  return events;
}

function mapTreeEvent(te: TreeEvent): LedgerEvent | null {
  if (te.created) {
    const c = te.created;
    // Canton 3.4+: event_id may be absent; use offset or contract_id as fallback
    const eventId = c.event_id || (c as Record<string, unknown>).offset as string || `create:${c.contract_id}`;
    return {
      eventType: 'created',
      eventId,
      contractId: c.contract_id,
      templateId: {
        packageName: c.package_name ?? c.template_id?.package_id ?? '',
        moduleName: c.template_id?.module_name ?? '',
        entityName: c.template_id?.entity_name ?? '',
      },
      payload: c.create_arguments
        ? recordToPlain(c.create_arguments)
        : {},
      signatories: c.signatories ?? [],
      observers: c.observers ?? [],
      witnesses: c.witness_parties ?? [],
      contractKey: c.contract_key ? valueToObject(c.contract_key) as Record<string, unknown> : undefined,
    };
  }

  if (te.exercised) {
    const e = te.exercised;
    // Canton 3.4+: event_id may be absent
    const eventId = e.event_id || (e as Record<string, unknown>).offset as string || `exercise:${e.contract_id}:${e.choice}`;
    return {
      eventType: 'exercised',
      eventId,
      contractId: e.contract_id,
      templateId: {
        packageName: e.package_name ?? e.template_id?.package_id ?? '',
        moduleName: e.template_id?.module_name ?? '',
        entityName: e.template_id?.entity_name ?? '',
      },
      choice: e.choice,
      choiceArgument: e.choice_argument ? valueToObject(e.choice_argument) as Record<string, unknown> : {},
      actingParties: e.acting_parties ?? [],
      consuming: e.consuming ?? false,
      witnesses: e.witness_parties ?? [],
      childEventIds: e.child_event_ids ?? [],
      exerciseResult: e.exercise_result ? valueToObject(e.exercise_result) : undefined,
    };
  }

  if (te.archived) {
    const a = te.archived;
    // Canton 3.4+: event_id may be absent
    const eventId = a.event_id || (a as Record<string, unknown>).offset as string || `archive:${a.contract_id}`;
    return {
      eventType: 'archived',
      eventId,
      contractId: a.contract_id,
      templateId: {
        packageName: a.package_name ?? a.template_id?.package_id ?? '',
        moduleName: a.template_id?.module_name ?? '',
        entityName: a.template_id?.entity_name ?? '',
      },
      witnesses: a.witness_parties ?? [],
    };
  }

  return null;
}

function recordToPlain(record: { fields: Array<{ label: string; value: unknown }> }): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const field of record.fields ?? []) {
    result[field.label] = valueToObject(field.value);
  }
  return result;
}

// ============================================================
// Transaction Detail Mapping
// ============================================================

function mapTransactionToDetail(tx: Transaction): TransactionDetail {
  const eventsById: Record<string, LedgerEvent> = {};
  let rootEventIds: string[] = (tx.root_event_ids ?? []).filter(Boolean);

  // --- Phase 1: Map events from events_by_id (LEDGER_EFFECTS pre-3.4) ---
  // When events_by_id is populated, each entry already has a unique key and
  // exercise events have proper childEventIds. Just map them through.
  if (tx.events_by_id) {
    const entries = Array.isArray(tx.events_by_id)
      ? (tx.events_by_id as Array<{ key: string; value: TreeEvent }>).map(e => [e.key, e.value] as const)
      : Object.entries(tx.events_by_id);

    for (const [eventId, te] of entries) {
      if (!eventId || eventId === 'undefined') continue;
      const mapped = mapTreeEvent(te);
      if (mapped) {
        eventsById[eventId] = mapped;
      }
    }
  }

  // --- Phase 2: Map flat events (Canton 3.4+) ---
  // In Canton 3.4+, tx.events is a flat array where multiple events can share
  // the same event_id (typically the offset). Exercise events have empty
  // childEventIds. We need to:
  //   1. Assign unique synthetic IDs to avoid map collisions.
  //   2. Reconstruct parent-child relationships (exercise → its creates/archives).
  const flatEvents = tx.events ?? [];
  if (flatEvents.length > 0) {
    // Check if event_ids collide (Canton 3.4+ behavior)
    type TreeLedgerEvent = LedgerEvent & { eventId: string };
    const mappedFlat: Array<{ syntheticId: string; event: TreeLedgerEvent }> = [];
    const seenIds = new Set<string>();
    let hasCollisions = false;

    for (let i = 0; i < flatEvents.length; i++) {
      const te = flatEvents[i];
      if (!te) continue;
      const mapped = mapTreeEvent(te);
      if (!mapped || !('eventId' in mapped)) continue;
      const treeEvent = mapped as TreeLedgerEvent;
      if (seenIds.has(treeEvent.eventId)) hasCollisions = true;
      seenIds.add(treeEvent.eventId);
      // Create a unique synthetic ID: baseEventId + suffix for disambiguation
      const syntheticId = hasCollisions || seenIds.size < i + 1
        ? `${treeEvent.eventId}:${treeEvent.eventType}:${i}`
        : treeEvent.eventId;
      mappedFlat.push({ syntheticId, event: treeEvent });
    }

    if (hasCollisions) {
      // Reconstruct tree: exercises claim subsequent non-exercise events as children.
      // Strategy: walk the flat list; each exercise node "owns" the create/archive
      // events that follow it until the next exercise or end of list.
      // This mirrors Canton's flat serialization order: exercise, then its children.

      // First, assign synthetic IDs and populate eventsById
      for (const { syntheticId, event } of mappedFlat) {
        // Update the event's eventId to the synthetic one for consistent referencing
        event.eventId = syntheticId;
        eventsById[syntheticId] = event;
      }

      // Reconstruct parent-child using DFS pre-order property.
      // Canton emits events in DFS pre-order: exercise first, then all its
      // descendants (which may include nested exercises). We use a stack where
      // every event is a child of the current top-of-stack exercise.
      // Exercises get pushed onto the stack; leaf events (create/archive) are
      // children of the top exercise but don't get pushed.
      const exerciseStack: string[] = [];
      const childOf = new Map<string, string>(); // childId → parentExerciseId

      for (const { syntheticId, event } of mappedFlat) {
        if (exerciseStack.length > 0) {
          // This event (exercise or leaf) is a child of the current top exercise
          const parentId = exerciseStack[exerciseStack.length - 1]!;
          childOf.set(syntheticId, parentId);
          const parent = eventsById[parentId]!;
          if (parent.eventType === 'exercised') {
            parent.childEventIds.push(syntheticId);
          }
        }
        // Push exercises onto the stack so they can collect their own children
        if (event.eventType === 'exercised') {
          exerciseStack.push(syntheticId);
        }
      }

      // Root events: those not claimed as children
      const childIds = new Set(childOf.keys());
      rootEventIds = mappedFlat
        .map(e => e.syntheticId)
        .filter(id => !childIds.has(id));
    } else {
      // No collisions: events have unique IDs, use them directly
      for (const { syntheticId, event } of mappedFlat) {
        if (!eventsById[syntheticId]) {
          eventsById[syntheticId] = event;
        }
        if (!rootEventIds.includes(syntheticId)) {
          rootEventIds.push(syntheticId);
        }
      }
    }
  }

  // Compute state diff
  const stateDiff = computeStateDiff(eventsById);

  return {
    updateId: tx.update_id,
    commandId: tx.command_id || undefined,
    workflowId: tx.workflow_id || undefined,
    offset: tx.offset,
    recordTime: timestampToISO(tx.record_time),
    effectiveAt: timestampToISO(tx.effective_at),
    traceContext: tx.trace_context
      ? { traceParent: tx.trace_context.traceparent, traceState: tx.trace_context.tracestate }
      : undefined,
    rootEventIds,
    eventsById,
    stateDiff,
  };
}

/**
 * Compute state diff from a transaction's events.
 * Inputs = contracts consumed (exercised with consuming=true or archived).
 * Outputs = contracts created.
 */
function computeStateDiff(eventsById: Record<string, LedgerEvent>): StateDiff {
  const inputs: ActiveContract[] = [];
  const outputs: ActiveContract[] = [];

  for (const event of Object.values(eventsById)) {
    if (event.eventType === 'created') {
      outputs.push({
        contractId: event.contractId,
        templateId: event.templateId,
        payload: event.payload,
        signatories: event.signatories,
        observers: event.observers,
        createdAt: '',
      });
    } else if (event.eventType === 'archived') {
      inputs.push({
        contractId: event.contractId,
        templateId: event.templateId,
        payload: {},
        signatories: [],
        observers: [],
        createdAt: '',
      });
    } else if (event.eventType === 'exercised' && event.consuming) {
      inputs.push({
        contractId: event.contractId,
        templateId: event.templateId,
        payload: {},
        signatories: [],
        observers: [],
        createdAt: '',
      });
    }
  }

  const netChange = `${outputs.length} created, ${inputs.length} consumed`;

  return { inputs, outputs, netChange };
}

export { mapTransactionToDetail, mapGetUpdatesResponse, computeStateDiff };
