/**
 * Simulation Routes
 *
 * POST /api/v1/simulate — Dual-path transaction simulation
 *
 * Mode "online":  InteractiveSubmissionService.PrepareSubmission (NEVER ExecuteSubmission)
 * Mode "offline": Fetch ACS + packages, send to engine-service via internal HTTP
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { requireCantonContext } from '../middleware/canton-context.js';
import type { CacheService } from '../services/cache.js';
import type {
  SimulationRequest,
  SimulationCommand,
  SimulationResult,
  TransactionDetail,
  StateDiff,
  LedgerEvent,
  ActiveContract,
  TemplateId,
  ApiResponse,
} from '../types.js';
import crypto from 'crypto';

const ENGINE_SERVICE_URL = process.env.ENGINE_SERVICE_URL ?? 'http://localhost:3002';

export function registerSimulateRoutes(app: FastifyInstance, cache: CacheService): void {
  /**
   * POST /api/v1/simulate
   *
   * Dual-path transaction simulation:
   *
   * Mode "online" (Path A):
   *   - Calls InteractiveSubmissionService.PrepareSubmission
   *   - Constructs PrepareRequest with package-name format (NOT package-id)
   *   - Decodes PreparedTransaction, navigates to Metadata.input_contracts
   *   - NEVER calls ExecuteSubmission
   *
   * Mode "offline" (Path B):
   *   - Fetches ACS via StateService (with REQUIRED active_at_offset)
   *   - Fetches packages via PackageService
   *   - Sends to engine-service for local interpretation
   *   - Only option for time-travel simulation (historical offset)
   */
  app.post<{
    Body: SimulationRequest;
  }>('/api/v1/simulate', {
    schema: {
      description: 'Simulate a Daml command without executing it',
      tags: ['Transaction Simulator'],
      body: {
        type: 'object',
        required: ['mode', 'commands', 'actAs'],
        properties: {
          mode: { type: 'string', enum: ['online', 'offline'] },
          commands: {
            type: 'array',
            items: {
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
          },
          actAs: { type: 'array', items: { type: 'string' } },
          readAs: { type: 'array', items: { type: 'string' } },
          synchronizerId: { type: 'string' },
          disclosedContracts: { type: 'array' },
          historicalOffset: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const { client, bootstrapInfo } = requireCantonContext(request);
    const body = request.body;

    // Get current offset for state drift warning
    const currentOffset = await client.stateService.getLedgerEnd();

    if (body.mode === 'online') {
      return await simulateOnline(request, reply, body, currentOffset);
    } else {
      return await simulateOffline(request, reply, body, currentOffset, cache);
    }
  });
}

/**
 * Path A: Online simulation via InteractiveSubmissionService.PrepareSubmission
 *
 * Requires CanActAs rights.
 * Uses package-name format (NOT package-id, deprecated in Canton 3.5).
 * NEVER calls ExecuteSubmission.
 */
async function simulateOnline(
  request: FastifyRequest,
  reply: FastifyReply,
  body: SimulationRequest,
  currentOffset: string,
): Promise<void> {
  const { client, bootstrapInfo } = requireCantonContext(request);

  const commandId = `sim-${crypto.randomUUID()}`;
  const applicationId = 'cantontrace-simulator';

  // Resolve packageName → packageId (Canton 3.4 requires actual package ID)
  const resolvedCommands = body.commands.map((cmd) => {
    const pkg = bootstrapInfo.packages.find(
      (p) => p.packageName === cmd.templateId.packageName
    );
    return {
      ...cmd,
      templateId: {
        ...cmd.templateId,
        packageName: pkg?.packageId ?? cmd.templateId.packageName,
      },
    };
  });

  try {
    const result = await client.interactiveSubmissionService.prepareSubmission(
      resolvedCommands,
      body.actAs,
      body.readAs ?? [],
      applicationId,
      commandId,
      body.synchronizerId,
      body.disclosedContracts,
    );

    // Build a synthetic transaction tree from the online simulation data
    // so the frontend can visualize what the transaction would do
    const transactionTree = buildOnlineTransactionTree(
      resolvedCommands,
      body.commands,
      result.inputContracts,
      body.actAs,
    );

    const response: ApiResponse<SimulationResult> = {
      data: {
        mode: 'online',
        success: true,
        transactionTree,
        hashInfo: {
          ...result.hashInfo,
          // ADVISORY: Canton 3.5 warns about this
          isAdvisory: true,
        },
        costEstimation: result.costEstimation,
        inputContracts: result.inputContracts,
        globalKeyMapping: result.globalKeyMapping,
        simulatedAt: new Date().toISOString(),
        atOffset: currentOffset,
        stateDriftWarning:
          'Simulation shows predicted results based on current state. ' +
          'Between simulation and execution, contracts may be archived (contention), ' +
          'topology may change, and costs may differ. Protocol-level checks ' +
          '(confirmation, sequencing) can only be verified by the participant node.',
      },
      meta: {
        offset: currentOffset,
        timestamp: new Date().toISOString(),
      },
    };

    reply.send(response);
  } catch (err) {
    // Simulation failure — still a valid result
    const { CantonError } = await import('../canton/errors.js');
    if (err instanceof CantonError) {
      const response: ApiResponse<SimulationResult> = {
        data: {
          mode: 'online',
          success: false,
          error: err.commandError,
          simulatedAt: new Date().toISOString(),
          atOffset: currentOffset,
          stateDriftWarning: 'Simulation failed — see error details.',
        },
        meta: {
          offset: currentOffset,
          timestamp: new Date().toISOString(),
        },
      };
      reply.send(response);
    } else {
      throw err;
    }
  }
}

/**
 * Path B: Offline simulation via engine-service
 *
 * Requires only CanReadAs rights.
 * Supports time-travel simulation against historical ACS.
 * Fetches ACS + packages, sends to engine-service.
 */
async function simulateOffline(
  request: FastifyRequest,
  reply: FastifyReply,
  body: SimulationRequest,
  currentOffset: string,
  cache: CacheService,
): Promise<void> {
  const { client, bootstrapInfo } = requireCantonContext(request);

  // Determine the offset for ACS snapshot
  const snapshotOffset = body.historicalOffset ?? currentOffset;

  // Fetch ACS at the target offset
  const allParties = [...body.actAs, ...(body.readAs ?? [])];
  const uniqueParties = [...new Set(allParties)];

  const { contracts } = await client.stateService.getActiveContracts(
    snapshotOffset,
    uniqueParties,
  );

  // Fetch packages
  const packageIds = bootstrapInfo.packages.map((p) => p.packageId);
  const packages: Record<string, string> = {};

  for (const pkgId of packageIds) {
    // Check cache first
    let pkgBytes = await cache.getPackageBytes(pkgId);
    if (!pkgBytes) {
      const pkg = await client.packageService.getPackage(pkgId);
      pkgBytes = Buffer.from(pkg.archivePayload);
      await cache.setPackageBytes(pkgId, pkgBytes);
    }
    packages[pkgId] = pkgBytes.toString('base64');
  }

  // Transform command to engine-service format (colon-delimited templateId, flat payload)
  const cmd = body.commands[0];
  const engineCommand = cmd ? {
    templateId: `${cmd.templateId.packageName}:${cmd.templateId.moduleName}:${cmd.templateId.entityName}`,
    choice: cmd.choice ?? null,
    contractId: cmd.contractId ?? null,
    arguments: Object.fromEntries(
      Object.entries(cmd.arguments).map(([k, v]) => [k, typeof v === 'string' ? v : JSON.stringify(v)])
    ),
  } : null;

  // Transform ACS to engine format (map keyed by contractId)
  const engineContracts: Record<string, unknown> = {};
  for (const c of contracts) {
    engineContracts[c.contractId] = {
      contractId: c.contractId,
      templateId: `${c.templateId.packageName}:${c.templateId.moduleName}:${c.templateId.entityName}`,
      payload: Object.fromEntries(
        Object.entries(c.payload).map(([k, v]) => [k, typeof v === 'string' ? v : JSON.stringify(v)])
      ),
      signatories: c.signatories,
      observers: c.observers,
    };
  }

  // Send to engine-service for local interpretation
  try {
    const engineResponse = await fetch(`${ENGINE_SERVICE_URL}/api/v1/simulate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        command: engineCommand,
        actAs: body.actAs,
        readAs: body.readAs ?? [],
        contracts: engineContracts,
        packages,
        disclosedContracts: [],
      }),
    });

    if (!engineResponse.ok) {
      const errorBody = await engineResponse.json().catch(() => ({})) as Record<string, unknown>;
      const response: ApiResponse<SimulationResult> = {
        data: {
          mode: 'offline',
          success: false,
          error: {
            errorCodeId: 'ENGINE_SIMULATION_FAILED',
            categoryId: 'InvalidIndependentOfSystemState',
            grpcStatusCode: 'INTERNAL',
            message: (errorBody.message as string) ?? 'Engine simulation failed',
            correlationId: '',
          },
          simulatedAt: new Date().toISOString(),
          atOffset: snapshotOffset,
          stateDriftWarning: body.historicalOffset
            ? `Simulated against historical ACS at offset ${snapshotOffset}. Current offset is ${currentOffset}.`
            : 'Simulation shows predicted results based on current state.',
        },
        meta: {
          offset: snapshotOffset,
          timestamp: new Date().toISOString(),
        },
      };
      reply.send(response);
      return;
    }

    const engineResult = await engineResponse.json() as Record<string, unknown>;

    // Transform engine TransactionTree → frontend TransactionDetail shape
    const engineTree = engineResult.transactionTree as Record<string, unknown> | undefined;
    const transactionTree = engineTree ? transformEngineTree(engineTree, contracts) : undefined;

    // Extract input contracts from the transformed tree
    const inputContracts = transactionTree
      ? transactionTree.stateDiff.inputs
      : [];

    const response: ApiResponse<SimulationResult> = {
      data: {
        mode: 'offline',
        success: true,
        transactionTree,
        inputContracts: inputContracts.map((c) => ({ contract: c, createdAt: '' })),
        simulatedAt: new Date().toISOString(),
        atOffset: snapshotOffset,
        stateDriftWarning: body.historicalOffset
          ? `Simulated against historical ACS at offset ${snapshotOffset}. Current offset is ${currentOffset}. ` +
            'Results reflect the state at the historical point, not current state.'
          : 'Simulation shows predicted results based on current state. ' +
            'Between simulation and execution, contracts may be archived (contention), ' +
            'topology may change. Protocol-level checks can only be verified by the participant node.',
      },
      meta: {
        offset: snapshotOffset,
        timestamp: new Date().toISOString(),
      },
    };

    reply.send(response);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    reply.code(502).send({
      code: 'ENGINE_SERVICE_UNAVAILABLE',
      message: `Cannot reach engine-service at ${ENGINE_SERVICE_URL}: ${message}`,
    });
  }
}

// ============================================================
// Transformation helpers
// ============================================================

/**
 * Parse a colon-delimited template ID string ("pkg:Module:Entity")
 * into the structured TemplateId shape expected by the frontend.
 */
function parseTemplateIdString(tid: string): TemplateId {
  const parts = tid.split(':');
  return {
    packageName: parts[0] ?? '',
    moduleName: parts[1] ?? '',
    entityName: parts[2] ?? '',
  };
}

/**
 * Transform an engine-service TransactionTree (flat string templateIds,
 * Map[String,String] payloads, no stateDiff) into the frontend
 * TransactionDetail shape (structured templateIds, object payloads,
 * stateDiff computed from events).
 */
function transformEngineTree(
  engineTree: Record<string, unknown>,
  acsContracts: ActiveContract[],
): TransactionDetail {
  const eventsById: Record<string, LedgerEvent> = {};
  const engineEvents = (engineTree.eventsById ?? {}) as Record<string, Record<string, unknown>>;

  const inputContracts: ActiveContract[] = [];
  const outputContracts: ActiveContract[] = [];

  for (const [eventId, event] of Object.entries(engineEvents)) {
    const eventType = event.eventType as string;

    if (eventType === 'created') {
      const templateId = parseTemplateIdString(event.templateId as string);
      const payload = (event.payload ?? {}) as Record<string, unknown>;
      const signatories = (event.signatories ?? []) as string[];
      const observers = (event.observers ?? []) as string[];

      eventsById[eventId] = {
        eventType: 'created',
        eventId,
        contractId: event.contractId as string,
        templateId,
        payload,
        signatories,
        observers,
        witnesses: signatories,
      };

      outputContracts.push({
        contractId: event.contractId as string,
        templateId,
        payload,
        signatories,
        observers,
        createdAt: '',
      });
    } else if (eventType === 'exercised') {
      const templateId = parseTemplateIdString(event.templateId as string);
      const actingParties = [...(event.actingParties ?? []) as string[]];

      eventsById[eventId] = {
        eventType: 'exercised',
        eventId,
        contractId: event.contractId as string,
        templateId,
        choice: event.choice as string,
        choiceArgument: (event.choiceArgument ?? {}) as Record<string, unknown>,
        actingParties,
        consuming: event.consuming as boolean ?? true,
        witnesses: actingParties,
        childEventIds: (event.childEventIds ?? []) as string[],
        exerciseResult: event.exerciseResult,
      };

      // If consuming, the exercised contract is an input
      if (event.consuming !== false) {
        const cid = event.contractId as string;
        const acsMatch = acsContracts.find((c) => c.contractId === cid);
        inputContracts.push(acsMatch ?? {
          contractId: cid,
          templateId,
          payload: {},
          signatories: actingParties,
          observers: [],
          createdAt: '',
        });
      }
    } else if (eventType === 'archived') {
      const templateId = parseTemplateIdString(event.templateId as string);
      eventsById[eventId] = {
        eventType: 'archived',
        eventId,
        contractId: event.contractId as string,
        templateId,
        witnesses: [],
      };
    }
  }

  const consumedCount = inputContracts.length;
  const createdCount = outputContracts.length;
  const stateDiff: StateDiff = {
    inputs: inputContracts,
    outputs: outputContracts,
    netChange: `${consumedCount} contract${consumedCount !== 1 ? 's' : ''} consumed, ${createdCount} contract${createdCount !== 1 ? 's' : ''} created`,
  };

  return {
    updateId: engineTree.updateId as string ?? `sim-${crypto.randomUUID().slice(0, 8)}`,
    commandId: engineTree.commandId as string | undefined,
    workflowId: engineTree.workflowId as string | undefined,
    offset: '',
    recordTime: new Date().toISOString(),
    effectiveAt: (engineTree.effectiveAt as string) ?? new Date().toISOString(),
    rootEventIds: (engineTree.rootEventIds ?? []) as string[],
    eventsById,
    stateDiff,
  };
}

/**
 * Build a synthetic TransactionDetail for online (PrepareSubmission) results.
 *
 * The PrepareSubmission response gives us input contracts but not the full
 * transaction tree. We reconstruct a tree from the original commands and
 * input contracts so the frontend has something to display.
 */
function buildOnlineTransactionTree(
  _resolvedCommands: SimulationCommand[],
  originalCommands: SimulationCommand[],
  inputContracts: Array<{ contract: ActiveContract; createdAt: string }>,
  actAs: string[],
): TransactionDetail {
  const txId = `sim-${crypto.randomUUID().slice(0, 8)}`;
  const now = new Date().toISOString();
  const eventsById: Record<string, LedgerEvent> = {};
  const rootEventIds: string[] = [];
  const outputs: ActiveContract[] = [];
  const inputs: ActiveContract[] = inputContracts.map((ic) => ic.contract);
  let eventCounter = 0;

  for (const cmd of originalCommands) {
    const templateId = cmd.templateId;

    if (cmd.choice && cmd.contractId) {
      // Exercise command
      const exerciseEventId = `#${txId}:${eventCounter++}`;
      const createEventId = `#${txId}:${eventCounter++}`;
      const newContractId = `00${crypto.randomUUID().replace(/-/g, '')}`;

      const inputContract = inputContracts.find(
        (ic) => ic.contract.contractId === cmd.contractId
      );

      eventsById[exerciseEventId] = {
        eventType: 'exercised',
        eventId: exerciseEventId,
        contractId: cmd.contractId,
        templateId,
        choice: cmd.choice,
        choiceArgument: cmd.arguments,
        actingParties: actAs,
        consuming: true,
        witnesses: actAs,
        childEventIds: [createEventId],
        exerciseResult: `ContractId(${newContractId})`,
      };

      const signatories = inputContract?.contract.signatories ?? actAs;
      const observers = inputContract?.contract.observers ?? [];

      eventsById[createEventId] = {
        eventType: 'created',
        eventId: createEventId,
        contractId: newContractId,
        templateId,
        payload: cmd.arguments,
        signatories,
        observers,
        witnesses: signatories,
      };

      outputs.push({
        contractId: newContractId,
        templateId,
        payload: cmd.arguments,
        signatories,
        observers,
        createdAt: now,
      });

      rootEventIds.push(exerciseEventId);
    } else {
      // Create command
      const createEventId = `#${txId}:${eventCounter++}`;
      const newContractId = `00${crypto.randomUUID().replace(/-/g, '')}`;

      eventsById[createEventId] = {
        eventType: 'created',
        eventId: createEventId,
        contractId: newContractId,
        templateId,
        payload: cmd.arguments,
        signatories: actAs,
        observers: [],
        witnesses: actAs,
      };

      outputs.push({
        contractId: newContractId,
        templateId,
        payload: cmd.arguments,
        signatories: actAs,
        observers: [],
        createdAt: now,
      });

      rootEventIds.push(createEventId);
    }
  }

  const consumedCount = inputs.length;
  const createdCount = outputs.length;

  return {
    updateId: txId,
    commandId: `sim-cmd-${txId.slice(-8)}`,
    offset: '',
    recordTime: now,
    effectiveAt: now,
    rootEventIds,
    eventsById,
    stateDiff: {
      inputs,
      outputs,
      netChange: `${consumedCount} contract${consumedCount !== 1 ? 's' : ''} consumed, ${createdCount} contract${createdCount !== 1 ? 's' : ''} created`,
    },
  };
}

