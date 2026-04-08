/**
 * Shared utilities for Canton gRPC service wrappers.
 *
 * Provides common helpers for metadata construction, unary calls,
 * streaming calls, and error handling.
 */

import * as grpc from '@grpc/grpc-js';
import { CantonError } from '../errors.js';

/**
 * Create gRPC metadata with optional JWT Bearer token.
 */
export function createMetadata(token: string | null): grpc.Metadata {
  const metadata = new grpc.Metadata();
  if (token) {
    metadata.set('authorization', `Bearer ${token}`);
  }
  return metadata;
}

/**
 * Create gRPC metadata for sandbox mode.
 *
 * When no real JWT exists (sandbox with auth disabled), Canton's
 * InteractiveSubmissionService still requires a Bearer token with a `sub`
 * claim to derive the user-id.  We generate a minimal unsigned JWT (alg:
 * "none") that Canton sandbox accepts.  If a real token is available we
 * use that instead.
 */
export function createSandboxMetadata(
  token: string | null,
  userId: string,
): grpc.Metadata {
  if (token) return createMetadata(token);

  // Build an unsigned JWT: header.payload.
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({
      sub: userId,
      aud: 'canton-participant',
      iss: 'cantontrace',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
    }),
  ).toString('base64url');
  const unsignedJwt = `${header}.${payload}.`;

  const metadata = new grpc.Metadata();
  metadata.set('authorization', `Bearer ${unsignedJwt}`);
  return metadata;
}

/**
 * Make a unary gRPC call and return the response as a typed object.
 * Wraps the callback-style gRPC client into a Promise.
 */
export function makeUnaryCall<TReq, TRes>(
  client: grpc.Client,
  methodName: string,
  request: TReq,
  metadata: grpc.Metadata,
  options?: grpc.CallOptions,
): Promise<TRes> {
  return new Promise((resolve, reject) => {
    const method = (client as unknown as Record<string, Function>)[methodName];
    if (!method) {
      reject(new Error(`Method ${methodName} not found on gRPC client`));
      return;
    }

    method.call(
      client,
      request,
      metadata,
      options ?? {},
      (error: grpc.ServiceError | null, response: TRes) => {
        if (error) {
          reject(grpcServiceErrorToCantonError(error));
          return;
        }
        resolve(response);
      },
    );
  });
}

/**
 * Initiate a server-streaming gRPC call and return the readable stream.
 */
export function makeServerStreamCall<TReq>(
  client: grpc.Client,
  methodName: string,
  request: TReq,
  metadata: grpc.Metadata,
  options?: grpc.CallOptions,
): grpc.ClientReadableStream<unknown> {
  const method = (client as unknown as Record<string, Function>)[methodName];
  if (!method) {
    throw new Error(`Method ${methodName} not found on gRPC client`);
  }

  return method.call(client, request, metadata, options ?? {}) as grpc.ClientReadableStream<unknown>;
}

/**
 * Collect all messages from a server stream into an array.
 * Useful for finite streams (e.g., GetActiveContracts).
 */
export function collectStream<T>(stream: grpc.ClientReadableStream<unknown>): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const results: T[] = [];

    stream.on('data', (data: T) => {
      results.push(data);
    });

    stream.on('end', () => {
      resolve(results);
    });

    stream.on('error', (error: grpc.ServiceError) => {
      reject(grpcServiceErrorToCantonError(error));
    });
  });
}

/**
 * Convert a grpc.ServiceError into a CantonError.
 */
function grpcServiceErrorToCantonError(error: grpc.ServiceError): CantonError {
  // Extract status details from metadata if available
  const statusDetails: Array<{ type_url: string; value: Uint8Array }> = [];
  const trailingMetadata: Record<string, string> = {};

  if (error.metadata) {
    // gRPC-status-details-bin carries serialized google.rpc.Status
    const detailsBin = error.metadata.get('grpc-status-details-bin');
    if (detailsBin && detailsBin.length > 0) {
      // The binary value is a serialized google.rpc.Status which contains details
      // For now we pass through what we have; full parsing happens in errors.ts
      try {
        const buf = detailsBin[0];
        if (buf instanceof Buffer) {
          // Attempt to decode the status proto to extract details
          // This is a simplified extraction — production would use full proto decoding
          statusDetails.push({
            type_url: 'type.googleapis.com/google.rpc.Status',
            value: new Uint8Array(buf),
          });
        }
      } catch {
        // Ignore decoding failures
      }
    }

    // Collect string metadata entries
    for (const key of Object.keys(error.metadata.getMap())) {
      const val = error.metadata.get(key);
      if (val && val.length > 0 && typeof val[0] === 'string') {
        trailingMetadata[key] = val[0];
      }
    }
  }

  return new CantonError(
    {
      code: error.code ?? grpc.status.UNKNOWN,
      message: error.details ?? error.message ?? 'Unknown gRPC error',
      details: statusDetails,
    },
    trailingMetadata,
  );
}

/**
 * Helper: convert a Timestamp proto to ISO string.
 *
 * Handles multiple formats:
 * - Proto Timestamp object: { seconds: string|number, nanos: number }
 * - ISO string (Canton may send timestamps as strings in some contexts)
 * - Undefined/null
 */
export function timestampToISO(ts: { seconds: string; nanos: number } | string | undefined): string {
  if (!ts) return new Date(0).toISOString();

  // If it's already a string (ISO format), return it directly
  if (typeof ts === 'string') {
    const parsed = new Date(ts);
    return isNaN(parsed.getTime()) ? new Date(0).toISOString() : parsed.toISOString();
  }

  // Proto Timestamp object: { seconds, nanos }
  const seconds = Number(ts.seconds);
  if (isNaN(seconds)) return new Date(0).toISOString();
  const millis = seconds * 1000 + Math.floor((ts.nanos ?? 0) / 1_000_000);
  return new Date(millis).toISOString();
}

/**
 * Build a filters_by_party map for EventFormat.
 *
 * NOTE: When using @grpc/proto-loader with descriptor-set loaded protos,
 * protobuf map fields must be encoded as arrays of { key, value } pairs,
 * NOT as plain JS objects. This is because proto-loader uses the wire format
 * representation of maps (repeated map entry messages).
 *
 * The return value has filters_by_party as an array of { key: string, value: Filters }.
 */
export function buildTransactionFilter(
  parties: string[],
  templateIds?: Array<{ packageName: string; moduleName: string; entityName: string }>,
): Record<string, unknown> {
  const filtersByParty: Array<{ key: string; value: unknown }> = [];

  for (const party of parties) {
    if (templateIds && templateIds.length > 0) {
      filtersByParty.push({
        key: party,
        value: {
          cumulative: templateIds.map((tid) => ({
            identifier_filter: {
              template_filter: {
                template_id: {
                  package_id: '',
                  module_name: `${tid.moduleName}`,
                  entity_name: `${tid.entityName}`,
                },
                include_created_event_blob: false,
              },
            },
          })),
        },
      });
    } else {
      // Wildcard filter — match all templates
      filtersByParty.push({
        key: party,
        value: {
          cumulative: [
            {
              wildcard_filter: {
                include_created_event_blob: false,
              },
            },
          ],
        },
      });
    }
  }

  return { filters_by_party: filtersByParty };
}
