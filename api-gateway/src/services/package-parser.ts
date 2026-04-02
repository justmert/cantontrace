/**
 * DALF Package Parser
 *
 * Primary strategy: delegates to the Scala engine service which has the
 * real `daml-lf-archive-reader` library and can parse all Daml-LF versions
 * including 2.x (Canton 3.4).
 *
 * Fallback: a simplified TypeScript protobuf parser that works for older
 * Daml-LF 1.x formats but returns empty modules for 2.x.
 *
 * Daml-LF archives use Protocol Buffers encoding. The archive format is:
 * - DamlLf.Archive { hash_function, payload (ArchivePayload bytes), hash }
 * - ArchivePayload contains Package with modules, templates, etc.
 */

import type {
  PackageDetail,
  ModuleDetail,
  TemplateDefinition,
  ChoiceDefinition,
  FieldDefinition,
  InterfaceDefinition,
  KeyDefinition,
} from '../types.js';

// ============================================================
// Engine Service Integration
// ============================================================

const ENGINE_SERVICE_URL = process.env.ENGINE_SERVICE_URL ?? 'http://localhost:3002';

/**
 * Re-wrap raw ArchivePayload bytes (from Canton's GetPackageResponse) into
 * a complete DamlLf.Archive protobuf that the engine service can parse.
 *
 * Canton's gRPC GetPackageResponse returns the ArchivePayload bytes (not
 * the full Archive). The ArchivePayload structure is:
 *   - field 3: minor version string (e.g., "2")
 *   - field 4: Package message (for Daml-LF 2.x)
 *   - (field 2: Package for Daml-LF 1.x)
 *
 * The engine service expects a full DamlLf.Archive:
 *   - field 1: hash_function (varint, 0 = SHA256)
 *   - field 3: payload bytes (the ArchivePayload)
 *   - field 4: hash string (the package ID)
 */
export function wrapAsArchive(archivePayloadBase64: string, packageId: string): string {
  const archivePayloadBytes = Buffer.from(archivePayloadBase64, 'base64');
  const hashBytes = Buffer.from(packageId, 'utf-8');

  const parts: Buffer[] = [];

  // Field 1: hash_function = 0 (SHA256), tag = (1 << 3) | 0 = 0x08, value = 0x00
  parts.push(Buffer.from([0x08, 0x00]));

  // Field 3: payload (length-delimited), tag = (3 << 3) | 2 = 0x1a
  // This contains the full ArchivePayload bytes.
  parts.push(Buffer.from([0x1a]));
  parts.push(encodeVarint(archivePayloadBytes.length));
  parts.push(archivePayloadBytes);

  // Field 4: hash (length-delimited), tag = (4 << 3) | 2 = 0x22
  parts.push(Buffer.from([0x22]));
  parts.push(encodeVarint(hashBytes.length));
  parts.push(hashBytes);

  return Buffer.concat(parts).toString('base64');
}

/** Encode a non-negative integer as a protobuf varint. */
function encodeVarint(value: number): Buffer {
  const bytes: number[] = [];
  let v = value;
  while (v > 0x7f) {
    bytes.push((v & 0x7f) | 0x80);
    v >>>= 7;
  }
  bytes.push(v & 0x7f);
  return Buffer.from(bytes);
}

/**
 * Parse a DALF archive by sending it to the Scala engine service.
 *
 * The engine service uses the real `daml-lf-archive-reader` library and
 * can handle all Daml-LF versions including 2.x used by Canton 3.4.
 *
 * Falls back to the local TypeScript parser if the engine service is
 * unreachable.
 */
