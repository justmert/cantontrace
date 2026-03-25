/**
 * Execution Trace Routes
 *
 * POST /api/v1/trace — Request an execution trace from the engine-service
 *
 * Fetches ACS + packages from Canton, sends to engine-service
 * for instrumented execution via the forked daml-lf-engine.
 * Returns ExecutionTrace with source files when available.
 */

import type { FastifyInstance } from 'fastify';
import { requireCantonContext } from '../middleware/canton-context.js';
import type { CacheService } from '../services/cache.js';
import type { TraceRequest, ExecutionTrace, ApiResponse, ActiveContract, TemplateId, DisclosedContract, TraceStep, TraceStepContext } from '../types.js';

/**
 * Serialize a TemplateId object to a colon-delimited string for the engine-service.
 * Engine expects "PackageName:Module:Entity".
 */
function templateIdToString(tid: TemplateId): string {
  return `${tid.packageName}:${tid.moduleName}:${tid.entityName}`;
}

/**
 * Flatten a nested payload object to string values for the engine-service.
 */
function flattenPayload(payload: Record<string, unknown>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(payload)) {
    result[key] = typeof value === 'string' ? value : JSON.stringify(value);
  }
  return result;
}

/**
 * Convert an ActiveContract (Canton format) to a ContractRequest (engine format)
 * keyed by contractId in a map.
 */
function acsToContractsMap(contracts: ActiveContract[]): Record<string, unknown> {
  const map: Record<string, unknown> = {};
  for (const c of contracts) {
    map[c.contractId] = {
      contractId: c.contractId,
      templateId: templateIdToString(c.templateId),
      payload: flattenPayload(c.payload),
      signatories: c.signatories,
      observers: c.observers,
      contractKey: c.contractKey ? flattenPayload(c.contractKey) : null,
    };
  }
  return map;
}

/**
 * Convert disclosed contracts from frontend format to engine format.
 */
function disclosedToEngine(disclosed: DisclosedContract[]): unknown[] {
  return disclosed.map((d) => ({
    contractId: d.contractId,
    templateId: templateIdToString(d.templateId),
    payload: flattenPayload(d.payload),
    signatories: [],
    observers: [],
    contractKey: null,
  }));
}

/**
 * Transform the raw engine-service step context into the frontend's
 * TraceStepContext shape. The engine uses a discriminated union with a
 * `contextType` field; the frontend expects a flat bag of optional fields.
 */
function normalizeStepContext(rawContext: Record<string, unknown>): TraceStepContext {
  const ctx: TraceStepContext = {};
  const contextType = rawContext.contextType as string | undefined;

  if (contextType === 'fetch_contract') {
    const cid = rawContext.contractId as string | undefined;
    const payload = rawContext.payload as Record<string, string> | null | undefined;
    if (cid && payload) {
      ctx.contractPayloads = { [cid]: payload as Record<string, unknown> };
    }
  } else if (contextType === 'check_authorization') {
    ctx.requiredAuthority = rawContext.required
      ? Array.from(rawContext.required as Iterable<string>)
      : [];
    ctx.providedAuthority = rawContext.provided
      ? Array.from(rawContext.provided as Iterable<string>)
      : [];
  } else if (contextType === 'evaluate_guard') {
    ctx.guardExpression = rawContext.expression as string | undefined;
    ctx.guardResult = rawContext.result as boolean | undefined;
  } else if (contextType === 'ledger_action') {
    ctx.actionType = rawContext.actionType as string | undefined;
    ctx.templateId = parseTemplateIdString(rawContext.templateId as string | undefined);
    ctx.choice = rawContext.choice as string | undefined;
    ctx.arguments = rawContext.arguments as Record<string, unknown> | undefined;
    ctx.resultingContractId = rawContext.resultContractId as string | undefined;
    // Build contractPayloads from arguments if available
    if (ctx.resultingContractId && ctx.arguments) {
      ctx.contractPayloads = { [ctx.resultingContractId]: ctx.arguments };
    }
  } else if (contextType === 'evaluate_expression') {
    // Expression context carries variables which are already in step.variables
  } else if (contextType === 'fetch_package') {
    // No special mapping needed
  }

  return ctx;
}

