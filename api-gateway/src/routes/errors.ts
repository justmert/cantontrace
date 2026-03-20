/**
 * Error Knowledge Base Routes
 *
 * GET /api/v1/errors/:errorCode — Look up error in knowledge base (PostgreSQL)
 *
 * CRITICAL: Never parse HUMAN_READABLE_MESSAGE — match on ERROR_CODE_ID and CATEGORY_ID only.
 */

import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { ERROR_CATEGORIES, categoryIdToErrorCategory } from '../canton/errors.js';
import type { ErrorCategory } from '../types.js';

export function registerErrorRoutes(app: FastifyInstance, pgPool: Pool | null): void {
  /**
   * GET /api/v1/errors/:errorCode
   *
   * Look up a Canton error code in the knowledge base.
   * Returns explanation, common causes, and suggested fixes.
   *
   * Falls back to built-in error category information if the knowledge base
   * doesn't have a specific entry.
   */
  app.get<{
    Params: { errorCode: string };
    Querystring: { categoryId?: string };
  }>('/api/v1/errors/:errorCode', {
    schema: {
      description: 'Look up Canton error code in knowledge base',
      tags: ['Error Debugger'],
      params: {
        type: 'object',
        required: ['errorCode'],
        properties: {
          errorCode: { type: 'string', description: 'Canton ERROR_CODE_ID' },
        },
      },
      querystring: {
        type: 'object',
        properties: {
          categoryId: { type: 'string', description: 'Numeric category ID (1-11)' },
        },
      },
    },
  }, async (request, reply) => {
    const { errorCode } = request.params;
    const { categoryId } = request.query;

    // Try PostgreSQL knowledge base first
    if (pgPool) {
      try {
        const result = await pgPool.query(
          `SELECT error_code_id, category, explanation, common_causes, suggested_fixes,
                  grpc_status_code, documentation_url, severity, is_retryable
           FROM canton_errors
           WHERE error_code_id = $1`,
          [errorCode],
        );

        if (result.rows.length > 0) {
          const row = result.rows[0];
          return reply.send({
            data: {
              errorCodeId: row.error_code_id,
              category: row.category,
              grpcStatusCode: row.grpc_status_code,
              explanation: row.explanation,
              commonCauses: row.common_causes ?? [],
              suggestedFixes: row.suggested_fixes ?? [],
              documentationUrl: row.documentation_url,
              severity: row.severity,
              isRetryable: row.is_retryable,
            },
            meta: {
              source: 'knowledge_base',
              timestamp: new Date().toISOString(),
            },
          });
        }
      } catch (err) {
        request.log.warn({ err, errorCode }, 'Knowledge base query failed, falling back to built-in');
      }
    }

    // Fall back to built-in error category information
    const category = categoryId
      ? categoryIdToErrorCategory(categoryId)
      : guessCategory(errorCode);

    if (category) {
      const info = ERROR_CATEGORIES[category];
      return reply.send({
        data: {
          errorCodeId: errorCode,
          category: info.category,
          grpcStatusCode: info.grpcCodeName,
          explanation: info.description,
          commonCauses: getCommonCauses(category),
          suggestedFixes: getSuggestedFixes(category),
          debuggerHandling: info.debuggerHandling,
        },
        meta: {
          source: 'built_in',
          timestamp: new Date().toISOString(),
        },
      });
    }

    return reply.code(404).send({
      code: 'ERROR_CODE_NOT_FOUND',
      message: `Error code '${errorCode}' not found in knowledge base. ` +
        'Provide a categoryId parameter for built-in category information.',
    });
  });

  /**
   * GET /api/v1/errors
   *
   * List all known error categories and their gRPC status code mappings.
   */
  app.get('/api/v1/errors', {
    schema: {
      description: 'List all Canton error categories',
      tags: ['Error Debugger'],
    },
  }, async (_request, reply) => {
    const categories = Object.values(ERROR_CATEGORIES).map((info) => ({
      category: info.category,
      grpcCode: info.grpcCode,
      grpcCodeName: info.grpcCodeName,
      description: info.description,
      debuggerHandling: info.debuggerHandling,
    }));

    return reply.send({
      data: categories,
      meta: {
        totalCount: categories.length,
        timestamp: new Date().toISOString(),
      },
    });
  });
}

/**
 * Attempt to guess the error category from the error code ID.
 * Canton error codes follow naming conventions that hint at the category.
 */
function guessCategory(errorCode: string): ErrorCategory | null {
  const upper = errorCode.toUpperCase();

  if (upper.includes('AUTH') || upper.includes('PERMISSION') || upper.includes('TOKEN'))
    return 'AuthInterceptorInvalidAuthenticationCredentials';
  if (upper.includes('CONTENTION') || upper.includes('CONFLICT'))
    return 'ContentionOnSharedResources';
  if (upper.includes('NOT_FOUND') || upper.includes('MISSING'))
    return 'InvalidGivenCurrentSystemStateResourceMissing';
  if (upper.includes('ALREADY_EXISTS') || upper.includes('DUPLICATE'))
    return 'InvalidGivenCurrentSystemStateResourceExists';
  if (upper.includes('INVALID') || upper.includes('MALFORMED'))
    return 'InvalidIndependentOfSystemState';
  if (upper.includes('TIMEOUT') || upper.includes('DEADLINE'))
    return 'DeadlineExceededRequestStateUnknown';
  if (upper.includes('UNSUPPORTED') || upper.includes('UNIMPLEMENTED'))
    return 'InternalUnsupportedOperation';

  return null;
}

