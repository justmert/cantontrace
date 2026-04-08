/**
 * CommandService wrapper — SubmitAndWaitForTransaction
 *
 * The standard command submission path. Unlike InteractiveSubmissionService,
 * CommandService does NOT require JWT auth claims in sandbox mode — it reads
 * user_id directly from the Commands message.
 */

import type * as grpc from '@grpc/grpc-js';
import { createMetadata, makeUnaryCall } from './shared.js';
import { valueToObject } from './state-service.js';
import type {
  SimulationCommand,
  TemplateId,
  DisclosedContract,
  ActiveContract,
  TransactionDetail,
  LedgerEvent,
} from '../../types.js';

interface Identifier {
  package_id: string;
  module_name: string;
  entity_name: string;
}

interface Value {
  record?: { fields: Array<{ label: string; value: unknown }> };
  text?: string;
  int64?: string;
  numeric?: string;
  bool?: boolean;
  party?: string;
  unit?: Record<string, never>;
  list?: { elements: unknown[] };
  [key: string]: unknown;
}

interface SubmitAndWaitForTransactionResponse {
  transaction?: {
    update_id?: string;
    command_id?: string;
    workflow_id?: string;
    effective_at?: { seconds?: string; nanos?: number } | string;
    record_time?: { seconds?: string; nanos?: number } | string;
    events?: Array<{
      created?: RawCreatedEvent;
      archived?: RawArchivedEvent;
      exercised?: RawExercisedEvent;
    }>;
    offset?: string | number;
    synchronizer_id?: string;
  };
}

interface RawCreatedEvent {
  event_id?: string;
  contract_id?: string;
  template_id?: Identifier;
  create_arguments?: { fields?: Array<{ label: string; value: unknown }> };
  signatories?: string[];
  observers?: string[];
  package_name?: string;
}

interface RawArchivedEvent {
  event_id?: string;
  contract_id?: string;
  template_id?: Identifier;
  package_name?: string;
}

interface RawExercisedEvent {
  event_id?: string;
  contract_id?: string;
  template_id?: Identifier;
  choice?: string;
  choice_argument?: unknown;
  acting_parties?: string[];
  consuming?: boolean;
  child_event_ids?: string[];
  exercise_result?: unknown;
  package_name?: string;
}

export interface CommandSubmitResult {
  updateId: string;
  completionOffset: string;
  transactionTree: TransactionDetail;
}

export class CommandServiceClient {
  constructor(
    private readonly client: grpc.Client,
    private readonly getToken: () => string | null,
  ) {}

  /**
   * Submit commands and wait for the committed transaction.
   *
   * Uses CommandService.SubmitAndWaitForTransaction which:
   * - Accepts user_id in the request (no JWT claims needed)
   * - Returns the flat transaction with all events
   * - Is synchronous (blocks until committed or failed)
   */
  async submitAndWait(
    commands: SimulationCommand[],
    actAs: string[],
    readAs: string[],
    userId: string,
    commandId: string,
    synchronizerId?: string,
    disclosedContracts?: DisclosedContract[],
  ): Promise<CommandSubmitResult> {
    const metadata = createMetadata(this.getToken());

    const grpcCommands = commands.map(buildGrpcCommand);

    const request: Record<string, unknown> = {
      commands: {
        user_id: userId,
        command_id: commandId,
        commands: grpcCommands,
        act_as: actAs,
        read_as: readAs,
        synchronizer_id: synchronizerId || undefined,
        submission_id: `sub-${commandId}`,
        disclosed_contracts: (disclosedContracts ?? []).map((dc) => ({
          template_id: {
            package_id: dc.templateId.packageName || '',
            module_name: dc.templateId.moduleName,
            entity_name: dc.templateId.entityName,
          },
          contract_id: dc.contractId,
          created_event_blob: dc.createdEventBlob
            ? Buffer.from(dc.createdEventBlob, 'base64')
            : new Uint8Array(),
          package_name: dc.templateId.packageName,
        })),
      },
      transaction_format: {
        event_format: {
          filters_for_any_party: {
            cumulative: [{
              wildcard_filter: {
                include_created_event_blob: false,
              },
            }],
          },
          verbose: true,
        },
        // LEDGER_EFFECTS gives us exercised + created + archived events
        transaction_shape: 'TRANSACTION_SHAPE_LEDGER_EFFECTS',
      },
    };

    const response = await makeUnaryCall<
      Record<string, unknown>,
      SubmitAndWaitForTransactionResponse
    >(
      this.client,
      'SubmitAndWaitForTransaction',
      request,
      metadata,
    );

    return this.mapResponse(response);
  }