/**
 * Parse a "Package:Module:Entity" string into a TemplateId, or return undefined.
 */
function parseTemplateIdString(s: string | undefined): TemplateId | undefined {
  if (!s) return undefined;
  const parts = s.split(':');
  if (parts.length >= 3) {
    return {
      packageName: parts[0]!,
      moduleName: parts[1]!,
      entityName: parts.slice(2).join(':'),
    };
  }
  return undefined;
}

/**
 * Transform the engine-service ExecutionTrace response into the frontend shape.
 * The engine's step contexts use a discriminated union that needs to be
 * normalized to the flat TraceStepContext the frontend expects.
 */
function normalizeEngineTrace(raw: Record<string, unknown>): ExecutionTrace {
  const rawSteps = (raw.steps ?? []) as Array<Record<string, unknown>>;
  const steps: TraceStep[] = rawSteps.map((s) => ({
    stepNumber: s.stepNumber as number,
    stepType: s.stepType as TraceStep['stepType'],
    sourceLocation: s.sourceLocation as TraceStep['sourceLocation'],
    summary: s.summary as string,
    variables: (s.variables ?? {}) as Record<string, unknown>,
    context: normalizeStepContext((s.context ?? {}) as Record<string, unknown>),
    passed: s.passed as boolean,
    error: s.error as string | undefined,
  }));

  return {
    steps,
    sourceFiles: (raw.sourceFiles ?? {}) as Record<string, string>,
    sourceAvailable: (raw.sourceAvailable ?? false) as boolean,
    resultTransaction: raw.resultTransaction as ExecutionTrace['resultTransaction'],
    error: raw.error as string | undefined,
    profilerData: raw.profilerData,
  };
}

const ENGINE_SERVICE_URL = process.env.ENGINE_SERVICE_URL ?? 'http://localhost:3002';