export async function parseDalfViaEngine(
  dalfBase64: string,
  packageId: string,
  packageName?: string,
  packageVersion?: string,
): Promise<PackageDetail> {
  try {
    // Canton's GetPackageResponse splits the Archive into separate fields
    // (archive_payload, hash, hash_function). The engine service expects
    // a complete DamlLf.Archive protobuf, so we re-wrap the payload.
    const archiveBase64 = wrapAsArchive(dalfBase64, packageId);

    const response = await fetch(`${ENGINE_SERVICE_URL}/api/v1/parse-dalf`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dalfBytes: archiveBase64 }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.warn(
        `Engine service parse-dalf returned ${response.status}: ${errorBody}. ` +
        `Falling back to local parser for package ${packageId}.`
      );
      return parseDalfArchiveFallback(dalfBase64, packageId, packageName, packageVersion);
    }

    const engineResult = await response.json() as EnginePackageDetail;

    // Map the engine service response to our TypeScript types.
    // The Scala model uses `fieldType`/`keyType` while TS uses `type`.
    return mapEngineResponse(engineResult, packageId, packageName, packageVersion);
  } catch (err) {
    console.warn(
      `Cannot reach engine-service at ${ENGINE_SERVICE_URL} for parse-dalf: ${err}. ` +
      `Falling back to local parser for package ${packageId}.`
    );
    return parseDalfArchiveFallback(dalfBase64, packageId, packageName, packageVersion);
  }
}

// ============================================================
// Engine Service Response Mapping
// ============================================================

/** Shape of the engine service's JSON response (Scala field names). */
interface EnginePackageDetail {
  packageId: string;
  packageName?: string;
  packageVersion?: string;
  modules: EngineModuleDetail[];
  hasSource: boolean;
}

interface EngineModuleDetail {
  name: string;
  templates: EngineTemplateDefinition[];
  interfaces: EngineInterfaceDefinition[];
  typeDefinitions?: EngineTypeDefinition[];
}

interface EngineTemplateDefinition {
  name: string;
  fields: EngineFieldDefinition[];
  choices: EngineChoiceDefinition[];
  key?: EngineKeyDefinition;
  signatoryExpression: string;
  observerExpression: string;
  ensureExpression?: string;
  implements: string[];
  sourceCode?: string;
  decompiledLF?: string;
}

interface EngineFieldDefinition {
  name: string;
  fieldType: string;  // Scala uses "fieldType", TS uses "type"
  optional: boolean;
}

interface EngineChoiceDefinition {
  name: string;
  consuming: boolean;
  parameters: EngineFieldDefinition[];
  returnType: string;
  controllerExpression: string;
  sourceCode?: string;
  decompiledLF?: string;
}

interface EngineKeyDefinition {
  keyType: string;  // Scala uses "keyType", TS uses "type"
  expression: string;
  maintainerExpression: string;
}

interface EngineInterfaceDefinition {
  name: string;
  methods: EngineFieldDefinition[];
  choices: EngineChoiceDefinition[];
}

interface EngineTypeDefinition {
  name: string;
  serializable: boolean;
  representation: string;
}

function mapEngineField(f: EngineFieldDefinition): FieldDefinition {
  return { name: f.name, type: f.fieldType, optional: f.optional };
}

function mapEngineChoice(c: EngineChoiceDefinition): ChoiceDefinition {
  return {
    name: c.name,
    consuming: c.consuming,
    parameters: c.parameters.map(mapEngineField),
    returnType: c.returnType,
    controllerExpression: c.controllerExpression,
    sourceCode: c.sourceCode,
    decompiledLF: c.decompiledLF,
  };
}

function mapEngineKey(k: EngineKeyDefinition): KeyDefinition {
  return { type: k.keyType, expression: k.expression, maintainerExpression: k.maintainerExpression };
}

function mapEngineResponse(
  engine: EnginePackageDetail,
  packageId: string,
  packageName?: string,
  packageVersion?: string,
): PackageDetail {
  return {
    packageId: engine.packageId || packageId,
    packageName: engine.packageName ?? packageName,
    packageVersion: engine.packageVersion ?? packageVersion,
    hasSource: engine.hasSource,
    modules: engine.modules.map((mod): ModuleDetail => ({
      name: mod.name,
      templates: mod.templates.map((tmpl): TemplateDefinition => ({
        name: tmpl.name,
        fields: tmpl.fields.map(mapEngineField),
        choices: tmpl.choices.map(mapEngineChoice),
        key: tmpl.key ? mapEngineKey(tmpl.key) : undefined,
        signatoryExpression: tmpl.signatoryExpression,
        observerExpression: tmpl.observerExpression,
        ensureExpression: tmpl.ensureExpression,
        implements: tmpl.implements,
        sourceCode: tmpl.sourceCode,
        decompiledLF: tmpl.decompiledLF,
      })),
      interfaces: mod.interfaces.map((iface): InterfaceDefinition => ({
        name: iface.name,
        methods: iface.methods.map(mapEngineField),
        choices: iface.choices.map(mapEngineChoice),
      })),
    })),
  };
}

