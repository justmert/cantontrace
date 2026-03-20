/**
 * Package Routes
 *
 * GET /api/v1/packages                  — List all packages
 * GET /api/v1/packages/:id/templates    — Parse DALF, return template definitions
 */

import type { FastifyInstance } from 'fastify';
import { requireCantonContext } from '../middleware/canton-context.js';
import { parseDalfViaEngine } from '../services/package-parser.js';
import { registerPackageMetadata } from '../services/payload-decoder.js';
import type { CacheService } from '../services/cache.js';
import type { PackageDetail, PackageSummary, ApiResponse } from '../types.js';

export function registerPackageRoutes(app: FastifyInstance, cache: CacheService): void {
  /**
   * GET /api/v1/packages
   *
   * List all deployed packages with metadata.
   */
  app.get('/api/v1/packages', {
    schema: {
      description: 'List all deployed packages',
      tags: ['Template Explorer'],
    },
  }, async (request, reply) => {
    const { client } = requireCantonContext(request);

    // Try cached summaries first
    const cached = await cache.getPackageSummaries();
    if (cached) {
      return reply.send({
        data: cached,
        meta: {
          totalCount: cached.length,
          timestamp: new Date().toISOString(),
        },
      } satisfies ApiResponse<PackageSummary[]>);
    }

    // Fetch fresh data
    const packages = await client.packageService.listPackagesWithMetadata();
    await cache.setPackageSummaries(packages);

    return reply.send({
      data: packages,
      meta: {
        totalCount: packages.length,
        timestamp: new Date().toISOString(),
      },
    } satisfies ApiResponse<PackageSummary[]>);
  });

  /**
   * GET /api/v1/packages/:id/templates
   *
   * Parse the DALF archive for a package and return template definitions.
   * This triggers Daml-LF protobuf parsing to extract template/choice/field metadata.
   */
  app.get<{
    Params: { id: string };
  }>('/api/v1/packages/:id/templates', {
    schema: {
      description: 'Parse package DALF and return template definitions',
      tags: ['Template Explorer'],
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', description: 'Package ID' },
        },
      },
    },
  }, async (request, reply) => {
    const { client } = requireCantonContext(request);
    const { id: packageId } = request.params;

    // Check cache first
    const cachedDetail = await cache.getPackageDetail(packageId);
    if (cachedDetail) {
      return reply.send({
        data: cachedDetail,
        meta: { timestamp: new Date().toISOString() },
      } satisfies ApiResponse<PackageDetail>);
    }

    // Fetch package bytes from Canton
    const packageArchive = await client.packageService.getPackage(packageId);

    // Base64-encode the DALF bytes for the engine service
    const dalfBase64 = Buffer.from(packageArchive.archivePayload).toString('base64');

    // Parse via the Scala engine service (has the real daml-lf-archive-reader)
    const detail = await parseDalfViaEngine(
      dalfBase64,
      packageId,
      packageArchive.packageName,
      packageArchive.packageVersion,
    );

    // Register for payload decoding
    registerPackageMetadata(detail);

    // Cache the parsed result
    await cache.setPackageDetail(packageId, detail);

    // Also cache the raw bytes for future use (e.g., decompile endpoint)
    await cache.setPackageBytes(packageId, Buffer.from(packageArchive.archivePayload));

    return reply.send({
      data: detail,
      meta: { timestamp: new Date().toISOString() },
    } satisfies ApiResponse<PackageDetail>);
  });
}
