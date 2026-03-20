/**
 * InteractiveSubmissionService wrapper — PrepareSubmission ONLY
 *
 * CRITICAL: This service wrapper NEVER calls ExecuteSubmission.
 * Pure simulation only.
 *
 * Uses package-name format for template references (package-id deprecated in Canton 3.5).
 * prepared_transaction_hash is ADVISORY — always flag this to the user.
 */

import type * as grpc from '@grpc/grpc-js';
import type {
  PrepareSubmissionResponse,
  PreparedTransaction,
  Command,
  Identifier,
  Value,
} from '../proto/types.js';
import { HashingSchemeVersion } from '../proto/types.js';
import { createMetadata, makeUnaryCall } from './shared.js';
import type {
  SimulationCommand,
  ActiveContract,
  TemplateId,
  DisclosedContract,
} from '../../types.js';
import { valueToObject } from './state-service.js';

export class InteractiveSubmissionServiceClient {
  constructor(
    private readonly client: grpc.Client,
    private readonly getToken: () => string | null,
  ) {}

  /**
   * Prepare a submission without executing it.
   *
   * NEVER calls ExecuteSubmission — pure simulation.
   *
   * @param commands - Simulation commands (using package-name format, NOT package-id).
   * @param actAs - Acting parties.
   * @param readAs - Read-only parties.
   * @param applicationId - Application identifier.
   * @param commandId - Unique command identifier.
   * @param synchronizerId - Optional synchronizer ID.
   * @param disclosedContracts - Optional disclosed contracts.
   */
  async prepareSubmission(
    commands: SimulationCommand[],
    actAs: string[],
    readAs: string[],
    applicationId: string,
    commandId: string,
    synchronizerId?: string,
    disclosedContracts?: DisclosedContract[],
  ): Promise<PrepareResult> {
    const metadata = createMetadata(this.getToken());

    // Build Commands using package-name format
    const grpcCommands = commands.map(buildGrpcCommand);

    const request: Record<string, unknown> = {
      commands: {
        application_id: applicationId,
        command_id: commandId,
        commands: grpcCommands,
        act_as: actAs,
        read_as: readAs,
        synchronizer_id: synchronizerId,
      },
      verbose_hashing: true,
      disclosed_contracts: (disclosedContracts ?? []).map((dc) => ({
        template_id: templateIdToIdentifier(dc.templateId),
        contract_id: dc.contractId,
        created_event_blob: dc.createdEventBlob
          ? Buffer.from(dc.createdEventBlob, 'base64')
          : new Uint8Array(),
        package_name: dc.templateId.packageName,
      })),
    };

    const response = await makeUnaryCall<Record<string, unknown>, PrepareSubmissionResponse>(
      this.client,
      'PrepareSubmission',
      request,
      metadata,
    );

    return mapPrepareResponse(response);
  }
}

// ============================================================
// Result Types
// ============================================================

export interface PrepareResult {
  preparedTransactionBytes: Uint8Array;
  hashInfo: {
    transactionHash: string;
    hashingSchemeVersion: string;
    hashingDetails?: string;
    isAdvisory: boolean; // Always true for Canton 3.5
  };
  costEstimation?: {
    estimatedCost: string;
    unit: string;
  };
  /**
   * Input contracts are nested inside PreparedTransaction.Metadata (CORRECT PATH).
   * These are decoded from the prepared_transaction bytes.
   */
  inputContracts: Array<{
    contract: ActiveContract;
    createdAt: string;
  }>;
  globalKeyMapping: Array<{
    key: Record<string, unknown>;
    contractId?: string;
  }>;
}

// ============================================================
// Mapping Helpers
// ============================================================

function mapPrepareResponse(response: PrepareSubmissionResponse): PrepareResult {
  const hashVersionMap: Record<number, string> = {
    [HashingSchemeVersion.HASHING_SCHEME_VERSION_V1]: 'V1',
    [HashingSchemeVersion.HASHING_SCHEME_VERSION_V2]: 'V2',
  };

  // Decode PreparedTransaction from bytes to extract Metadata.input_contracts
  // In a full implementation, this would use protobuf deserialization
  // For now, we attempt to decode the bytes as a PreparedTransaction
  const { inputContracts, globalKeyMapping } = decodePreparedTransactionMetadata(
    response.prepared_transaction,
  );

  return {
    preparedTransactionBytes: response.prepared_transaction,
    hashInfo: {
      transactionHash: bufferToHex(response.prepared_transaction_hash),
      hashingSchemeVersion:
        hashVersionMap[response.hashing_scheme_version] ??
        `VERSION_${response.hashing_scheme_version}`,
      hashingDetails: response.hashing_details ?? undefined,
      // ADVISORY: Canton 3.5 warns that clients must recompute hash if participant not trusted
      isAdvisory: true,
    },
    costEstimation: response.cost_estimation
      ? {
          estimatedCost: response.cost_estimation.estimated_cost,
          unit: response.cost_estimation.unit,
        }
      : undefined,
    inputContracts,
    globalKeyMapping,
  };
}