function getCommonCauses(category: ErrorCategory): string[] {
  const causes: Record<ErrorCategory, string[]> = {
    InvalidIndependentOfSystemState: [
      'Malformed command payload (wrong field types, missing required fields)',
      'Unsupported Daml-LF version in the package',
      'Empty key maintainer set',
      'Invalid template or choice reference',
    ],
    AuthInterceptorInvalidAuthenticationCredentials: [
      'Expired JWT token',
      'Wrong audience claim in JWT',
      'Missing or malformed Authorization header',
      'Token issuer not recognized by participant',
    ],
    InvalidGivenCurrentSystemStateOther: [
      'Package not vetted on the participant',
      'Party not enabled for the given synchronizer',
      'Command deduplication period violated',
      'Synchronizer paused or in maintenance',
    ],
    InvalidGivenCurrentSystemStateResourceMissing: [
      'Contract was archived by another transaction',
      'Contract was pruned from the participant',
      'Party does not exist on this participant',
      'Package has been unvetted',
    ],
    InvalidGivenCurrentSystemStateResourceExists: [
      'Duplicate contract key (unique key constraint)',
      'Command ID already used within deduplication window',
    ],
    ContentionOnSharedResources: [
      'Two transactions trying to archive the same contract (UTXO contention)',
      'Interpretation time exceeded (complex transaction)',
      'Resource limits exceeded on the participant',
    ],
    DeadlineExceededRequestStateUnknown: [
      'Network latency between client and participant',
      'Sequencer is overloaded or unreachable',
      'Transaction confirmation took longer than the deadline',
    ],
    TransientServerFailure: [
      'Database connection pool exhausted',
      'PostgreSQL serialization failure under high concurrency',
      'Temporary network partition',
    ],
    SystemInternalAssumptionViolated: [
      'Bug in the Canton node software',
      'Data corruption detected',
      'Unexpected internal state',
    ],
    MaliciousOrFaultyBehaviour: [
      'Details deliberately hidden for security reasons',
      'Potential tampering or invalid signatures detected',
    ],
    InternalUnsupportedOperation: [
      'Calling an API endpoint not supported by this participant version',
      'Feature not available in the open-source edition',
    ],
  };

  return causes[category] ?? [];
}

function getSuggestedFixes(category: ErrorCategory): string[] {
  const fixes: Record<ErrorCategory, string[]> = {
    InvalidIndependentOfSystemState: [
      'Validate command payload against the template schema',
      'Ensure package version compatibility',
      'Check Template Explorer for correct field definitions',
    ],
    AuthInterceptorInvalidAuthenticationCredentials: [
      'Refresh the JWT token',
      'Verify the audience claim matches the participant ID',
      'Check that the IAM URL is correct',
      'Note: Canton strips exact auth failure cause from the API response — check server-side logs for details',
    ],
    InvalidGivenCurrentSystemStateOther: [
      'Refresh the ACS and retry',
      'Check package vetting status',
      'Verify party allocation on the synchronizer',
    ],
    InvalidGivenCurrentSystemStateResourceMissing: [
      'Use Contract Lifecycle Tracker to see when the resource was removed',
      'Check if the resource was pruned (compare with pruning offset)',
      'Verify the contract ID is correct',
    ],
    InvalidGivenCurrentSystemStateResourceExists: [
      'Check deduplication — use a unique command ID',
      'Verify contract key uniqueness',
      'Review the Completion status of the original command',
    ],
    ContentionOnSharedResources: [
      'Implement retry logic with exponential backoff',
      'Use the Contention Timeline to identify the competing transaction',
      'Consider restructuring the workflow to reduce lock contention',
    ],
    DeadlineExceededRequestStateUnknown: [
      'Check command completion status — the transaction may have succeeded',
      'Increase the command timeout',
      'Monitor sequencer health',
    ],
    TransientServerFailure: [
      'Retry the operation after the suggested delay (check RetryInfo)',
      'Contact the participant operator if persistent',
    ],
    SystemInternalAssumptionViolated: [
      'Report to participant operator — this is likely a software bug',
      'Save the correlation ID for debugging',
    ],
    MaliciousOrFaultyBehaviour: [
      'Details are intentionally hidden for security — contact operator',
      'Save the correlation ID for investigation',
    ],
    InternalUnsupportedOperation: [
      'Check the API version compatibility (GET /api/v1/health)',
      'Consider upgrading the participant node',
    ],
  };

  return fixes[category] ?? [];
}
