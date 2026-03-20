/**
 * Canton Proto Loader — Dynamic protobuf loading via gRPC Server Reflection.
 *
 * Instead of shipping static .proto files (which break across Canton versions),
 * this module fetches proto descriptors directly from the running Canton server
 * using the gRPC Server Reflection API. It then uses @grpc/proto-loader to
 * build proper service definitions with real protobuf binary serialization.
 *
 * This solves the critical issue where JSON serialization was used instead of
 * protobuf binary, causing "Application error processing RPC" failures.
 *
 * WORKAROUND: Canton's Variant message has a field literally named "constructor"
 * which collides with JavaScript's built-in Object.constructor property.
 * protobufjs (used by @grpc/proto-loader) crashes on this. We monkey-patch
 * protobufjs.Type.prototype.add to gracefully handle the duplicate name.
 */

import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import protobufjs from 'protobufjs';

// ============================================================
// Workaround: protobufjs "constructor" field name collision
// ============================================================

/**
 * Canton's com.daml.ledger.api.v2.Variant message has a field named "constructor"
 * which is a reserved property name in JavaScript. When protobufjs processes the
 * FileDescriptorSet, it creates both a JS property and a protobuf field with this
 * name, causing a "duplicate name 'constructor'" error.
 *
 * This patch must be applied before any proto loading occurs.
 */
let _patched = false;

function applyProtobufJsPatch(): void {
  if (_patched) return;
  _patched = true;

  const originalAdd = protobufjs.Type.prototype.add;
  protobufjs.Type.prototype.add = function (this: protobufjs.Type, object: protobufjs.ReflectionObject) {
    // If a field with this name already exists, skip the duplicate
    if (
      object instanceof protobufjs.Field &&
      this.fields &&
      (this.fields as Record<string, unknown>)[object.name]
    ) {
      return this;
    }
    try {
      return originalAdd.call(this, object);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '';
      if (msg.includes("duplicate name 'constructor'")) {
        // Silently handle the known Canton Variant.constructor collision
        return this;
      }
      throw e;
    }
  };
}

// ============================================================
// gRPC Server Reflection Client
// ============================================================

/**
 * Fetch the complete FileDescriptorSet from a gRPC server's reflection API.
 *
 * Uses the grpc.reflection.v1.ServerReflection/ServerReflectionInfo bidirectional
 * stream to list all services, then fetches file descriptors for each.
 *
 * The returned Buffer contains a serialized google.protobuf.FileDescriptorSet
 * that can be passed directly to @grpc/proto-loader.
 */
export async function fetchProtoDescriptors(
  endpoint: string,
  credentials: grpc.ChannelCredentials,
  channelOptions?: grpc.ChannelOptions,
): Promise<Buffer> {
  // Build a minimal service definition for the reflection API.
  // We use raw binary pass-through since we need to bootstrap without proto defs.
  const reflectionDef: grpc.ServiceDefinition = {
    ServerReflectionInfo: {
      path: '/grpc.reflection.v1.ServerReflection/ServerReflectionInfo',
      requestStream: true,
      responseStream: true,
      requestSerialize: (value: Uint8Array) => Buffer.from(value),
      requestDeserialize: (bytes: Buffer) => new Uint8Array(bytes),
      responseSerialize: (value: Uint8Array) => Buffer.from(value),
      responseDeserialize: (bytes: Buffer) => new Uint8Array(bytes),
    },
  };

  const ReflectionClient = grpc.makeGenericClientConstructor(
    reflectionDef,
    'grpc.reflection.v1.ServerReflection',
    {},
  );
  const client = new ReflectionClient(endpoint, credentials, channelOptions ?? {});

  try {
    // Step 1: List all services
    const serviceNames = await reflectionListServices(client);

    // Step 2: Fetch file descriptors for each service
    const allFileDescriptors = new Map<string, Uint8Array>();
    for (const serviceName of serviceNames) {
      const descriptors = await reflectionGetFileDescriptors(client, serviceName);
      for (const [name, bytes] of descriptors) {
        allFileDescriptors.set(name, bytes);
      }
    }

    // Step 3: Build a FileDescriptorSet from all collected descriptors
    return buildFileDescriptorSet(allFileDescriptors);
  } finally {
    client.close();
  }
}