export function registerTraceRoutes(app: FastifyInstance, cache: CacheService): void {
  /**
   * POST /api/v1/trace
   *
   * Request a step-by-step execution trace for a Daml command.
   *
   * This is the headline feature of CantonTrace. The trace is produced by
   * the forked daml-lf-engine running on the engine-service JVM backend.
   *
   * Steps:
   * 1. Fetch ACS via StateService.GetActiveContracts (with REQUIRED active_at_offset)
   * 2. Fetch packages via PackageService.GetPackage
   * 3. Send ACS + packages + command to engine-service
   * 4. Engine-service runs instrumented interpretation
   * 5. Return ExecutionTrace with source files (Tier 1) or decompiled LF (Tier 2)
   */
  app.post<{
    Body: TraceRequest;
  }>('/api/v1/trace', {
    schema: {
      description: 'Execute a step-by-step Daml execution trace',
      tags: ['Execution Trace'],
      body: {
        type: 'object',
        required: ['command', 'actAs'],
        properties: {
          command: {
            type: 'object',
            required: ['templateId', 'arguments'],
            properties: {
              templateId: {
                type: 'object',
                properties: {
                  packageName: { type: 'string' },
                  moduleName: { type: 'string' },
                  entityName: { type: 'string' },
                },
              },
              choice: { type: 'string' },
              contractId: { type: 'string' },
              arguments: { type: 'object' },
            },
          },
          actAs: { type: 'array', items: { type: 'string' } },
          readAs: { type: 'array', items: { type: 'string' } },
          disclosedContracts: { type: 'array' },
          historicalOffset: { type: 'string', description: 'Offset for time-travel tracing' },
        },
      },
    },
  }, async (request, reply) => {
    const { client, bootstrapInfo } = requireCantonContext(request);
    const body = request.body;

    // Get the target offset
    const currentOffset = await client.stateService.getLedgerEnd();
    const targetOffset = body.historicalOffset ?? currentOffset;

    // Fetch ACS
    const allParties = [...body.actAs, ...(body.readAs ?? [])];
    const uniqueParties = [...new Set(allParties)];

    const { contracts } = await client.stateService.getActiveContracts(
      targetOffset,
      uniqueParties,
    );

    // Fetch packages (with caching)
    const packageIds = bootstrapInfo.packages.map((p) => p.packageId);
    const packages: Record<string, string> = {};

    for (const pkgId of packageIds) {
      let pkgBytes = await cache.getPackageBytes(pkgId);
      if (!pkgBytes) {
        const pkg = await client.packageService.getPackage(pkgId);
        pkgBytes = Buffer.from(pkg.archivePayload);
        await cache.setPackageBytes(pkgId, pkgBytes);
      }
      packages[pkgId] = pkgBytes.toString('base64');
    }

    // Transform command for engine-service format
    const engineCommand = {
      templateId: templateIdToString(body.command.templateId),
      choice: body.command.choice ?? null,
      contractId: body.command.contractId ?? null,
      arguments: flattenPayload(body.command.arguments),
    };

    // Transform ACS contracts to engine-service format (keyed by contractId)
    const engineContracts = acsToContractsMap(contracts);

    // Transform disclosed contracts
    const engineDisclosed = disclosedToEngine(body.disclosedContracts ?? []);

    // Send to engine-service
    try {
      const engineResponse = await fetch(`${ENGINE_SERVICE_URL}/api/v1/trace`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          command: engineCommand,
          actAs: body.actAs,
          readAs: body.readAs ?? [],
          contracts: engineContracts,
          packages,
          disclosedContracts: engineDisclosed,
        }),
      });

      if (!engineResponse.ok) {
        const errorBody = await engineResponse.json().catch(() => ({})) as Record<string, unknown>;
        return reply.code(engineResponse.status).send({
          code: 'TRACE_EXECUTION_FAILED',
          message: (errorBody.message as string) ?? (errorBody.error as string) ?? 'Trace execution failed in engine-service',
          details: errorBody,
        });
      }

      const rawResult = await engineResponse.json() as Record<string, unknown>;
      const traceResult = normalizeEngineTrace(rawResult);

      // If no source files, fetch decompiled Daml-LF from the engine service
      if (!traceResult.sourceAvailable && Object.keys(traceResult.sourceFiles).length === 0) {
        // Find the package ID for the template being traced
        const templateParts = body.command.templateId;
        const matchingPkg = bootstrapInfo.packages.find(
          (p) => p.packageName === templateParts.packageName
        );
        const pkgId = matchingPkg?.packageId;

        if (pkgId && packages[pkgId]) {
          try {
            const decompileResponse = await fetch(`${ENGINE_SERVICE_URL}/api/v1/decompile`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ dalfBase64: packages[pkgId] }),
            });

            if (decompileResponse.ok) {
              const decompiled = await decompileResponse.json() as Record<string, unknown>;
              const decompiledSource = (decompiled as { decompiledSource?: string }).decompiledSource;
              if (decompiledSource && typeof decompiledSource === 'string') {
                const fileName = `${templateParts.moduleName}.daml (decompiled)`;
                traceResult.sourceFiles = { [fileName]: decompiledSource };
              }
            }
          } catch {
            // Non-fatal — trace still works without source
            request.log.warn('Failed to fetch decompiled source from engine-service');
          }
        }
      }

      const response: ApiResponse<ExecutionTrace> = {
        data: traceResult,
        meta: {
          offset: targetOffset,
          timestamp: new Date().toISOString(),
        },
      };

      return reply.send(response);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      return reply.code(502).send({
        code: 'ENGINE_SERVICE_UNAVAILABLE',
        message: `Cannot reach engine-service at ${ENGINE_SERVICE_URL}: ${message}`,
      });
    }
  });
}