/**
 * Fallback: use the local TypeScript parser when the engine service is unavailable.
 */
function parseDalfArchiveFallback(
  dalfBase64: string,
  packageId: string,
  packageName?: string,
  packageVersion?: string,
): PackageDetail {
  const archiveBytes = Buffer.from(dalfBase64, 'base64');
  return parseDalfArchive(archiveBytes, packageId, packageName, packageVersion);
}

// ============================================================
// Protobuf Wire Format Constants
// ============================================================

const WIRE_TYPE_VARINT = 0;
const WIRE_TYPE_64BIT = 1;
const WIRE_TYPE_LENGTH_DELIMITED = 2;
const WIRE_TYPE_32BIT = 5;

// ============================================================
// Low-Level Protobuf Decoder
// ============================================================

interface ProtoField {
  fieldNumber: number;
  wireType: number;
  value: number | Uint8Array | bigint;
}

class ProtobufReader {
  private offset = 0;

  constructor(private readonly data: Uint8Array) {}

  get remaining(): number {
    return this.data.length - this.offset;
  }

  readFields(): ProtoField[] {
    const fields: ProtoField[] = [];
    while (this.offset < this.data.length) {
      try {
        const tag = this.readVarint();
        const fieldNumber = Number(tag >> 3n);
        const wireType = Number(tag & 0x07n);

        let value: number | Uint8Array | bigint;

        switch (wireType) {
          case WIRE_TYPE_VARINT:
            value = this.readVarint();
            break;
          case WIRE_TYPE_64BIT:
            value = this.readFixed64();
            break;
          case WIRE_TYPE_LENGTH_DELIMITED:
            value = this.readBytes();
            break;
          case WIRE_TYPE_32BIT:
            value = this.readFixed32();
            break;
          default:
            // Unknown wire type — stop parsing
            return fields;
        }

        fields.push({ fieldNumber, wireType, value });
      } catch {
        break;
      }
    }
    return fields;
  }

  private readVarint(): bigint {
    let result = 0n;
    let shift = 0n;
    while (this.offset < this.data.length) {
      const byte = this.data[this.offset]!;
      this.offset++;
      result |= BigInt(byte & 0x7f) << shift;
      if ((byte & 0x80) === 0) return result;
      shift += 7n;
      if (shift > 63n) throw new Error('Varint too long');
    }
    throw new Error('Unexpected end of data in varint');
  }

  private readFixed64(): bigint {
    if (this.offset + 8 > this.data.length) throw new Error('Unexpected end of data');
    const view = new DataView(this.data.buffer, this.data.byteOffset + this.offset, 8);
    this.offset += 8;
    return view.getBigUint64(0, true);
  }

  private readFixed32(): number {
    if (this.offset + 4 > this.data.length) throw new Error('Unexpected end of data');
    const view = new DataView(this.data.buffer, this.data.byteOffset + this.offset, 4);
    this.offset += 4;
    return view.getUint32(0, true);
  }

  private readBytes(): Uint8Array {
    const length = Number(this.readVarint());
    if (this.offset + length > this.data.length) throw new Error('Unexpected end of data');
    const bytes = this.data.slice(this.offset, this.offset + length);
    this.offset += length;
    return bytes;
  }
}

// ============================================================
// Daml-LF Archive Parser
// ============================================================

/**
 * Parse a DALF archive payload into a PackageDetail.
 *
 * @param archiveBytes - Raw DALF bytes from PackageService.GetPackage.
 * @param packageId - The package ID.
 * @param packageName - Optional package name.
 * @param packageVersion - Optional package version.
 */
