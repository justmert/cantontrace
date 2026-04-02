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
import type * as protoLoader from '@grpc/proto-loader';
import protobuf from 'protobufjs';
import descriptor from 'protobufjs/ext/descriptor/index.js';
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
  private protobufRoot: protobuf.Root | null = null;

  constructor(
    private readonly client: grpc.Client,
    private readonly getToken: () => string | null,
    private readonly packageDefinition?: protoLoader.PackageDefinition,
  ) {
    // Build a protobufjs Root from the package definition's FileDescriptorProtos
    // so we can properly decode PreparedTransaction bytes
    if (packageDefinition) {
      try {
        const allFdProtos = new Set<Buffer>();
        for (const entry of Object.values(packageDefinition) as Array<{ fileDescriptorProtos?: Buffer[] }>) {
          if (entry.fileDescriptorProtos) {
            for (const fd of entry.fileDescriptorProtos) {
              allFdProtos.add(fd);
            }
          }
        }
        if (allFdProtos.size > 0) {
          const decodedFiles = [...allFdProtos].map(buf =>
            descriptor.FileDescriptorProto.decode(buf)
          );
          const fdsMessage = descriptor.FileDescriptorSet.create({ file: decodedFiles });
          this.protobufRoot = (protobuf.Root as unknown as { fromDescriptor(desc: unknown): protobuf.Root }).fromDescriptor(fdsMessage);
          this.protobufRoot.resolveAll();
          // protobufjs Root built for PreparedTransaction decoding
        }
      } catch (err) {
        console.warn('Failed to build protobufjs Root for PreparedTransaction decoding:', err);
      }
    }
  }

  /**
   * Prepare a submission without executing it.
   *
   * NEVER calls ExecuteSubmission — pure simulation.
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

    const grpcCommands = commands.map(buildGrpcCommand);

    // Canton 3.4: PrepareSubmissionRequest has flat fields (not nested Commands message)
    const request: Record<string, unknown> = {
      user_id: applicationId,
      command_id: commandId,
      commands: grpcCommands,
      act_as: actAs,
      read_as: readAs,
      synchronizer_id: synchronizerId || undefined,
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

    return this.mapPrepareResponse(response);
  }

  // ============================================================
  // Response Mapping
  // ============================================================

  private mapPrepareResponse(response: PrepareSubmissionResponse): PrepareResult {
    const hashVersionMap: Record<number, string> = {
      [HashingSchemeVersion.HASHING_SCHEME_VERSION_V1]: 'V1',
      [HashingSchemeVersion.HASHING_SCHEME_VERSION_V2]: 'V2',
    };

    // Decode PreparedTransaction from bytes using real protobuf decoding
    const decoded = this.decodePreparedTransaction(response.prepared_transaction);
    const { inputContracts, globalKeyMapping } = decoded
      ? extractMetadata(decoded)
      : { inputContracts: [] as PrepareResult['inputContracts'], globalKeyMapping: [] as PrepareResult['globalKeyMapping'] };

    return {
      preparedTransactionBytes: response.prepared_transaction,
      hashInfo: {
        transactionHash: bufferToHex(response.prepared_transaction_hash),
        hashingSchemeVersion:
          hashVersionMap[response.hashing_scheme_version] ??
          `VERSION_${response.hashing_scheme_version}`,
        hashingDetails: response.hashing_details ?? undefined,
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
   * Decode prepared_transaction protobuf bytes using the packageDefinition
   * loaded from Canton's gRPC server reflection.
   *
   * The packageDefinition maps fully-qualified message names to definitions.
   * Each definition has a protobufjs `type` with .decode() method.
   */
  /**
   * Decode prepared_transaction protobuf bytes using the protobufjs Root
   * built from Canton's server reflection descriptors.
   */
  private decodePreparedTransaction(bytes: Uint8Array): PreparedTransaction | null {
    if (!bytes || bytes.length === 0) return null;

    // Use the protobufjs Root for proper binary protobuf decoding
    if (this.protobufRoot) {
      try {
        const PreparedTransactionType = this.protobufRoot.lookupType(
          'com.daml.ledger.api.v2.interactive.PreparedTransaction'
        );
        const message = PreparedTransactionType.decode(
          bytes instanceof Buffer ? new Uint8Array(bytes) : bytes
        );
        const obj = PreparedTransactionType.toObject(message, {
          longs: String,
          enums: String,
          defaults: true,
          arrays: true,
          objects: true,
        }) as unknown as PreparedTransaction;
        // protobufjs decode succeeded
        if (obj?.metadata) return obj;
      } catch (err) {
        console.warn('PreparedTransaction protobuf decode failed:', (err as Error).message);
      }
    }

    // Last attempt: bytes might already be auto-decoded by proto-loader
    try {
      const maybeDecoded = bytes as unknown as PreparedTransaction;
      if (maybeDecoded?.metadata?.input_contracts) return maybeDecoded;
    } catch {
      // Not auto-decoded
    }

    return null;
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
    isAdvisory: boolean;
  };
  costEstimation?: {
    estimatedCost: string;
    unit: string;
  };
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
// Metadata Extraction
// ============================================================

