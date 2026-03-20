/**
 * PackageService wrapper — ListPackages, GetPackage
 *
 * Used for Template Explorer and payload decoding.
 * Does not require party-specific rights — only authenticated user JWT.
 */

import type * as grpc from '@grpc/grpc-js';
import type { ListPackagesResponse, GetPackageResponse } from '../proto/types.js';
import { createMetadata, makeUnaryCall } from './shared.js';
import type { PackageSummary } from '../../types.js';

export interface PackageArchive {
  archivePayload: Uint8Array;
  hash: string;
  hashFunction: string;
  packageName?: string;
  packageVersion?: string;
}

export class PackageServiceClient {
  constructor(
    private readonly client: grpc.Client,
    private readonly getToken: () => string | null,
  ) {}

  /**
   * List all deployed package IDs.
   */
  async listPackages(): Promise<string[]> {
    const metadata = createMetadata(this.getToken());
    const response = await makeUnaryCall<object, ListPackagesResponse>(
      this.client,
      'ListPackages',
      {},
      metadata,
    );
    return response.package_ids ?? [];
  }

  /**
   * Get a specific package's DALF archive bytes and metadata.
   *
   * @param packageId - The package ID to fetch.
   */
  async getPackage(packageId: string): Promise<PackageArchive> {
    const metadata = createMetadata(this.getToken());
    const response = await makeUnaryCall<{ package_id: string }, GetPackageResponse>(
      this.client,
      'GetPackage',
      { package_id: packageId },
      metadata,
    );

    return {
      archivePayload: response.archive_payload,
      hash: response.hash,
      hashFunction: response.hash_function === 0 ? 'SHA256' : `UNKNOWN_${response.hash_function}`,
      packageName: response.package_name ?? undefined,
      packageVersion: response.package_version ?? undefined,
    };
  }

  /**
   * List all packages with their metadata.
   *
   * Uses PackageService.ListVettedPackages (Canton 3.4+) which includes
   * package_name and package_version directly, avoiding N+1 GetPackage calls.
   * Falls back to ListPackages + individual GetPackage calls if ListVettedPackages
   * is unavailable.
   */
  async listPackagesWithMetadata(): Promise<PackageSummary[]> {
    // Try ListVettedPackages first (Canton 3.4+ has this)
    try {
      const response = await makeUnaryCall<Record<string, unknown>, { vetted_packages?: Array<{ packages?: Array<{ package_id: string; package_name?: string; package_version?: string }> }> }>(
        this.client,
        'ListVettedPackages',
        {},
        createMetadata(this.getToken()),
      );

      const summaries: PackageSummary[] = [];
      for (const group of response.vetted_packages ?? []) {
        for (const pkg of group.packages ?? []) {
          summaries.push({
            packageId: pkg.package_id,
            packageName: pkg.package_name || undefined,
            packageVersion: pkg.package_version || undefined,
          });
        }
      }

      if (summaries.length > 0) {
        return summaries;
      }
    } catch {
      // ListVettedPackages may not be available; fall through to legacy approach
    }

    // Fallback: ListPackages + individual GetPackage
    const packageIds = await this.listPackages();
    const summaries: PackageSummary[] = [];

    const batchSize = 10;
    for (let i = 0; i < packageIds.length; i += batchSize) {
      const batch = packageIds.slice(i, i + batchSize);
      const results = await Promise.allSettled(
        batch.map(async (id) => {
          try {
            const pkg = await this.getPackage(id);
            return {
              packageId: id,
              packageName: pkg.packageName,
              packageVersion: pkg.packageVersion,
            };
          } catch {
            return { packageId: id };
          }
        }),
      );

      for (const result of results) {
        if (result.status === 'fulfilled') {
          summaries.push(result.value);
        }
      }
    }

    return summaries;
  }
}
