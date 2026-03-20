/**
 * Canton 3.5 Error Category Mapping
 *
 * Maps all 11 Canton error categories to gRPC status codes.
 * Parses status.details trailing metadata to extract structured error payloads.
 *
 * CRITICAL: Never parse HUMAN_READABLE_MESSAGE — match on ERROR_CODE_ID and CATEGORY_ID only.
 */

import type { ErrorCategory, CommandError } from '../types.js';
import type { Status, Any } from './proto/types.js';

// ============================================================
// Error Category → gRPC Status Code Mapping
// ============================================================

export interface ErrorCategoryInfo {
  category: ErrorCategory;
  grpcCode: number;
  grpcCodeName: string;
  description: string;
  debuggerHandling: string;
}

export const ERROR_CATEGORIES: Record<ErrorCategory, ErrorCategoryInfo> = {
  InvalidIndependentOfSystemState: {
    category: 'InvalidIndependentOfSystemState',
    grpcCode: 3, // INVALID_ARGUMENT
    grpcCodeName: 'INVALID_ARGUMENT',
    description: 'Malformed command, unsupported LF version, empty key maintainers',
    debuggerHandling: 'Show syntax/format error, pinpoint malformed field',
  },
  AuthInterceptorInvalidAuthenticationCredentials: {
    category: 'AuthInterceptorInvalidAuthenticationCredentials',
    grpcCode: 7, // PERMISSION_DENIED
    grpcCodeName: 'PERMISSION_DENIED',
    description: 'Invalid/missing JWT, wrong audience, expired token',
    debuggerHandling: 'Show auth failure — Canton strips exact cause from API response for security; details only in server-side logs',
  },
  InvalidGivenCurrentSystemStateOther: {
    category: 'InvalidGivenCurrentSystemStateOther',
    grpcCode: 9, // FAILED_PRECONDITION
    grpcCodeName: 'FAILED_PRECONDITION',
    description: 'Mutable system state (packages, parties, deduplication) fails preconditions',
    debuggerHandling: 'Trigger ACS refresh, check if concurrent transaction altered state',
  },
  InvalidGivenCurrentSystemStateResourceMissing: {
    category: 'InvalidGivenCurrentSystemStateResourceMissing',
    grpcCode: 5, // NOT_FOUND
    grpcCodeName: 'NOT_FOUND',
    description: 'Contract/party/package not found',
    debuggerHandling: 'Link to Contract Lifecycle Tracker to show when/how resource was removed',
  },
  InvalidGivenCurrentSystemStateResourceExists: {
    category: 'InvalidGivenCurrentSystemStateResourceExists',
    grpcCode: 6, // ALREADY_EXISTS
    grpcCodeName: 'ALREADY_EXISTS',
    description: 'Duplicate command, duplicate contract key',
    debuggerHandling: 'Show deduplication status, link to existing resource',
  },
  ContentionOnSharedResources: {
    category: 'ContentionOnSharedResources',
    grpcCode: 10, // ABORTED
    grpcCodeName: 'ABORTED',
    description: 'UTXO contention, interpretation time exceeded, resource limits',
    debuggerHandling: 'Show contention timeline, advise profiling or operator scaling',
  },
  DeadlineExceededRequestStateUnknown: {
    category: 'DeadlineExceededRequestStateUnknown',
    grpcCode: 4, // DEADLINE_EXCEEDED
    grpcCodeName: 'DEADLINE_EXCEEDED',
    description: 'Timeout — outcome unknown',
    debuggerHandling: 'Warn that transaction may or may not have committed, show how to check',
  },
  TransientServerFailure: {
    category: 'TransientServerFailure',
    grpcCode: 14, // UNAVAILABLE (or INTERNAL)
    grpcCodeName: 'UNAVAILABLE',
    description: 'Infrastructure faults (DB serialization errors, network issues)',
    debuggerHandling: 'Filter from application-logic views, categorize as infrastructure retry',
  },
  SystemInternalAssumptionViolated: {
    category: 'SystemInternalAssumptionViolated',
    grpcCode: 13, // INTERNAL
    grpcCodeName: 'INTERNAL',
    description: 'Internal bugs or unexpected states',
    debuggerHandling: 'Flag for operator attention, not developer fix',
  },
  MaliciousOrFaultyBehaviour: {
    category: 'MaliciousOrFaultyBehaviour',
    grpcCode: 13, // INTERNAL (details stripped)
    grpcCodeName: 'INTERNAL',
    description: 'Security-related failures',
    debuggerHandling: 'Warn that details are deliberately hidden for security',
  },
  InternalUnsupportedOperation: {
    category: 'InternalUnsupportedOperation',
    grpcCode: 12, // UNIMPLEMENTED
    grpcCodeName: 'UNIMPLEMENTED',
    description: 'Calling unsupported API endpoints',
    debuggerHandling: 'Show which endpoint is unsupported and suggest alternatives',
  },
};