export function parseDalfArchive(
  archiveBytes: Uint8Array,
  packageId: string,
  packageName?: string,
  packageVersion?: string,
): PackageDetail {
  const modules: ModuleDetail[] = [];

  try {
    // The archive payload is an ArchivePayload message.
    // Field 2 = Package message, which contains modules.
    const reader = new ProtobufReader(archiveBytes);
    const archiveFields = reader.readFields();

    // Extract the Package message (typically field 3 in DamlLf.Archive or field 2 in ArchivePayload)
    for (const field of archiveFields) {
      if (field.wireType === WIRE_TYPE_LENGTH_DELIMITED && field.value instanceof Uint8Array) {
        // Try to parse as Package
        const packageModules = tryParsePackage(field.value);
        if (packageModules.length > 0) {
          modules.push(...packageModules);
        }
      }
    }
  } catch (err) {
    console.warn(`Failed to parse DALF archive for package ${packageId}:`, err);
  }

  return {
    packageId,
    packageName,
    packageVersion,
    modules,
    hasSource: false, // Source must be extracted from DAR ZIP, not DALF
  };
}

/**
 * Try to parse a protobuf message as a Daml-LF Package.
 * A Package contains repeated Module messages.
 */
function tryParsePackage(bytes: Uint8Array): ModuleDetail[] {
  const modules: ModuleDetail[] = [];
  const reader = new ProtobufReader(bytes);
  const fields = reader.readFields();

  // Interned strings table (Daml-LF uses string interning)
  const internedStrings: string[] = [];
  const internedDottedNames: string[][] = [];

  // First pass: collect interned strings (field 11 in Package)
  for (const field of fields) {
    if (field.fieldNumber === 11 && field.value instanceof Uint8Array) {
      try {
        internedStrings.push(new TextDecoder().decode(field.value));
      } catch {
        internedStrings.push('');
      }
    }
  }

  // Collect interned dotted names (field 12 in Package)
  for (const field of fields) {
    if (field.fieldNumber === 12 && field.value instanceof Uint8Array) {
      const dottedName = parseInternedDottedName(field.value, internedStrings);
      internedDottedNames.push(dottedName);
    }
  }

  // Second pass: parse modules (field 2 in Package)
  for (const field of fields) {
    if (field.fieldNumber === 2 && field.value instanceof Uint8Array) {
      const mod = parseModule(field.value, internedStrings, internedDottedNames);
      if (mod) modules.push(mod);
    }
  }

  return modules;
}

function parseInternedDottedName(bytes: Uint8Array, internedStrings: string[]): string[] {
  const reader = new ProtobufReader(bytes);
  const fields = reader.readFields();
  const segments: string[] = [];

  for (const field of fields) {
    if (field.fieldNumber === 1 && typeof field.value !== 'object') {
      const idx = Number(field.value);
      segments.push(internedStrings[idx] ?? `<interned_${idx}>`);
    }
  }

  return segments;
}

/**
 * Parse a Module message from Daml-LF.
 */
function parseModule(
  bytes: Uint8Array,
  internedStrings: string[],
  internedDottedNames: string[][],
): ModuleDetail | null {
  const reader = new ProtobufReader(bytes);
  const fields = reader.readFields();

  let moduleName = '';
  const templates: TemplateDefinition[] = [];
  const interfaces: InterfaceDefinition[] = [];

  for (const field of fields) {
    // Field 1: module name (DottedName or interned ref)
    if (field.fieldNumber === 1 && field.value instanceof Uint8Array) {
      moduleName = parseDottedName(field.value, internedStrings);
    }
    // Interned module name ref
    if (field.fieldNumber === 8 && typeof field.value !== 'object') {
      const idx = Number(field.value);
      moduleName = (internedDottedNames[idx] ?? []).join('.');
    }
    // Field 3: template definitions
    if (field.fieldNumber === 3 && field.value instanceof Uint8Array) {
      const tmpl = parseTemplate(field.value, internedStrings, internedDottedNames);
      if (tmpl) templates.push(tmpl);
    }
    // Field 11: interface definitions
    if (field.fieldNumber === 11 && field.value instanceof Uint8Array) {
      const iface = parseInterface(field.value, internedStrings, internedDottedNames);
      if (iface) interfaces.push(iface);
    }
  }

  if (!moduleName && templates.length === 0) return null;

  return { name: moduleName, templates, interfaces };
}