function extractMetadata(decoded: PreparedTransaction): {
  inputContracts: PrepareResult['inputContracts'];
  globalKeyMapping: PrepareResult['globalKeyMapping'];
} {
  const inputContracts: PrepareResult['inputContracts'] = [];
  const globalKeyMapping: PrepareResult['globalKeyMapping'] = [];

  if (decoded?.metadata) {
    for (const ic of decoded.metadata.input_contracts ?? []) {
      // Canton 3.4.11 wraps input contracts under a "v1" key
      const contractData = (ic as Record<string, unknown>).v1 as Record<string, unknown> | undefined;

      if (contractData) {
        // v1 format: { contract_id, package_name, template_id, argument: { record: { fields } }, signatories, stakeholders }
        const contractId = contractData.contract_id as string;
        const templateIdRaw = contractData.template_id as Identifier | undefined;
        const packageName = contractData.package_name as string | undefined;
        // argument has a "record" wrapper (protobuf oneof): argument.record.fields
        const argument = contractData.argument as Record<string, unknown> | undefined;
        const recordArg = (argument?.record ?? argument) as { fields?: Array<{ label: string; value: unknown }> } | undefined;
        const signatories = (contractData.signatories ?? []) as string[];
        // stakeholders = signatories + observers; extract observers as stakeholders - signatories
        const stakeholders = (contractData.stakeholders ?? []) as string[];
        const observers = stakeholders.filter(s => !signatories.includes(s));
        const createdAt = (contractData.created_at ?? (ic as Record<string, unknown>).created_at ?? '') as string;

        const payload = recordArg?.fields
          ? recordToPlain(recordArg as { fields: Array<{ label: string; value: unknown }> })
          : {};

        const templateId = templateIdRaw
          ? {
              packageName: packageName ?? templateIdRaw.package_id ?? '',
              moduleName: templateIdRaw.module_name ?? '',
              entityName: templateIdRaw.entity_name ?? '',
            }
          : { packageName: packageName ?? '', moduleName: '', entityName: '' };

        inputContracts.push({
          contract: {
            contractId,
            templateId,
            payload,
            signatories,
            observers,
            createdAt,
          },
          createdAt,
        });
      } else if ((ic as Record<string, unknown>).contract) {
        // Legacy format: { contract: { created_event: { ... } } }
        const legacyContract = (ic as Record<string, unknown>).contract as Record<string, unknown>;
        const event = legacyContract.created_event as Record<string, unknown> | undefined;
        if (event) {
          inputContracts.push({
            contract: {
              contractId: event.contract_id as string,
              templateId: identifierToTemplateId(event.template_id as Identifier | undefined),
              payload: event.create_arguments
                ? recordToPlain(event.create_arguments as { fields: Array<{ label: string; value: unknown }> })
                : {},
              signatories: (event.signatories ?? []) as string[],
              observers: (event.observers ?? []) as string[],
              createdAt: (event.created_at ?? '') as string,
            },
            createdAt: ((ic as Record<string, unknown>).created_at ?? '') as string,
          });
        }
      }
    }

    for (const gkm of decoded.metadata.global_key_mapping ?? []) {
      const gkmObj = gkm as Record<string, unknown>;
      globalKeyMapping.push({
        key: gkmObj.key ? (valueToObject(gkmObj.key) as Record<string, unknown>) : {},
        contractId: (gkmObj.contract_id as string) ?? undefined,
      });
    }
  }

  return { inputContracts, globalKeyMapping };
}

// ============================================================
// Command Building
// ============================================================

function buildGrpcCommand(cmd: SimulationCommand): Command {
  const templateId = templateIdToIdentifier(cmd.templateId);

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

// ============================================================
// Proto ↔ JS Conversion
// ============================================================

function templateIdToIdentifier(tid: TemplateId): Identifier {
  return {
    package_id: tid.packageName || '',
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
