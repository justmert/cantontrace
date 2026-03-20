/**
 * ACS (Active Contract Set) Routes
 *
 * GET /api/v1/acs — Query active contracts
 *
 * CRITICAL: active_at_offset is REQUIRED in Canton 3.5.
 * Must call GetLedgerEnd first if no offset specified.
 * Check pruning boundary before historical queries.
 */

import type { FastifyInstance } from 'fastify';
import { requireCantonContext } from '../middleware/canton-context.js';
import { PruningServiceClient } from '../canton/services/pruning-service.js';
import type { CacheService } from '../services/cache.js';
import type { ACSResponse, ApiResponse, TemplateId } from '../types.js';

export function registerACSRoutes(app: FastifyInstance, cache: CacheService): void {
  /**
   * GET /api/v1/acs
   *
   * Query active contracts with server-side filtering.
   *
   * Query params:
   *   offset     — Snapshot offset (defaults to current via GetLedgerEnd)
   *   templates  — Comma-separated template IDs (package:module:entity format)
   *   parties    — Comma-separated party IDs
   *   pageSize   — Max contracts per page (default 100)
   *   pageToken  — Pagination token for next page
   */
  app.get<{
    Querystring: {
      offset?: string;
      templates?: string;
      parties?: string;
      pageSize?: string;
      pageToken?: string;
    };
  }>('/api/v1/acs', {
    schema: {
      description: 'Query Active Contract Set with time-travel support',
      tags: ['ACS Inspector'],
      querystring: {
        type: 'object',
        properties: {
          offset: { type: 'string', description: 'Snapshot offset (active_at_offset). Defaults to current ledger end.' },
          templates: { type: 'string', description: 'Comma-separated template filter (package:module:entity)' },
          parties: { type: 'string', description: 'Comma-separated party filter' },
          pageSize: { type: 'string', description: 'Page size (default 100, max 1000)' },
          pageToken: { type: 'string', description: 'Pagination token' },
        },
      },
    },
  }, async (request, reply) => {
    const { client, bootstrapInfo } = requireCantonContext(request);
    const { offset, templates, parties, pageSize: pageSizeStr, pageToken } = request.query;

    // Parse parties — required for TransactionFilter
    // Priority: explicit query param > userRights (CanReadAs/CanActAs) > knownParties from bootstrap
    let partyList: string[];
    if (parties) {
      partyList = parties.split(',').map((p) => p.trim()).filter(Boolean);
    } else {
      partyList = getPartiesFromUserRights(bootstrapInfo.userRights);
      if (partyList.length === 0 && bootstrapInfo.knownParties?.length > 0) {
        partyList = bootstrapInfo.knownParties;
      }
    }

    if (partyList.length === 0) {
      return reply.code(400).send({
        code: 'MISSING_PARTIES',
        message: 'At least one party is required. Provide via query param, user rights, or connect to a participant with known parties.',
      });
    }

    // Parse template filter
    const templateFilter = templates
      ? parseTemplateIds(templates)
      : undefined;

    // Parse page size
    const pageSize = Math.min(Math.max(parseInt(pageSizeStr ?? '100', 10) || 100, 1), 1000);

    // Determine the active_at_offset
    let activeAtOffset = offset;

    if (!activeAtOffset) {
      // REQUIRED: Must call GetLedgerEnd to get current offset
      activeAtOffset = await client.stateService.getLedgerEnd();
    }

    // Check pruning boundary for historical queries
    if (offset && bootstrapInfo.pruningOffset) {
      if (PruningServiceClient.isOffsetPruned(offset, bootstrapInfo.pruningOffset)) {
        const prunedBefore = bootstrapInfo.pruningOffset;

        return reply.send({
          data: {
            contracts: [],
            offset: activeAtOffset,
            isPruned: true,
            prunedBefore,
          },
          meta: {
            offset: activeAtOffset,
            timestamp: new Date().toISOString(),
          },
        } satisfies ApiResponse<ACSResponse>);
      }
    }

    // Normalize template filter string for cache key.
    // When templates are provided, include the raw query string in the cache key
    // so filtered and unfiltered results are never mixed up.
    const templateCacheKey = templates?.trim() || undefined;

    // Check cache first — use the template-aware key so that a cached "all
    // contracts" result is never returned for a filtered request (and vice-versa).
    const cached = await cache.getACSSnapshot(activeAtOffset, partyList, templateCacheKey);
    if (cached) {
      const paginated = paginateContracts(cached, pageSize, pageToken);
      return reply.send({
        data: {
          contracts: paginated.items,
          offset: activeAtOffset,
          nextPageToken: paginated.nextToken,
          isPruned: false,
        },
        meta: {
          offset: activeAtOffset,
          timestamp: new Date().toISOString(),
          pageToken: paginated.nextToken,
          totalCount: cached.length,
        },
      } satisfies ApiResponse<ACSResponse>);
    }

    // Fetch from Canton
    const result = await client.stateService.getActiveContracts(
      activeAtOffset,
      partyList,
      templateFilter,
    );

    // Apply client-side template filtering as a fallback.
    // Canton's server-side template filtering via event_format may not work
    // in all configurations (e.g., when package_id is empty or the filter
    // format is not fully supported). For sandbox-sized ACS this is fine.
    let filteredContracts = result.contracts;
    if (templateFilter && templateFilter.length > 0) {
      filteredContracts = result.contracts.filter((contract) =>
        templateFilter.some((tf) => {
          const moduleMatch = !tf.moduleName || contract.templateId.moduleName === tf.moduleName;
          const entityMatch = !tf.entityName || contract.templateId.entityName === tf.entityName;
          const packageMatch = !tf.packageName || contract.templateId.packageName === tf.packageName;
          return moduleMatch && entityMatch && packageMatch;
        }),
      );
    }

    // Cache the result (include template filter in cache key to avoid stale results)
    await cache.setACSSnapshot(activeAtOffset, partyList, filteredContracts, templateCacheKey);

    // Paginate
    const paginated = paginateContracts(filteredContracts, pageSize, pageToken);

    const response: ApiResponse<ACSResponse> = {
      data: {
        contracts: paginated.items,
        offset: result.offset,
        nextPageToken: paginated.nextToken,
        isPruned: false,
      },
      meta: {
        offset: result.offset,
        timestamp: new Date().toISOString(),
        pageToken: paginated.nextToken,
        totalCount: filteredContracts.length,
      },
    };

    return reply.send(response);
  });
}

