/**
 * StateService wrapper — GetActiveContracts, GetLedgerEnd
 *
 * CRITICAL: In Canton 3.4+, the GetActiveContracts request uses `event_format`
 * instead of the old `filter`/`verbose` fields (which are now reserved).
 * The `active_at_offset` field is an int64 (sent as string via proto-loader).
 */

import type * as grpc from '@grpc/grpc-js';
import type {
  GetActiveContractsResponse,
  GetLedgerEndResponse,
  CreatedEvent,
} from '../proto/types.js';
import { createMetadata, makeUnaryCall, makeServerStreamCall, collectStream, buildTransactionFilter, timestampToISO } from './shared.js';
import type { ActiveContract, TemplateId } from '../../types.js';

export class StateServiceClient {
  constructor(
    private readonly client: grpc.Client,
    private readonly getToken: () => string | null,
  ) {}

  /**
   * Get the current ledger end offset.
   * Must be called before any ACS query to obtain a valid active_at_offset.
   */
  async getLedgerEnd(): Promise<string> {
    const metadata = createMetadata(this.getToken());
    const response = await makeUnaryCall<object, GetLedgerEndResponse>(
      this.client,
      'GetLedgerEnd',
      {},
      metadata,
    );
    return response.offset;
  }

  /**
   * Get active contracts at a specific offset.
   *
   * @param activeAtOffset - REQUIRED. The offset at which to snapshot the ACS (int64 as string).
   * @param parties - Parties whose contracts to query.
   * @param templateFilter - Optional template filter for server-side filtering.
   * @param verbose - Whether to include verbose field names in the response.
   */
  async getActiveContracts(
    activeAtOffset: string,
    parties: string[],
    templateFilter?: TemplateId[],
    verbose = true,
  ): Promise<{ contracts: ActiveContract[]; offset: string }> {
    if (!activeAtOffset) {
      throw new Error('active_at_offset is REQUIRED. Call getLedgerEnd() first.');
    }

    const metadata = createMetadata(this.getToken());
    const filter = buildTransactionFilter(parties, templateFilter);

    // Canton 3.4+ API: GetActiveContractsRequest uses event_format, not filter/verbose.
    // The old filter/verbose fields are reserved and must not be sent.
    const request = {
      active_at_offset: activeAtOffset,
      event_format: {
        filters_by_party: filter.filters_by_party,
        verbose,
      },
    };

    const stream = makeServerStreamCall(this.client, 'GetActiveContracts', request, metadata);
    const responses = await collectStream<GetActiveContractsResponse>(stream);

    const contracts: ActiveContract[] = [];

    for (const resp of responses) {
      if (resp.active_contract?.created_event) {
        contracts.push(mapCreatedEventToActiveContract(resp.active_contract.created_event));
      }
    }

    // In Canton 3.4+, GetActiveContractsResponse no longer has an offset field.
    // The active_at_offset from the request is the snapshot offset.
    return { contracts, offset: activeAtOffset };
  }
}

/**
 * Map a Canton CreatedEvent protobuf to our ActiveContract type.
 *
 * NOTE: In Canton 3.4+, `created_at` is a google.protobuf.Timestamp (with seconds/nanos),
 * not a plain string offset. We normalize it to ISO string.
 */
function mapCreatedEventToActiveContract(event: CreatedEvent): ActiveContract {
  // created_at may be a Timestamp object, a string, or a numeric offset depending on Canton version.
  // Our improved timestampToISO handles all formats.
  const createdAt = event.created_at
    ? timestampToISO(event.created_at as unknown as { seconds: string; nanos: number } | string)
    : '';

  return {
    contractId: event.contract_id,
    templateId: {
      packageName: event.package_name ?? event.template_id?.package_id ?? '',
      moduleName: event.template_id?.module_name ?? '',
      entityName: event.template_id?.entity_name ?? '',
    },
    payload: recordToObject(event.create_arguments),
    signatories: event.signatories ?? [],
    observers: event.observers ?? [],
    createdAt,
    contractKey: event.contract_key ? valueToObject(event.contract_key) as Record<string, unknown> : undefined,
  };
}

/**
 * Convert a protobuf Record_ to a plain JS object.
 */
function recordToObject(record: { fields: Array<{ label: string; value: unknown }> } | undefined): Record<string, unknown> {
  if (!record?.fields) return {};
  const result: Record<string, unknown> = {};
  for (const field of record.fields) {
    result[field.label] = valueToObject(field.value as Record<string, unknown>);
  }
  return result;
}

/**
 * Convert a protobuf Value to a plain JS value.
 */
function valueToObject(value: unknown): unknown {
  if (!value || typeof value !== 'object') return value;
  const v = value as Record<string, unknown>;

  if (v.record) return recordToObject(v.record as { fields: Array<{ label: string; value: unknown }> });
  if (v.variant) {
    const variant = v.variant as { constructor: string; value: unknown };
    return { tag: variant.constructor, value: valueToObject(variant.value) };
  }
  if (v.list) {
    const list = v.list as { elements: unknown[] };
    return (list.elements ?? []).map(valueToObject);
  }
  if (v.text_map) {
    const map = v.text_map as { entries: Array<{ key: string; value: unknown }> };
    const obj: Record<string, unknown> = {};
    for (const entry of map.entries ?? []) {
      obj[entry.key] = valueToObject(entry.value);
    }
    return obj;
  }
  if (v.optional) {
    const opt = v.optional as { value?: unknown };
    return opt.value ? valueToObject(opt.value) : null;
  }
  if (v.contract_id !== undefined) return v.contract_id;
  if (v.int64 !== undefined) return v.int64;
  if (v.numeric !== undefined) return v.numeric;
  if (v.text !== undefined) return v.text;
  if (v.timestamp !== undefined) return v.timestamp;
  if (v.party !== undefined) return v.party;
  if (v.bool !== undefined) return v.bool;
  if (v.date !== undefined) return v.date;
  if (v.unit !== undefined) return {};
  if (v.enum) {
    const e = v.enum as { constructor: string };
    return e.constructor;
  }
  if (v.gen_map) {
    const gmap = v.gen_map as { entries: Array<{ key: unknown; value: unknown }> };
    return (gmap.entries ?? []).map((entry) => ({
      key: valueToObject(entry.key),
      value: valueToObject(entry.value),
    }));
  }

  return value;
}

export { mapCreatedEventToActiveContract, recordToObject, valueToObject };
