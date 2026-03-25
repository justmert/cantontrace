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
  SimulationResult,
  ApiResponse,
} from '../types.js';
import crypto from 'crypto';

const ENGINE_SERVICE_URL = process.env.ENGINE_SERVICE_URL ?? 'http://localhost:4001';

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

    const response: ApiResponse<SimulationResult> = {
      data: {
        mode: 'online',
        success: true,
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

  // Send to engine-service for local interpretation
  try {
    const engineResponse = await fetch(`${ENGINE_SERVICE_URL}/api/v1/simulate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        commands: body.commands,
        actAs: body.actAs,
        readAs: body.readAs ?? [],
        acs: contracts,
        packages,
        disclosedContracts: body.disclosedContracts ?? [],
        offset: snapshotOffset,
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

    const response: ApiResponse<SimulationResult> = {
      data: {
        mode: 'offline',
        success: true,
        transactionTree: engineResult.transactionTree as SimulationResult['transactionTree'],
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