// ============================================================
// Helpers
// ============================================================

function parseTemplateIds(templates: string): TemplateId[] {
  return templates.split(',').map((t) => {
    const parts = t.trim().split(':');
    // Support both 2-part (moduleName:entityName) and 3-part
    // (packageName:moduleName:entityName) formats.
    if (parts.length === 2) {
      return {
        packageName: '',
        moduleName: parts[0] ?? '',
        entityName: parts[1] ?? '',
      };
    }
    return {
      packageName: parts[0] ?? '',
      moduleName: parts[1] ?? '',
      entityName: parts[2] ?? '',
    };
  }).filter((t) => t.moduleName && t.entityName);
}

function getPartiesFromUserRights(
  rights: Array<{ type: string; party?: string }>,
): string[] {
  const parties = new Set<string>();
  for (const right of rights) {
    if ('party' in right && right.party) {
      parties.add(right.party);
    }
  }
  return Array.from(parties);
}

function paginateContracts<T>(
  items: T[],
  pageSize: number,
  pageToken?: string,
): { items: T[]; nextToken?: string } {
  let startIndex = 0;

  if (pageToken) {
    startIndex = parseInt(pageToken, 10) || 0;
  }

  const endIndex = startIndex + pageSize;
  const page = items.slice(startIndex, endIndex);
  const nextToken = endIndex < items.length ? String(endIndex) : undefined;

  return { items: page, nextToken };
}