/**
 * List all service names via reflection.
 */
function reflectionListServices(client: grpc.Client): Promise<string[]> {
  return new Promise((resolve, reject) => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    const call = (client as unknown as Record<string, (...args: unknown[]) => unknown>)
      ['ServerReflectionInfo']!() as grpc.ClientDuplexStream<Uint8Array, Uint8Array>;

    const services: string[] = [];

    call.on('data', (responseBytes: Uint8Array) => {
      // Decode ServerReflectionResponse manually (minimal protobuf decoding)
      const parsed = parseReflectionResponse(responseBytes);
      if (parsed.serviceNames) {
        services.push(...parsed.serviceNames);
      }
    });

    call.on('error', (err: Error) => {
      reject(new Error(`Reflection list_services failed: ${err.message}`));
    });

    call.on('end', () => {
      resolve(services);
    });

    // Send list_services request
    // ServerReflectionRequest: field 3 = host (string), field 7 = list_services (string)
    const request = encodeReflectionRequest({ listServices: '' });
    call.write(request);
    call.end();
  });
}

/**
 * Fetch file descriptors for a service via reflection.
 */
function reflectionGetFileDescriptors(
  client: grpc.Client,
  serviceName: string,
): Promise<Map<string, Uint8Array>> {
  return new Promise((resolve, reject) => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    const call = (client as unknown as Record<string, (...args: unknown[]) => unknown>)
      ['ServerReflectionInfo']!() as grpc.ClientDuplexStream<Uint8Array, Uint8Array>;

    const descriptors = new Map<string, Uint8Array>();

    call.on('data', (responseBytes: Uint8Array) => {
      const parsed = parseReflectionResponse(responseBytes);
      if (parsed.fileDescriptors) {
        for (const fd of parsed.fileDescriptors) {
          // Extract the file name from the descriptor
          const name = extractFileNameFromDescriptor(fd);
          descriptors.set(name || `unknown-${descriptors.size}`, fd);
        }
      }
    });

    call.on('error', (err: Error) => {
      reject(new Error(`Reflection file_containing_symbol failed for ${serviceName}: ${err.message}`));
    });

    call.on('end', () => {
      resolve(descriptors);
    });

    // Send file_containing_symbol request
    const request = encodeReflectionRequest({ fileContainingSymbol: serviceName });
    call.write(request);
    call.end();
  });
}

// ============================================================
// Minimal Protobuf Encoding/Decoding for Reflection Messages
// ============================================================

interface ReflectionRequest {
  listServices?: string;
  fileContainingSymbol?: string;
}

function encodeReflectionRequest(req: ReflectionRequest): Uint8Array {
  const parts: Uint8Array[] = [];

  if (req.listServices !== undefined) {
    // field 7, wire type 2 (length-delimited) = tag 58
    const encoded = new TextEncoder().encode(req.listServices);
    parts.push(encodeTag(7, 2));
    parts.push(encodeVarint(encoded.length));
    parts.push(encoded);
  }

  if (req.fileContainingSymbol !== undefined) {
    // field 4, wire type 2 (length-delimited) = tag 34
    const encoded = new TextEncoder().encode(req.fileContainingSymbol);
    parts.push(encodeTag(4, 2));
    parts.push(encodeVarint(encoded.length));
    parts.push(encoded);
  }

  return concatUint8Arrays(parts);
}

interface ParsedReflectionResponse {
  serviceNames?: string[];
  fileDescriptors?: Uint8Array[];
  errorMessage?: string;
}

