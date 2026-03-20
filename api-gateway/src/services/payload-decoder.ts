/**
 * Payload Decoder
 *
 * Decodes Daml-LF JSON encoded payloads into human-readable JSON
 * using package metadata for field name resolution.
 */

import type { PackageDetail, TemplateId, FieldDefinition } from '../types.js';

// Package metadata cache for field resolution
const packageMetadataCache = new Map<string, PackageDetail>();

/**
 * Register package metadata for field name resolution.
 */
export function registerPackageMetadata(detail: PackageDetail): void {
  packageMetadataCache.set(detail.packageId, detail);
  if (detail.packageName) {
    packageMetadataCache.set(detail.packageName, detail);
  }
}

/**
 * Clear all cached package metadata.
 */
export function clearPackageMetadata(): void {
  packageMetadataCache.clear();
}

/**
 * Decode a Daml-LF Value payload into a human-readable object.
 *
 * The payload from Canton may use numeric field indices instead of names
 * in non-verbose mode. This decoder maps them back to named fields
 * using the package metadata.
 *
 * @param payload - The raw payload from Canton.
 * @param templateId - The template identifier for field resolution.
 * @param verbose - Whether the payload already has verbose field names.
 */
export function decodePayload(
  payload: Record<string, unknown>,
  templateId: TemplateId,
  verbose = true,
): Record<string, unknown> {
  if (verbose) {
    // Verbose mode: field names are already present, just normalize
    return normalizePayload(payload);
  }

  // Non-verbose mode: need to resolve field indices to names
  const fields = resolveTemplateFields(templateId);
  if (!fields || fields.length === 0) {
    return payload; // Can't resolve — return as-is
  }

  return mapFieldIndicesToNames(payload, fields);
}

/**
 * Normalize a payload: convert Daml-LF JSON encoding quirks to plain JSON.
 */
function normalizePayload(payload: unknown): Record<string, unknown> {
  if (!payload || typeof payload !== 'object') return {};

  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(payload as Record<string, unknown>)) {
    result[key] = normalizeValue(value);
  }

  return result;
}

/**
 * Normalize a single value from Daml-LF JSON encoding.
 */
function normalizeValue(value: unknown): unknown {
  if (value === null || value === undefined) return null;

  if (typeof value !== 'object') return value;

  // Array values
  if (Array.isArray(value)) {
    return value.map(normalizeValue);
  }

  const obj = value as Record<string, unknown>;

  // Daml-LF JSON uses tagged variants for some types
  // e.g., { "tag": "Some", "value": ... } for Optional
  if ('tag' in obj && 'value' in obj) {
    const tag = obj.tag;
    if (tag === 'None') return null;
    if (tag === 'Some') return normalizeValue(obj.value);
    // Other variant constructors
    return {
      tag: tag,
      value: normalizeValue(obj.value),
    };
  }

  // Numeric types encoded as strings
  if ('unumeric' in obj) return obj.unumeric;
  if ('int64' in obj) return obj.int64;

  // Contract ID references
  if ('contractId' in obj) return { contractId: obj.contractId };

  // Party
  if ('party' in obj) return obj.party;

  // Nested record
  return normalizePayload(obj);
}

/**
 * Resolve template fields from cached package metadata.
 */
function resolveTemplateFields(templateId: TemplateId): FieldDefinition[] | null {
  const detail = packageMetadataCache.get(templateId.packageName);
  if (!detail) return null;

  for (const mod of detail.modules) {
    if (mod.name === templateId.moduleName) {
      for (const tmpl of mod.templates) {
        if (tmpl.name === templateId.entityName) {
          return tmpl.fields;
        }
      }
    }
  }

  return null;
}

/**
 * Map numeric field indices to named fields using template metadata.
 */
function mapFieldIndicesToNames(
  payload: Record<string, unknown>,
  fields: FieldDefinition[],
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(payload)) {
    // If key is a numeric index, map to field name
    const index = parseInt(key, 10);
    if (!isNaN(index) && index >= 0 && index < fields.length) {
      const fieldDef = fields[index];
      if (fieldDef) {
        result[fieldDef.name] = normalizeValue(value);
        continue;
      }
    }

    // Otherwise keep the original key
    result[key] = normalizeValue(value);
  }

  return result;
}

/**
 * Encode a human-readable payload back to Daml-LF JSON format
 * for submission to the Canton API.
 *
 * @param payload - Human-readable object.
 * @param templateId - Template for field resolution.
 */
export function encodePayload(
  payload: Record<string, unknown>,
  _templateId: TemplateId,
): Record<string, unknown> {
  return encodeValue(payload) as Record<string, unknown>;
}

function encodeValue(value: unknown): unknown {
  if (value === null || value === undefined) return { tag: 'None', value: {} };

  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value;

  if (Array.isArray(value)) {
    return value.map(encodeValue);
  }

  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;

    // Pass through already-encoded values
    if ('tag' in obj) return obj;
    if ('contractId' in obj) return obj;

    // Encode as record
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      result[k] = encodeValue(v);
    }
    return result;
  }

  return value;
}
