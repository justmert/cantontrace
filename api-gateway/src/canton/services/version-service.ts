/**
 * VersionService wrapper — GetLedgerApiVersion
 *
 * Used in bootstrap sequence to discover API version and feature descriptors.
 */

import type * as grpc from '@grpc/grpc-js';
import type { GetLedgerApiVersionResponse, FeaturesDescriptor } from '../proto/types.js';
import { makeUnaryCall, createMetadata } from './shared.js';

export interface VersionInfo {
  version: string;
  features: FeaturesDescriptor;
}

export class VersionServiceClient {
  constructor(
    private readonly client: grpc.Client,
    private readonly getToken: () => string | null,
  ) {}

  async getLedgerApiVersion(): Promise<VersionInfo> {
    const metadata = createMetadata(this.getToken());
    const response = await makeUnaryCall<object, GetLedgerApiVersionResponse>(
      this.client,
      'GetLedgerApiVersion',
      {},
      metadata,
    );

    return {
      version: response.version,
      features: response.features ?? {},
    };
  }
}

export function mapFeatureDescriptors(
  features: FeaturesDescriptor,
): Array<{ name: string; version: string }> {
  const result: Array<{ name: string; version: string }> = [];

  for (const [name, value] of Object.entries(features)) {
    if (value && typeof value === 'object' && 'supported' in value) {
      result.push({ name, version: String((value as Record<string, unknown>).supported) });
    } else if (value !== null && value !== undefined) {
      result.push({ name, version: typeof value === 'string' ? value : 'supported' });
    }
  }

  return result;
}