function parseReflectionResponse(bytes: Uint8Array): ParsedReflectionResponse {
  const result: ParsedReflectionResponse = {};
  let offset = 0;

  while (offset < bytes.length) {
    const [tag, newOffset] = readVarint(bytes, offset);
    offset = newOffset;
    const fieldNumber = tag >> 3;
    const wireType = tag & 0x07;

    if (wireType === 2) {
      const [length, lenOffset] = readVarint(bytes, offset);
      offset = lenOffset;
      const data = bytes.slice(offset, offset + length);
      offset += length;

      // ServerReflectionResponse fields:
      // field 6 = list_services_response (embedded message)
      // field 4 = file_descriptor_response (embedded message)
      // field 7 = error_response (embedded message)
      if (fieldNumber === 6) {
        result.serviceNames = parseListServicesResponse(data);
      } else if (fieldNumber === 4) {
        result.fileDescriptors = parseFileDescriptorResponse(data);
      }
    } else if (wireType === 0) {
      const [_value, nextOffset] = readVarint(bytes, offset);
      offset = nextOffset;
    } else if (wireType === 1) {
      offset += 8;
    } else if (wireType === 5) {
      offset += 4;
    } else {
      break;
    }
  }

  return result;
}

function parseListServicesResponse(bytes: Uint8Array): string[] {
  const names: string[] = [];
  let offset = 0;

  while (offset < bytes.length) {
    const [tag, newOffset] = readVarint(bytes, offset);
    offset = newOffset;
    const fieldNumber = tag >> 3;
    const wireType = tag & 0x07;

    if (wireType === 2) {
      const [length, lenOffset] = readVarint(bytes, offset);
      offset = lenOffset;
      const data = bytes.slice(offset, offset + length);
      offset += length;

      if (fieldNumber === 1) {
        // ServiceResponse sub-message, extract name (field 1)
        const name = extractStringField(data, 1);
        if (name) names.push(name);
      }
    } else if (wireType === 0) {
      const [_value, nextOffset] = readVarint(bytes, offset);
      offset = nextOffset;
    } else {
      break;
    }
  }

  return names;
}

function parseFileDescriptorResponse(bytes: Uint8Array): Uint8Array[] {
  const descriptors: Uint8Array[] = [];
  let offset = 0;

  while (offset < bytes.length) {
    const [tag, newOffset] = readVarint(bytes, offset);
    offset = newOffset;
    const fieldNumber = tag >> 3;
    const wireType = tag & 0x07;

    if (wireType === 2) {
      const [length, lenOffset] = readVarint(bytes, offset);
      offset = lenOffset;
      const data = bytes.slice(offset, offset + length);
      offset += length;

      if (fieldNumber === 1) {
        // file_descriptor_proto bytes
        descriptors.push(data);
      }
    } else if (wireType === 0) {
      const [_value, nextOffset] = readVarint(bytes, offset);
      offset = nextOffset;
    } else {
      break;
    }
  }

  return descriptors;
}

function extractStringField(bytes: Uint8Array, targetField: number): string | null {
  let offset = 0;

  while (offset < bytes.length) {
    const [tag, newOffset] = readVarint(bytes, offset);
    offset = newOffset;
    const fieldNumber = tag >> 3;
    const wireType = tag & 0x07;

    if (wireType === 2) {
      const [length, lenOffset] = readVarint(bytes, offset);
      offset = lenOffset;
      const data = bytes.slice(offset, offset + length);
      offset += length;

      if (fieldNumber === targetField) {
        return new TextDecoder().decode(data);
      }
    } else if (wireType === 0) {
      const [_value, nextOffset] = readVarint(bytes, offset);
      offset = nextOffset;
    } else if (wireType === 1) {
      offset += 8;
    } else if (wireType === 5) {
      offset += 4;
    } else {
      break;
    }
  }

  return null;
}

function extractFileNameFromDescriptor(bytes: Uint8Array): string {
  // FileDescriptorProto: field 1 = name (string)
  return extractStringField(bytes, 1) ?? 'unknown';
}

/**
 * Build a google.protobuf.FileDescriptorSet from a map of file descriptors.
 *
 * FileDescriptorSet is simply: repeated FileDescriptorProto file = 1;
 * Each file descriptor is length-delimited at field 1.
 */
function buildFileDescriptorSet(descriptors: Map<string, Uint8Array>): Buffer {
  const parts: Uint8Array[] = [];

  for (const fdBytes of descriptors.values()) {
    // field 1, wire type 2 (length-delimited) = tag 10
    parts.push(encodeTag(1, 2));
    parts.push(encodeVarint(fdBytes.length));
    parts.push(fdBytes);
  }

  return Buffer.from(concatUint8Arrays(parts));
}