  private mapResponse(response: SubmitAndWaitForTransactionResponse): CommandSubmitResult {
    const tx = response.transaction;
    if (!tx) {
      throw new Error('No transaction in SubmitAndWaitForTransaction response');
    }

    const updateId = tx.update_id ?? '';
    const offset = typeof tx.offset === 'number' ? String(tx.offset) : tx.offset ?? '';
    const recordTime = timestampToISO(tx.record_time);
    const effectiveAt = timestampToISO(tx.effective_at);

    // Map flat events to our TransactionDetail format
    const eventsById: Record<string, LedgerEvent> = {};
    const rootEventIds: string[] = [];
    const inputs: ActiveContract[] = [];
    const outputs: ActiveContract[] = [];

    for (const rawEvent of tx.events ?? []) {
      if (rawEvent.created) {
        const ce = rawEvent.created;
        const eventId = ce.event_id ?? `create-${ce.contract_id}`;
        const templateId = identifierToTemplateId(ce.template_id, ce.package_name);
        const payload = ce.create_arguments?.fields
          ? recordToPlain(ce.create_arguments as { fields: Array<{ label: string; value: unknown }> })
          : {};

        eventsById[eventId] = {
          eventType: 'created',
          eventId,
          contractId: ce.contract_id ?? '',
          templateId,
          payload,
          signatories: ce.signatories ?? [],
          observers: ce.observers ?? [],
          witnesses: ce.signatories ?? [],
        };
        rootEventIds.push(eventId);
        outputs.push({
          contractId: ce.contract_id ?? '',
          templateId,
          payload,
          signatories: ce.signatories ?? [],
          observers: ce.observers ?? [],
          createdAt: effectiveAt,
        });
      }

      if (rawEvent.archived) {
        const ae = rawEvent.archived;
        const eventId = ae.event_id ?? `archive-${ae.contract_id}`;
        const templateId = identifierToTemplateId(ae.template_id, ae.package_name);

        eventsById[eventId] = {
          eventType: 'archived',
          eventId,
          contractId: ae.contract_id ?? '',
          templateId,
          witnesses: [],
        } as LedgerEvent;
        rootEventIds.push(eventId);
      }

      if (rawEvent.exercised) {
        const ex = rawEvent.exercised;
        const eventId = ex.event_id ?? `exercise-${ex.contract_id}`;
        const templateId = identifierToTemplateId(ex.template_id, ex.package_name);

        eventsById[eventId] = {
          eventType: 'exercised',
          eventId,
          contractId: ex.contract_id ?? '',
          templateId,
          choice: ex.choice ?? '',
          choiceArgument: ex.choice_argument ? valueToObject(ex.choice_argument) as Record<string, unknown> : {},
          actingParties: ex.acting_parties ?? [],
          consuming: ex.consuming ?? false,
          witnesses: ex.acting_parties ?? [],
          childEventIds: ex.child_event_ids ?? [],
          exerciseResult: ex.exercise_result ? String(valueToObject(ex.exercise_result)) : undefined,
        };
        rootEventIds.push(eventId);
      }
    }

    const consumedCount = Object.values(eventsById).filter(e => e.eventType === 'archived').length;
    const createdCount = outputs.length;

    return {
      updateId,
      completionOffset: offset,
      transactionTree: {
        updateId,
        commandId: tx.command_id ?? '',
        workflowId: tx.workflow_id,
        offset,
        recordTime,
        effectiveAt,
        rootEventIds,
        eventsById,
        stateDiff: {
          inputs,
          outputs,
          netChange: `${consumedCount} consumed, ${createdCount} created`,
        },
      },
    };
  }
}

// ============================================================
// Command Building (same as interactive-submission-service)
// ============================================================

function buildGrpcCommand(cmd: SimulationCommand): Record<string, unknown> {
  const templateId: Identifier = {
    package_id: cmd.templateId.packageName || '',
    module_name: cmd.templateId.moduleName,
    entity_name: cmd.templateId.entityName,
  };

  if (cmd.choice && cmd.contractId) {
    return {
      exercise: {
        template_id: templateId,
        contract_id: cmd.contractId,
        choice: cmd.choice,
        choice_argument: objectToValue(cmd.arguments),
        package_id_selection_preference: cmd.templateId.packageName
          ? [cmd.templateId.packageName]
          : undefined,
      },
    };
  }

  return {
    create: {
      template_id: templateId,
      create_arguments: objectToRecord(cmd.arguments),
      package_id_selection_preference: cmd.templateId.packageName
        ? [cmd.templateId.packageName]
        : undefined,
    },
  };
}

function objectToValue(obj: unknown): Value {
  if (obj === null || obj === undefined) return { unit: {} };
  if (typeof obj === 'string') {
    if (obj.includes('::')) return { party: obj };
    if (/^-?\d+(\.\d+)?$/.test(obj)) return { numeric: obj };
    return { text: obj };
  }
  if (typeof obj === 'number') return { int64: String(obj) };
  if (typeof obj === 'boolean') return { bool: obj };
  if (Array.isArray(obj)) {
    return { list: { elements: obj.map(objectToValue) } };
  }
  if (typeof obj === 'object') {
    return { record: objectToRecord(obj as Record<string, unknown>) };
  }
  return { text: String(obj) };
}

function objectToRecord(obj: Record<string, unknown>): { fields: Array<{ label: string; value: Value }> } {
  return {
    fields: Object.entries(obj).map(([label, value]) => ({
      label,
      value: objectToValue(value),
    })),
  };
}

function identifierToTemplateId(id: Identifier | undefined, packageName?: string): TemplateId {
  if (!id) return { packageName: '', moduleName: '', entityName: '' };
  return {
    packageName: packageName ?? id.package_id ?? '',
    moduleName: id.module_name ?? '',
    entityName: id.entity_name ?? '',
  };
}

function recordToPlain(record: { fields: Array<{ label: string; value: unknown }> }): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const field of record.fields ?? []) {
    result[field.label] = valueToObject(field.value);
  }
  return result;
}

function timestampToISO(ts: { seconds?: string; nanos?: number } | string | undefined): string {
  if (!ts) return new Date().toISOString();
  if (typeof ts === 'string') return ts;
  const seconds = Number(ts.seconds ?? 0);
  const millis = seconds * 1000 + Math.floor((ts.nanos ?? 0) / 1_000_000);
  return new Date(millis).toISOString();
}