// Reverse map: gRPC code → possible categories (some share codes)
export const GRPC_CODE_TO_CATEGORIES: Record<number, ErrorCategory[]> = {};
for (const info of Object.values(ERROR_CATEGORIES)) {
  const existing = GRPC_CODE_TO_CATEGORIES[info.grpcCode];
  if (existing) {
    existing.push(info.category);
  } else {
    GRPC_CODE_TO_CATEGORIES[info.grpcCode] = [info.category];
  }
}

// ============================================================
// gRPC Status Detail Parsers
// ============================================================

/**
 * Google well-known Any type URLs used in Canton status.details.
 */
const TYPE_URL_ERROR_INFO = 'type.googleapis.com/google.rpc.ErrorInfo';
const TYPE_URL_REQUEST_INFO = 'type.googleapis.com/google.rpc.RequestInfo';
const TYPE_URL_RETRY_INFO = 'type.googleapis.com/google.rpc.RetryInfo';
const TYPE_URL_RESOURCE_INFO = 'type.googleapis.com/google.rpc.ResourceInfo';

export interface ParsedErrorInfo {
  reason: string;
  domain: string;
  metadata: Record<string, string>;
}

export interface ParsedRequestInfo {
  requestId: string;
  servingData: string;
}

export interface ParsedRetryInfo {
  retryDelay: { seconds: number; nanos: number };
}

export interface ParsedResourceInfo {
  resourceType: string;
  resourceName: string;
  owner: string;
  description: string;
}

export interface ParsedStatusDetails {
  errorInfo?: ParsedErrorInfo;
  requestInfo?: ParsedRequestInfo;
  retryInfo?: ParsedRetryInfo;
  resourceInfo?: ParsedResourceInfo;
}

/**
 * Parse structured error details from gRPC status.details trailing metadata.
 *
 * Canton encodes ErrorInfo, RequestInfo, RetryInfo, and ResourceInfo as
 * google.protobuf.Any messages in the status details array.
 */
export function parseStatusDetails(details: Any[]): ParsedStatusDetails {
  const result: ParsedStatusDetails = {};

  for (const detail of details) {
    try {
      switch (detail.type_url) {
        case TYPE_URL_ERROR_INFO:
          result.errorInfo = decodeErrorInfo(detail.value);
          break;
        case TYPE_URL_REQUEST_INFO:
          result.requestInfo = decodeRequestInfo(detail.value);
          break;
        case TYPE_URL_RETRY_INFO:
          result.retryInfo = decodeRetryInfo(detail.value);
          break;
        case TYPE_URL_RESOURCE_INFO:
          result.resourceInfo = decodeResourceInfo(detail.value);
          break;
        // Unknown type_urls are silently ignored
      }
    } catch {
      // Malformed detail — skip rather than crash
    }
  }

  return result;
}

/**
 * Minimal protobuf decoding for well-known types.
 * These are simple messages with known field numbers.
 */