function parseDottedName(bytes: Uint8Array, internedStrings: string[]): string {
  const reader = new ProtobufReader(bytes);
  const fields = reader.readFields();
  const segments: string[] = [];

  for (const field of fields) {
    if (field.fieldNumber === 1) {
      if (field.value instanceof Uint8Array) {
        segments.push(new TextDecoder().decode(field.value));
      } else {
        const idx = Number(field.value);
        segments.push(internedStrings[idx] ?? `<${idx}>`);
      }
    }
  }

  return segments.join('.');
}

/**
 * Parse a Template definition from Daml-LF.
 */
function parseTemplate(
  bytes: Uint8Array,
  internedStrings: string[],
  internedDottedNames: string[][],
): TemplateDefinition | null {
  const reader = new ProtobufReader(bytes);
  const fields = reader.readFields();

  let name = '';
  const templateFields: FieldDefinition[] = [];
  const choices: ChoiceDefinition[] = [];
  let key: KeyDefinition | undefined;

  for (const field of fields) {
    // Field 1: template name (DottedName)
    if (field.fieldNumber === 1 && field.value instanceof Uint8Array) {
      name = parseDottedName(field.value, internedStrings);
    }
    // Interned template name
    if (field.fieldNumber === 12 && typeof field.value !== 'object') {
      const idx = Number(field.value);
      name = (internedDottedNames[idx] ?? []).join('.');
    }
    // Field 3: param (record type defining the template fields)
    if (field.fieldNumber === 3 && field.value instanceof Uint8Array) {
      templateFields.push(...parseTypeFields(field.value, internedStrings, internedDottedNames));
    }
    // Field 4: choices
    if (field.fieldNumber === 4 && field.value instanceof Uint8Array) {
      const choice = parseChoice(field.value, internedStrings, internedDottedNames);
      if (choice) choices.push(choice);
    }
    // Field 8: template key
    if (field.fieldNumber === 8 && field.value instanceof Uint8Array) {
      key = parseTemplateKey(field.value, internedStrings);
    }
  }

  if (!name) return null;

  return {
    name,
    fields: templateFields,
    choices,
    key,
    signatoryExpression: '<from DALF>',
    observerExpression: '<from DALF>',
    implements: [],
  };
}

function parseTypeFields(
  bytes: Uint8Array,
  internedStrings: string[],
  _internedDottedNames: string[][],
): FieldDefinition[] {
  const fields: FieldDefinition[] = [];
  const reader = new ProtobufReader(bytes);
  const protoFields = reader.readFields();

  for (const field of protoFields) {
    if (field.value instanceof Uint8Array) {
      // Each field in a record type
      const fieldReader = new ProtobufReader(field.value);
      const subFields = fieldReader.readFields();
      let fieldName = '';
      let fieldType = 'unknown';

      for (const sf of subFields) {
        if (sf.fieldNumber === 1 && sf.value instanceof Uint8Array) {
          fieldName = new TextDecoder().decode(sf.value);
        } else if (sf.fieldNumber === 2 && typeof sf.value !== 'object') {
          const idx = Number(sf.value);
          fieldName = internedStrings[idx] ?? `field_${idx}`;
        }
      }

      if (fieldName) {
        fields.push({
          name: fieldName,
          type: fieldType,
          optional: false,
        });
      }
    }
  }

  return fields;
}

function parseChoice(
  bytes: Uint8Array,
  internedStrings: string[],
  internedDottedNames: string[][],
): ChoiceDefinition | null {
  const reader = new ProtobufReader(bytes);
  const fields = reader.readFields();

  let name = '';
  let consuming = true;
  const parameters: FieldDefinition[] = [];

  for (const field of fields) {
    // Field 1: choice name
    if (field.fieldNumber === 1 && field.value instanceof Uint8Array) {
      name = new TextDecoder().decode(field.value);
    }
    // Interned choice name
    if (field.fieldNumber === 9 && typeof field.value !== 'object') {
      const idx = Number(field.value);
      name = internedStrings[idx] ?? `choice_${idx}`;
    }
    // Field 2: consuming
    if (field.fieldNumber === 2 && typeof field.value !== 'object') {
      consuming = Number(field.value) !== 0;
    }
  }

  if (!name) return null;

  return {
    name,
    consuming,
    parameters,
    returnType: 'unknown',
    controllerExpression: '<from DALF>',
  };
}