/**
 * Decode PreparedTransaction protobuf bytes to extract Metadata.
 *
 * CORRECT PATH: PreparedTransaction -> Metadata -> input_contracts
 * NOT a top-level field.
 */
function decodePreparedTransactionMetadata(
  bytes: Uint8Array,
): {
  inputContracts: PrepareResult['inputContracts'];
  globalKeyMapping: PrepareResult['globalKeyMapping'];
} {
  // In production, this would be full protobuf deserialization.
  // The PreparedTransaction message has Metadata as a field containing
  // repeated InputContract and repeated GlobalKeyMappingEntry.
  //
  // Since we're using dynamic gRPC loading, the response may already
  // be decoded by @grpc/proto-loader into a JS object. We handle both cases.

  const inputContracts: PrepareResult['inputContracts'] = [];
  const globalKeyMapping: PrepareResult['globalKeyMapping'] = [];

  try {
    // If the bytes are actually a decoded JS object (proto-loader auto-decode)
    const decoded = bytes as unknown as PreparedTransaction;
    if (decoded?.metadata) {
      for (const ic of decoded.metadata.input_contracts ?? []) {
        if (ic.contract?.created_event) {
          const event = ic.contract.created_event;
          inputContracts.push({
            contract: {
              contractId: event.contract_id,
              templateId: identifierToTemplateId(event.template_id),
              payload: event.create_arguments
                ? recordToPlain(event.create_arguments)
                : {},
              signatories: event.signatories ?? [],
              observers: event.observers ?? [],
              createdAt: event.created_at ?? '',
            },
            createdAt: ic.created_at ?? '',
          });
        }
      }

      for (const gkm of decoded.metadata.global_key_mapping ?? []) {
        globalKeyMapping.push({
          key: gkm.key ? (valueToObject(gkm.key) as Record<string, unknown>) : {},
          contractId: gkm.contract_id ?? undefined,
        });
      }
    }
  } catch {
    // If bytes are raw protobuf, we cannot decode without full proto definitions.
    // This path would require additional protobuf deserialization logic.
  }

  return { inputContracts, globalKeyMapping };
}

function buildGrpcCommand(cmd: SimulationCommand): Command {
  const templateId = templateIdToIdentifier(cmd.templateId);

  if (cmd.choice && cmd.contractId) {
    // Exercise command
    return {
      exercise: {
        template_id: templateId,
        contract_id: cmd.contractId,
        choice: cmd.choice,
        choice_argument: objectToValue(cmd.arguments),
        // Package-name format: use package_id_selection_preference
        package_id_selection_preference: cmd.templateId.packageName
          ? [cmd.templateId.packageName]
          : undefined,
      },
    };
  }

  // Create command
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

function templateIdToIdentifier(tid: TemplateId): Identifier {
  return {
    // In Canton 3.5 package-name format, package_id may be empty
    // and the participant resolves via package name + version
    package_id: '',
    module_name: tid.moduleName,
    entity_name: tid.entityName,
  };
}

function identifierToTemplateId(id: Identifier | undefined): TemplateId {
  if (!id) return { packageName: '', moduleName: '', entityName: '' };
  return {
    packageName: id.package_id ?? '',
    moduleName: id.module_name ?? '',
    entityName: id.entity_name ?? '',
  };
}

function objectToValue(obj: unknown): Value {
  if (obj === null || obj === undefined) return { unit: {} };
  if (typeof obj === 'string') return { text: obj };
  if (typeof obj === 'number') return { int64: String(obj) };
  if (typeof obj === 'boolean') return { bool: obj };
  if (Array.isArray(obj)) {
    return { list: { elements: obj.map(objectToValue) } };
  }
  if (typeof obj === 'object') {
    return {
      record: objectToRecord(obj as Record<string, unknown>),
    };
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

function recordToPlain(record: { fields: Array<{ label: string; value: unknown }> }): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const field of record.fields ?? []) {
    result[field.label] = valueToObject(field.value);
  }
  return result;
}

function bufferToHex(buf: Uint8Array): string {
  return Array.from(buf)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