function decodeErrorInfo(bytes: Uint8Array): ParsedErrorInfo {
  const decoded = decodeAllFields(bytes);
  return {
    reason: getStringField(decoded, 1) ?? '',
    domain: getStringField(decoded, 2) ?? '',
    metadata: decodeStringMapEntries(getAllBytesFields(decoded, 3)),
  };
}

function decodeRequestInfo(bytes: Uint8Array): ParsedRequestInfo {
  const decoded = decodeSimpleMessage(bytes);
  return {
    requestId: (decoded[1] as string) ?? '',
    servingData: (decoded[2] as string) ?? '',
  };
}

function decodeRetryInfo(bytes: Uint8Array): ParsedRetryInfo {
  // RetryInfo has a single Duration field at field 1
  const decoded = decodeSimpleMessage(bytes);
  const durationBytes = decoded[1] as Uint8Array | undefined;
  let seconds = 0;
  let nanos = 0;
  if (durationBytes) {
    const dur = decodeSimpleMessage(durationBytes);
    seconds = Number(dur[1] ?? 0);
    nanos = Number(dur[2] ?? 0);
  }
  return { retryDelay: { seconds, nanos } };
}

function decodeResourceInfo(bytes: Uint8Array): ParsedResourceInfo {
  const decoded = decodeSimpleMessage(bytes);
  return {
    resourceType: (decoded[1] as string) ?? '',
    resourceName: (decoded[2] as string) ?? '',
    owner: (decoded[3] as string) ?? '',
    description: (decoded[4] as string) ?? '',
  };
}

/**
 * Minimal protobuf varint/length-delimited decoder.
 * Returns a map of field numbers to values.
 */
function decodeSimpleMessage(bytes: Uint8Array): Record<number, string | Uint8Array | number> {
  const result: Record<number, string | Uint8Array | number> = {};
  let offset = 0;

  while (offset < bytes.length) {
    const [tag, newOffset] = readVarint(bytes, offset);
    offset = newOffset;
    const fieldNumber = tag >> 3;
    const wireType = tag & 0x07;

    switch (wireType) {
      case 0: { // Varint
        const [value, next] = readVarint(bytes, offset);
        offset = next;
        result[fieldNumber] = value;
        break;
      }
      case 2: { // Length-delimited (string or bytes or embedded message)
        const [length, lenOffset] = readVarint(bytes, offset);
        offset = lenOffset;
        const data = bytes.slice(offset, offset + length);
        offset += length;
        // Try to decode as UTF-8 string, fall back to raw bytes
        try {
          result[fieldNumber] = new TextDecoder().decode(data);
        } catch {
          result[fieldNumber] = data;
        }
        break;
      }
      case 1: { // 64-bit fixed
        offset += 8;
        break;
      }
      case 5: { // 32-bit fixed
        offset += 4;
        break;
      }
      default:
        // Unknown wire type — bail
        return result;
    }
  }

  return result;
}

function readVarint(bytes: Uint8Array, offset: number): [number, number] {
  let result = 0;
  let shift = 0;
  while (offset < bytes.length) {
    const byte = bytes[offset]!;
    result |= (byte & 0x7f) << shift;
    offset++;
    if ((byte & 0x80) === 0) break;
    shift += 7;
  }
  return [result, offset];
}

/**
 * Parse all fields from a protobuf message, preserving repeated fields.
 * Returns an array of [fieldNumber, value] tuples.
 */
function decodeAllFields(bytes: Uint8Array): Array<[number, string | Uint8Array | number]> {
  const result: Array<[number, string | Uint8Array | number]> = [];
  let offset = 0;

  while (offset < bytes.length) {
    const [tag, newOffset] = readVarint(bytes, offset);
    offset = newOffset;
    const fieldNumber = tag >> 3;
    const wireType = tag & 0x07;

    switch (wireType) {
      case 0: {
        const [value, next] = readVarint(bytes, offset);
        offset = next;
        result.push([fieldNumber, value]);
        break;
      }
      case 2: {
        const [length, lenOffset] = readVarint(bytes, offset);
        offset = lenOffset;
        const data = bytes.slice(offset, offset + length);
        offset += length;
        try {
          result.push([fieldNumber, new TextDecoder().decode(data)]);
        } catch {
          result.push([fieldNumber, data]);
        }
        break;
      }
      case 1: {
        offset += 8;
        break;
      }
      case 5: {
        offset += 4;
        break;
      }
      default:
        return result;
    }
  }

  return result;
}