function parseTemplateKey(
  bytes: Uint8Array,
  _internedStrings: string[],
): KeyDefinition {
  return {
    type: 'unknown',
    expression: '<from DALF>',
    maintainerExpression: '<from DALF>',
  };
}

function parseInterface(
  bytes: Uint8Array,
  internedStrings: string[],
  internedDottedNames: string[][],
): InterfaceDefinition | null {
  const reader = new ProtobufReader(bytes);
  const fields = reader.readFields();

  let name = '';
  const methods: FieldDefinition[] = [];
  const choices: ChoiceDefinition[] = [];

  for (const field of fields) {
    if (field.fieldNumber === 1 && field.value instanceof Uint8Array) {
      name = parseDottedName(field.value, internedStrings);
    }
    if (field.fieldNumber === 6 && typeof field.value !== 'object') {
      const idx = Number(field.value);
      name = (internedDottedNames[idx] ?? []).join('.');
    }
    if (field.fieldNumber === 3 && field.value instanceof Uint8Array) {
      const choice = parseChoice(field.value, internedStrings, internedDottedNames);
      if (choice) choices.push(choice);
    }
  }

  if (!name) return null;

  return { name, methods, choices };
}

// ============================================================
// DAR ZIP Source Extraction
// ============================================================

/**
 * Extract .daml source files from a DAR archive (ZIP format).
 *
 * DARs are ZIP files that MAY contain original .daml source files.
 * Source files are NOT guaranteed to be present (often stripped in production).
 *
 * @param darBytes - Raw DAR file bytes.
 * @returns Map of filename -> source content, or empty if no source found.
 */
export function extractSourceFromDAR(darBytes: Uint8Array): Record<string, string> {
  const sources: Record<string, string> = {};

  try {
    // Simple ZIP parser for .daml files
    // ZIP files end with an end-of-central-directory record
    const entries = parseZipEntries(darBytes);

    for (const entry of entries) {
      if (entry.name.endsWith('.daml')) {
        try {
          sources[entry.name] = new TextDecoder().decode(entry.data);
        } catch {
          // Skip malformed entries
        }
      }
    }
  } catch {
    // DAR is not a valid ZIP or has no source files
  }

  return sources;
}

interface ZipEntry {
  name: string;
  data: Uint8Array;
}

/**
 * Minimal ZIP parser — extracts file entries from a ZIP archive.
 * Only handles stored (uncompressed) entries for simplicity.
 * Production would use a proper ZIP library.
 */
function parseZipEntries(data: Uint8Array): ZipEntry[] {
  const entries: ZipEntry[] = [];
  let offset = 0;

  while (offset < data.length - 4) {
    const signature = readUint32LE(data, offset);

    // Local file header signature
    if (signature !== 0x04034b50) break;

    const compressionMethod = readUint16LE(data, offset + 8);
    const compressedSize = readUint32LE(data, offset + 18);
    const fileNameLength = readUint16LE(data, offset + 26);
    const extraFieldLength = readUint16LE(data, offset + 28);

    const nameStart = offset + 30;
    const nameEnd = nameStart + fileNameLength;
    const fileName = new TextDecoder().decode(data.slice(nameStart, nameEnd));

    const dataStart = nameEnd + extraFieldLength;
    const dataEnd = dataStart + compressedSize;

    // Only handle stored (uncompressed) entries
    if (compressionMethod === 0 && dataEnd <= data.length) {
      entries.push({
        name: fileName,
        data: data.slice(dataStart, dataEnd),
      });
    }

    offset = dataEnd;
  }

  return entries;
}

function readUint16LE(data: Uint8Array, offset: number): number {
  return (data[offset]! | (data[offset + 1]! << 8));
}

function readUint32LE(data: Uint8Array, offset: number): number {
  return (
    data[offset]! |
    (data[offset + 1]! << 8) |
    (data[offset + 2]! << 16) |
    ((data[offset + 3]! << 24) >>> 0)
  );
}
