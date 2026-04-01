/**
 * EventQueryService wrapper — GetEventsByContractId
 *
 * CRITICAL: Returns Created + optional Archived WRAPPER messages.
 * Does NOT return ExercisedEvent — for exercise details, use UpdateService.GetUpdateById
 * with LEDGER_EFFECTS shape.
 */

import type * as grpc from '@grpc/grpc-js';
import type {
  GetEventsByContractIdResponse,
} from '../proto/types.js';
import { createMetadata, makeUnaryCall, buildTransactionFilter } from './shared.js';
import type { CreatedEvent, ArchivedEvent } from '../../types.js';
import { valueToObject } from './state-service.js';

export interface ContractEvents {
  /** The creation event wrapper — always present if contract was visible. */
  created?: {
    event: CreatedEvent;
    synchronizerId: string;
    /** The offset at which this contract was created (from CreatedEvent.created_at). */
    createdAtOffset: string;
  };
  /** The archival event wrapper — present only if contract has been archived. */
  archived?: {
    event: ArchivedEvent;
    synchronizerId: string;
  };
}

export class EventQueryServiceClient {
  constructor(
    private readonly client: grpc.Client,
    private readonly getToken: () => string | null,
  ) {}

  /**
   * Get creation and optional archival events for a contract.
   *
   * NOTE: This does NOT return ExercisedEvent. For exercise details
   * (choice name, arguments, acting parties), use UpdateService.GetUpdateById
   * with the archiving transaction's update_id and LEDGER_EFFECTS shape.
   *
   * CANTON 3.4+: `requesting_parties` was removed and replaced by `event_format`.
   * The event_format must include filters_by_party to specify which parties' events to return.
   *
   * @param contractId - The contract ID to query.
   * @param requestingParties - Parties requesting the events (used in event_format filters).
   */
  async getEventsByContractId(
    contractId: string,
    requestingParties: string[],
  ): Promise<ContractEvents> {
    const metadata = createMetadata(this.getToken());
    const filter = buildTransactionFilter(requestingParties);

    // Canton 3.4+: requesting_parties is removed; use event_format instead
    const response = await makeUnaryCall<
      Record<string, unknown>,
      GetEventsByContractIdResponse
    >(
      this.client,
      'GetEventsByContractId',
      {
        contract_id: contractId,
        event_format: {
          filters_by_party: filter.filters_by_party,
          verbose: true,
        },
      },
      metadata,
    );

    return mapContractEvents(response);
  }
}

function mapContractEvents(response: GetEventsByContractIdResponse): ContractEvents {
  const result: ContractEvents = {};

  if (response.created?.created_event) {
    const ce = response.created.created_event;
    // Canton 3.4+: event_id may be absent; use offset or contract_id as fallback
    const createdEventId = ce.event_id || (ce as Record<string, unknown>).offset as string || `create:${ce.contract_id}`;
    result.created = {
      event: {
        eventType: 'created',
        eventId: createdEventId,
        contractId: ce.contract_id,
        templateId: {
          packageName: ce.package_name ?? ce.template_id?.package_id ?? '',
          moduleName: ce.template_id?.module_name ?? '',
          entityName: ce.template_id?.entity_name ?? '',
        },
        payload: ce.create_arguments
          ? recordToPlain(ce.create_arguments)
          : {},
        signatories: ce.signatories ?? [],
        observers: ce.observers ?? [],
        witnesses: ce.witness_parties ?? [],
        contractKey: ce.contract_key
          ? (valueToObject(ce.contract_key) as Record<string, unknown>)
          : undefined,
      },
      synchronizerId: response.created.synchronizer_id ?? '',
      createdAtOffset: ce.created_at ?? '',
    };
  }

  if (response.archived?.archived_event) {
    const ae = response.archived.archived_event;
    // Canton 3.4+: event_id may be absent
    const archivedEventId = ae.event_id || (ae as Record<string, unknown>).offset as string || `archive:${ae.contract_id}`;
    result.archived = {
      event: {
        eventType: 'archived',
        eventId: archivedEventId,
        contractId: ae.contract_id,
        templateId: {
          packageName: ae.package_name ?? ae.template_id?.package_id ?? '',
          moduleName: ae.template_id?.module_name ?? '',
          entityName: ae.template_id?.entity_name ?? '',
        },
        witnesses: ae.witness_parties ?? [],
      },
      synchronizerId: response.archived.synchronizer_id ?? '',
    };
  }

  return result;
}

function recordToPlain(record: { fields: Array<{ label: string; value: unknown }> }): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const field of record.fields ?? []) {
    result[field.label] = valueToObject(field.value);
  }
  return result;
}