function getStringField(fields: Array<[number, string | Uint8Array | number]>, fieldNumber: number): string | undefined {
  for (const [num, val] of fields) {
    if (num === fieldNumber && typeof val === 'string') return val;
  }
  return undefined;
}

function getAllBytesFields(fields: Array<[number, string | Uint8Array | number]>, fieldNumber: number): Array<string | Uint8Array> {
  const result: Array<string | Uint8Array> = [];
  for (const [num, val] of fields) {
    if (num === fieldNumber && (typeof val === 'string' || val instanceof Uint8Array)) {
      result.push(val);
    }
  }
  return result;
}

/**
 * Decode all entries from a protobuf map field.
 * Map fields are encoded as repeated sub-messages, each with key=1, value=2.
 */
function decodeStringMapEntries(entries: Array<string | Uint8Array>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const entry of entries) {
    try {
      const bytes = typeof entry === 'string' ? new TextEncoder().encode(entry) : entry;
      const decoded = decodeSimpleMessage(bytes);
      const key = decoded[1] as string | undefined;
      const value = decoded[2] as string | undefined;
      if (key) {
        result[key] = value ?? '';
      }
    } catch {
      // Ignore malformed entries
    }
  }
  return result;
}

// ============================================================
// Canton Error Code Parser
// ============================================================

/**
 * Parse a Canton error string of format:
 *   ERROR_CODE_ID(CATEGORY_ID,CORRELATION_ID_PREFIX):HUMAN_READABLE_MESSAGE
 *
 * We extract ERROR_CODE_ID and CATEGORY_ID programmatically.
 * HUMAN_READABLE_MESSAGE is preserved for display only — NEVER parsed.
 */
export interface ParsedCantonError {
  errorCodeId: string;
  categoryId: string;
  correlationIdPrefix: string;
  humanReadableMessage: string;
}

export function parseCantonErrorString(errorString: string): ParsedCantonError | null {
  // Format: ERROR_CODE_ID(CATEGORY_ID,CORRELATION_PREFIX):MESSAGE
  const match = errorString.match(/^([A-Z_]+)\((\d+),([^)]+)\):(.*)$/s);
  if (!match) return null;

  return {
    errorCodeId: match[1]!,
    categoryId: match[2]!,
    correlationIdPrefix: match[3]!,
    humanReadableMessage: match[4]!.trim(),
  };
}

/**
 * Map a numeric category ID to the ErrorCategory enum.
 */
export function categoryIdToErrorCategory(categoryId: string | number): ErrorCategory | null {
  const CATEGORY_MAP: Record<number, ErrorCategory> = {
    1: 'InvalidIndependentOfSystemState',
    2: 'AuthInterceptorInvalidAuthenticationCredentials',
    3: 'InvalidGivenCurrentSystemStateOther',
    4: 'InvalidGivenCurrentSystemStateResourceMissing',
    5: 'InvalidGivenCurrentSystemStateResourceExists',
    6: 'ContentionOnSharedResources',
    7: 'DeadlineExceededRequestStateUnknown',
    8: 'TransientServerFailure',
    9: 'SystemInternalAssumptionViolated',
    10: 'MaliciousOrFaultyBehaviour',
    11: 'InternalUnsupportedOperation',
  };
  return CATEGORY_MAP[Number(categoryId)] ?? null;
}

// ============================================================
// Convert gRPC Error to CommandError
// ============================================================

