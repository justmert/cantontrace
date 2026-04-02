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
import { wrapAsArchive } from '../services/package-parser.js';

/**
 * Serialize a TemplateId object to a colon-delimited string for the engine-service.
 * Engine expects "PackageId:Module:Entity" where PackageId is the hex hash.
 * If only packageName is available, the caller must resolve it to packageId first.
 */
function templateIdToString(tid: TemplateId, resolvedPackageId?: string): string {
  const pkgId = resolvedPackageId ?? tid.packageName;
  return `${pkgId}:${tid.moduleName}:${tid.entityName}`;
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
function acsToContractsMap(
  contracts: ActiveContract[],
  packageResolver?: (name: string) => string | undefined,
): Record<string, unknown> {
  const map: Record<string, unknown> = {};
  for (const c of contracts) {
    const resolvedPkgId = packageResolver?.(c.templateId.packageName) ?? c.templateId.packageName;
    map[c.contractId] = {
      contractId: c.contractId,
      templateId: templateIdToString(c.templateId, resolvedPkgId),
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
 * Normalize a party list value from the engine.
 * The engine may send a Set (iterable), an array, a comma-delimited string,
 * or null/undefined. Returns a plain string array.
 */
function normalizePartyList(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === 'string') return value.split(',').map((s) => s.trim()).filter(Boolean);
  // Handle Set or other iterables
  if (typeof value === 'object' && Symbol.iterator in (value as object)) {
    return Array.from(value as Iterable<unknown>).map(String);
  }
  return [];
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
    // Engine may return Sets, arrays, or comma-delimited strings.
    // Normalize to string arrays.
    ctx.requiredAuthority = normalizePartyList(rawContext.required);
    ctx.providedAuthority = normalizePartyList(rawContext.provided);
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
/**
 * Normalize the engine's resultTransaction: parse string templateIds into objects,
 * ensure events have proper structure for frontend rendering.
 */
function normalizeResultTransaction(
  raw: Record<string, unknown> | undefined
): ExecutionTrace['resultTransaction'] {
  if (!raw) return undefined;

  const eventsById = raw.eventsById as Record<string, Record<string, unknown>> | undefined;
  if (eventsById) {
    for (const [, event] of Object.entries(eventsById)) {
      // Parse string templateId to object
      if (typeof event.templateId === 'string') {
        event.templateId = parseTemplateIdString(event.templateId) ?? event.templateId;
      }
    }
  }

  return raw as unknown as ExecutionTrace['resultTransaction'];
}

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
 *
 * Additionally, propagates auth data from check_authorization steps forward
 * to subsequent action steps that don't have their own auth context, so the
 * Authorization tab is useful on non-auth steps.
 */
function normalizeEngineTrace(raw: Record<string, unknown>, actAs?: string[]): ExecutionTrace {
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

  // Propagate auth context forward: if a step has no requiredAuthority/providedAuthority,
  // inherit from the most recent check_authorization step before it.
  let lastRequired: string[] | undefined;
  let lastProvided: string[] | undefined;
  for (const step of steps) {
    if (step.stepType === 'check_authorization') {
      lastRequired = step.context.requiredAuthority;
      lastProvided = step.context.providedAuthority;
    } else if (
      ['create_contract', 'exercise_choice', 'archive_contract'].includes(step.stepType) &&
      !step.context.requiredAuthority?.length &&
      !step.context.providedAuthority?.length
    ) {
      if (lastRequired?.length) step.context.requiredAuthority = lastRequired;
      if (lastProvided?.length) step.context.providedAuthority = lastProvided;
      // If still no provided, use actAs as fallback
      if (!step.context.providedAuthority?.length && actAs?.length) {
        step.context.providedAuthority = actAs;
      }
    }
  }

  return {
    steps,
    sourceFiles: (raw.sourceFiles ?? {}) as Record<string, string>,
    sourceAvailable: (raw.sourceAvailable ?? false) as boolean,
    resultTransaction: normalizeResultTransaction(raw.resultTransaction as Record<string, unknown> | undefined),
    error: raw.error as string | undefined,
    profilerData: raw.profilerData,
  };
}

/**
 * Compute approximate source locations for trace steps by scanning the
 * decompiled Daml-LF source for structural keywords.
 *
 * The Decompiler produces a predictable structure:
 *   line N:   template TemplateName
 *   line N+1:   with
 *   line N+k:   where
 *   line N+k+1:     signatory ...
 *   line N+k+2:     observer ...
 *   line N+k+3:     ensure ...
 *   line N+m:     choice ChoiceName : ReturnType
 *   ...
 *
 * We scan for these keywords and map step types to the matching lines.
 */
function computeSourceLocations(
  sourceContent: string,
  sourceFileName: string,
  templateName: string | undefined,
  choiceName: string | undefined,
  steps: TraceStep[],
): void {
  const lines = sourceContent.split('\n');

  // Build a keyword→line map by scanning the decompiled source
  let templateLine = 0;
  let signatoryLine = 0;
  let ensureLine = 0;
  let choiceLine = 0;
  let createLine = 0;
  let withFieldsLine = 0;
  let inTargetTemplate = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.trim();
    const lineNum = i + 1; // 1-based

    // Detect template definition
    if (line.startsWith('template ')) {
      const name = line.replace('template ', '').trim();
      if (!templateName || name === templateName) {
        templateLine = lineNum;
        inTargetTemplate = true;
      } else {
        inTargetTemplate = false;
      }
      continue;
    }

    if (!inTargetTemplate) continue;

    // Detect "with" block (fields)
    if (line === 'with' && !withFieldsLine && templateLine > 0) {
      withFieldsLine = lineNum;
      continue;
    }

    if (line.startsWith('signatory ')) {
      signatoryLine = lineNum;
      continue;
    }

    if (line.startsWith('ensure ')) {
      ensureLine = lineNum;
      continue;
    }

    // Detect choice definition — match optional "nonconsuming" prefix
    if (line.startsWith('choice ') || line.startsWith('nonconsuming choice ') || line.startsWith('preconsuming choice ') || line.startsWith('postconsuming choice ')) {
      const nameMatch = line.match(/choice\s+(\w+)/);
      if (nameMatch) {
        if (!choiceName || nameMatch[1] === choiceName) {
          choiceLine = lineNum;
        }
      }
      continue;
    }

    // Detect create in choice body
    if ((line.startsWith('create ') || line === 'create') && choiceLine > 0 && !createLine) {
      createLine = lineNum;
      continue;
    }
  }

  // Fall back: if no specific lines found, use the template line
  if (!templateLine) templateLine = 1;
  if (!signatoryLine) signatoryLine = templateLine;
  if (!ensureLine) ensureLine = signatoryLine;
  if (!choiceLine) choiceLine = templateLine;
  if (!createLine) createLine = choiceLine;
  if (!withFieldsLine) withFieldsLine = templateLine;

  // Map step types to source locations
  for (const step of steps) {
    // Skip if already has a source location
    if (step.sourceLocation) continue;

    let targetLine: number;
    switch (step.stepType) {
      case 'fetch_package':
        targetLine = 1; // top of file
        break;
      case 'evaluate_expression':
        // Command interpretation → template or choice header
        if (step.summary.includes('choice_body')) {
          targetLine = choiceLine;
        } else {
          targetLine = templateLine;
        }
        break;
      case 'fetch_contract':
        targetLine = withFieldsLine; // template data definition
        break;
      case 'check_authorization':
        targetLine = signatoryLine;
        break;
      case 'evaluate_guard':
        targetLine = ensureLine;
        break;
      case 'exercise_choice':
        targetLine = choiceLine;
        break;
      case 'create_contract':
        targetLine = createLine || choiceLine;
        break;
      case 'archive_contract':
        targetLine = choiceLine;
        break;
      default:
        targetLine = templateLine;
    }

    step.sourceLocation = {
      file: sourceFileName,
      startLine: targetLine,
      startCol: 1,
      endLine: targetLine,
      endCol: (lines[targetLine - 1]?.length ?? 0) + 1,
    };
  }
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
      // Canton's GetPackage returns the ArchivePayload (inner bytes), not the
      // full DamlLf.Archive. The engine expects a complete Archive protobuf,
      // so wrap the payload in the Archive envelope.
      const payloadBase64 = pkgBytes.toString('base64');
      packages[pkgId] = wrapAsArchive(payloadBase64, pkgId);
    }

    // Resolve package name to package ID (hex hash) for the real engine
    const templatePkgName = body.command.templateId.packageName;
    const resolvedPkgId = bootstrapInfo.packages.find(
      (p) => p.packageName === templatePkgName
    )?.packageId ?? templatePkgName;

    // Transform command for engine-service format
    const engineCommand = {
      templateId: templateIdToString(body.command.templateId, resolvedPkgId),
      choice: body.command.choice ?? null,
      contractId: body.command.contractId ?? null,
      arguments: flattenPayload(body.command.arguments),
    };

    // Transform ACS contracts to engine-service format (keyed by contractId)
    // Build a resolver to convert package names → package IDs
    const pkgResolver = (name: string) =>
      bootstrapInfo.packages.find((p) => p.packageName === name)?.packageId;
    const engineContracts = acsToContractsMap(contracts, pkgResolver);

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
      const traceResult = normalizeEngineTrace(rawResult, body.actAs);

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
              body: JSON.stringify({ dalfBytes: packages[pkgId] }),
            });

            if (decompileResponse.ok) {
              const decompiled = await decompileResponse.json() as Record<string, unknown>;
              // The engine returns { sources: { "Module/Name.daml": "..." }, moduleCount, totalChars }
              const sources = decompiled.sources as Record<string, string> | undefined;
              if (sources && typeof sources === 'object') {
                // Use all decompiled module sources
                const sourceEntries = Object.entries(sources);
                if (sourceEntries.length > 0) {
                  // Pick the module matching the traced template, or use the first one
                  const modulePath = templateParts.moduleName.replace(/\./g, '/');
                  const matchingEntry = sourceEntries.find(([k]) => k.includes(modulePath));
                  const [fileName, content] = matchingEntry ?? sourceEntries[0]!;
                  const displayName = `${fileName} (decompiled)`;
                  traceResult.sourceFiles = { [displayName]: content };
                  // Also store under the bare filename for sourceLocation.file matching
                  traceResult.sourceFiles[fileName] = content;

                  // Compute source locations for steps that don't have them
                  computeSourceLocations(
                    content,
                    displayName,
                    templateParts.entityName,
                    body.command.choice ?? undefined,
                    traceResult.steps,
                  );
                }
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