// ============================================================
// Low-level protobuf encoding helpers
// ============================================================

function encodeTag(fieldNumber: number, wireType: number): Uint8Array {
  return encodeVarint((fieldNumber << 3) | wireType);
}

function encodeVarint(value: number): Uint8Array {
  const bytes: number[] = [];
  let v = value >>> 0; // ensure unsigned
  while (v > 0x7f) {
    bytes.push((v & 0x7f) | 0x80);
    v >>>= 7;
  }
  bytes.push(v & 0x7f);
  return new Uint8Array(bytes);
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
  return [result >>> 0, offset];
}

function concatUint8Arrays(arrays: Uint8Array[]): Uint8Array {
  const totalLength = arrays.reduce((sum, arr) => sum + arr.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}

// ============================================================
// Public API: Load Canton Package Definition
// ============================================================

export interface CantonProtoPackage {
  /** The grpc.loadPackageDefinition result — navigable by package path. */
  grpcObject: grpc.GrpcObject;
  /** The raw package definition from proto-loader. */
  packageDefinition: protoLoader.PackageDefinition;
}

/**
 * Load Canton proto definitions from a gRPC server using reflection.
 *
 * This is the main entry point. It:
 * 1. Applies the protobufjs "constructor" field name patch
 * 2. Fetches proto descriptors from the Canton server via reflection
 * 3. Builds a gRPC package definition with proper protobuf serialization
 *
 * @param endpoint - Canton gRPC endpoint (e.g., "localhost:6865")
 * @param credentials - gRPC channel credentials
 * @param channelOptions - Optional gRPC channel options
 * @returns The loaded proto package ready for creating service clients
 */
export async function loadCantonProtos(
  endpoint: string,
  credentials: grpc.ChannelCredentials,
  channelOptions?: grpc.ChannelOptions,
): Promise<CantonProtoPackage> {
  // Step 1: Apply protobufjs patch (idempotent)
  applyProtobufJsPatch();

  // Step 2: Fetch descriptors via reflection
  const descriptorSetBuffer = await fetchProtoDescriptors(endpoint, credentials, channelOptions);

  // Step 3: Load into @grpc/proto-loader with proper options
  const packageDefinition = protoLoader.loadFileDescriptorSetFromBuffer(descriptorSetBuffer, {
    keepCase: true,     // Keep protobuf field names as-is (snake_case)
    longs: String,      // Represent int64 as strings (avoids JS number precision loss)
    enums: String,      // Represent enums as their string names
    defaults: true,     // Include default values for unset fields
    oneofs: true,       // Include virtual oneof properties
  });

  // Step 4: Build gRPC object
  const grpcObject = grpc.loadPackageDefinition(packageDefinition);

  return { grpcObject, packageDefinition };
}

/**
 * Load Canton proto definitions from a pre-existing protoset buffer.
 *
 * Use this if you have a cached/bundled FileDescriptorSet (e.g., from grpcurl -protoset-out).
 * This avoids the reflection round-trip at startup.
 */
export function loadCantonProtosFromBuffer(protosetBuffer: Buffer): CantonProtoPackage {
  applyProtobufJsPatch();

  const packageDefinition = protoLoader.loadFileDescriptorSetFromBuffer(protosetBuffer, {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true,
  });

  const grpcObject = grpc.loadPackageDefinition(packageDefinition);
  return { grpcObject, packageDefinition };
}

/**
 * Navigate the grpc object to find a service constructor.
 *
 * @param grpcObject - The loaded grpc object from loadCantonProtos
 * @param servicePath - Dotted service path (e.g., "com.daml.ledger.api.v2.VersionService")
 * @returns The service constructor function, or null if not found
 */
export function getServiceConstructor(
  grpcObject: grpc.GrpcObject,
  servicePath: string,
): grpc.ServiceClientConstructor | null {
  const parts = servicePath.split('.');
  let current: unknown = grpcObject;

  for (const part of parts) {
    if (current && typeof current === 'object' && part in (current as Record<string, unknown>)) {
      current = (current as Record<string, unknown>)[part];
    } else {
      return null;
    }
  }

  if (typeof current === 'function') {
    return current as grpc.ServiceClientConstructor;
  }
  return null;
}