/**
 * Convert a gRPC error (with status and trailing metadata) into our CommandError type.
 */
export function grpcErrorToCommandError(
  grpcStatus: Status,
  trailingMetadata?: Record<string, string>,
): CommandError {
  const details = grpcStatus.details ?? [];
  const parsed = parseStatusDetails(details);

  // Try to extract Canton-format error from the message
  const cantonError = parseCantonErrorString(grpcStatus.message);
  const errorCodeId = cantonError?.errorCodeId ?? `GRPC_${grpcStatus.code}`;
  const categoryId = cantonError
    ? categoryIdToErrorCategory(cantonError.categoryId) ?? 'SystemInternalAssumptionViolated'
    : grpcCodeToCategory(grpcStatus.code);

  const correlationId =
    cantonError?.correlationIdPrefix ??
    parsed.requestInfo?.requestId ??
    trailingMetadata?.['x-correlation-id'] ??
    '';

  const grpcCodeNames: Record<number, string> = {
    0: 'OK', 1: 'CANCELLED', 2: 'UNKNOWN', 3: 'INVALID_ARGUMENT',
    4: 'DEADLINE_EXCEEDED', 5: 'NOT_FOUND', 6: 'ALREADY_EXISTS',
    7: 'PERMISSION_DENIED', 8: 'RESOURCE_EXHAUSTED', 9: 'FAILED_PRECONDITION',
    10: 'ABORTED', 11: 'OUT_OF_RANGE', 12: 'UNIMPLEMENTED', 13: 'INTERNAL',
    14: 'UNAVAILABLE', 15: 'DATA_LOSS', 16: 'UNAUTHENTICATED',
  };

  return {
    errorCodeId,
    categoryId,
    grpcStatusCode: grpcCodeNames[grpcStatus.code] ?? `CODE_${grpcStatus.code}`,
    message: cantonError?.humanReadableMessage ?? grpcStatus.message,
    correlationId,
    errorInfo: parsed.errorInfo
      ? { reason: parsed.errorInfo.reason, metadata: parsed.errorInfo.metadata }
      : undefined,
    requestInfo: parsed.requestInfo
      ? { requestId: parsed.requestInfo.requestId }
      : undefined,
    retryInfo: parsed.retryInfo
      ? { retryDelaySeconds: parsed.retryInfo.retryDelay.seconds + parsed.retryInfo.retryDelay.nanos / 1e9 }
      : undefined,
    resourceInfo: parsed.resourceInfo
      ? {
          resourceType: parsed.resourceInfo.resourceType,
          resourceName: parsed.resourceInfo.resourceName,
          owner: parsed.resourceInfo.owner,
        }
      : undefined,
  };
}

function grpcCodeToCategory(code: number): ErrorCategory {
  const CODE_MAP: Record<number, ErrorCategory> = {
    3: 'InvalidIndependentOfSystemState',
    7: 'AuthInterceptorInvalidAuthenticationCredentials',
    9: 'InvalidGivenCurrentSystemStateOther',
    5: 'InvalidGivenCurrentSystemStateResourceMissing',
    6: 'InvalidGivenCurrentSystemStateResourceExists',
    10: 'ContentionOnSharedResources',
    4: 'DeadlineExceededRequestStateUnknown',
    14: 'TransientServerFailure',
    12: 'InternalUnsupportedOperation',
  };
  return CODE_MAP[code] ?? 'SystemInternalAssumptionViolated';
}

// ============================================================
// CantonError — throwable error class
// ============================================================

export class CantonError extends Error {
  public readonly commandError: CommandError;
  public readonly grpcCode: number;

  constructor(grpcStatus: Status, trailingMetadata?: Record<string, string>) {
    const commandError = grpcErrorToCommandError(grpcStatus, trailingMetadata);
    super(`[${commandError.errorCodeId}] ${commandError.message}`);
    this.name = 'CantonError';
    this.commandError = commandError;
    this.grpcCode = grpcStatus.code;
  }
}
