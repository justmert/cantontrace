/**
 * Execute Routes
 *
 * POST /api/v1/execute — Two-step ledger submission via InteractiveSubmissionService
 *
 * Step 1: PrepareSubmission (same as online simulate)
 * Step 2: ExecuteSubmission (actually commits to the ledger)
 */

import type { FastifyInstance } from 'fastify';
import { requireCantonContext } from '../middleware/canton-context.js';
import type {
  ExecuteRequest,
  ExecuteResult,
  SimulationCommand,
  TransactionDetail,
  LedgerEvent,
  ActiveContract,
  ApiResponse,
} from '../types.js';
import { HashingSchemeVersion } from '../canton/proto/types.js';
import crypto from 'crypto';

export function registerExecuteRoutes(app: FastifyInstance): void {
  /**
   * POST /api/v1/execute
   *
   * Two-step ledger submission:
   *   1. PrepareSubmission — validate and prepare the transaction
   *   2. ExecuteSubmission — commit the prepared transaction to the ledger
   *
   * This ACTUALLY MUTATES the ledger. The frontend must confirm before calling.
   */
  app.post<{
    Body: ExecuteRequest;
  }>('/api/v1/execute', {
    schema: {
      description: 'Execute a Daml command on the ledger (two-step: Prepare + Execute)',
      tags: ['Transaction Executor'],
      body: {
        type: 'object',
        required: ['commands', 'actAs'],
        properties: {
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
        },
      },
    },
  }, async (request, reply) => {
    const { client, bootstrapInfo } = requireCantonContext(request);
    const body = request.body;

    const commandId = `exec-${crypto.randomUUID()}`;
    const submissionId = `sub-${crypto.randomUUID()}`;
    const applicationId = 'cantontrace-executor';

    // Resolve packageName -> packageId (Canton 3.4 requires actual package ID)
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
      // ============================================================
      // Step 1: PrepareSubmission
      // ============================================================
      const prepareResult = await client.interactiveSubmissionService.prepareSubmission(
        resolvedCommands,
        body.actAs,
        body.readAs ?? [],
        applicationId,
        commandId,
        body.synchronizerId,
        body.disclosedContracts,
      );

      // Enrich input contracts if empty (same logic as simulate)
      let enrichedInputContracts = prepareResult.inputContracts;
      if (enrichedInputContracts.length === 0) {
        const exerciseCommands = body.commands.filter(c => c.choice && c.contractId);
        if (exerciseCommands.length > 0) {
          const allParties = [...new Set([...body.actAs, ...(body.readAs ?? [])])];
          const fetched = await Promise.all(
            exerciseCommands.map(async (cmd) => {
              try {
                const events = await client.eventQueryService.getEventsByContractId(
                  cmd.contractId!,
                  allParties,
                );
                if (events.created) {
                  const ce = events.created.event;
                  return {
                    contract: {
                      contractId: ce.contractId,
                      templateId: ce.templateId,
                      payload: ce.payload,
                      signatories: ce.signatories,
                      observers: ce.observers,
                      createdAt: events.created.createdAtOffset ?? '',
                    },
                    createdAt: events.created.createdAtOffset ?? '',
                  };
                }
              } catch {
                // Contract might be pruned
              }
              return null;
            })
          );
          enrichedInputContracts = fetched.filter((x): x is NonNullable<typeof x> => x !== null);
        }
      }

      // ============================================================
      // Step 2: ExecuteSubmission
      // ============================================================
      const hashVersionMap: Record<string, number> = {
        'V1': HashingSchemeVersion.HASHING_SCHEME_VERSION_V1,
        'V2': HashingSchemeVersion.HASHING_SCHEME_VERSION_V2,
      };
      const hashVersion = hashVersionMap[prepareResult.hashInfo.hashingSchemeVersion]
        ?? HashingSchemeVersion.HASHING_SCHEME_VERSION_V1;

      // Convert hex hash back to bytes
      const hashBytes = hexToBuffer(prepareResult.hashInfo.transactionHash);

      const executeResult = await client.interactiveSubmissionService.executeSubmission(
        prepareResult.preparedTransactionBytes,
        hashBytes,
        hashVersion,
        submissionId,
      );

      // Check if execution had an error status
      if (executeResult.status && executeResult.status.code !== 0) {
        const response: ApiResponse<ExecuteResult> = {
          data: {
            success: false,
            committed: true,
            updateId: executeResult.updateId,
            completionOffset: executeResult.completionOffset,
            error: {
              errorCodeId: `GRPC_STATUS_${executeResult.status.code}`,
              categoryId: 'InvalidGivenCurrentSystemStateOther',
              grpcStatusCode: String(executeResult.status.code),
              message: executeResult.status.message,
              correlationId: commandId,
            },
            executedAt: new Date().toISOString(),
          },
          meta: {
            offset: executeResult.completionOffset,
            timestamp: new Date().toISOString(),
          },
        };
        reply.send(response);
        return;
      }

      // Build transaction tree from the commands and input contracts
      const transactionTree = buildExecuteTransactionTree(
        resolvedCommands,
        body.commands,
        enrichedInputContracts,
        body.actAs,
        executeResult.updateId,
      );

      const response: ApiResponse<ExecuteResult> = {
        data: {
          success: true,
          committed: true,
          updateId: executeResult.updateId,
          completionOffset: executeResult.completionOffset,
          transactionTree,
          inputContracts: enrichedInputContracts,
          executedAt: new Date().toISOString(),
        },
        meta: {
          offset: executeResult.completionOffset,
          timestamp: new Date().toISOString(),
        },
      };

      reply.send(response);
    } catch (err) {
      const { CantonError } = await import('../canton/errors.js');
      if (err instanceof CantonError) {
        const response: ApiResponse<ExecuteResult> = {
          data: {
            success: false,
            committed: true,
            updateId: '',
            completionOffset: '',
            error: err.commandError,
            executedAt: new Date().toISOString(),
          },
          meta: {
            timestamp: new Date().toISOString(),
          },
        };
        reply.send(response);
      } else {
        throw err;
      }
    }
  });
}

// ============================================================
// Helpers
// ============================================================

function hexToBuffer(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

/**
 * Build a synthetic TransactionDetail for execute results.
 * Same logic as the online simulation tree builder but uses the real updateId.
 */
function buildExecuteTransactionTree(
  _resolvedCommands: SimulationCommand[],
  originalCommands: SimulationCommand[],
  inputContracts: Array<{ contract: ActiveContract; createdAt: string }>,
  actAs: string[],
  updateId: string,
): TransactionDetail {
  const txId = updateId || `exec-${crypto.randomUUID().slice(0, 8)}`;
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
      const archiveEventId = `#${txId}:${eventCounter++}`;
      const createEventId = `#${txId}:${eventCounter++}`;
      const newContractId = `00${crypto.randomUUID().replace(/-/g, '')}`;

      const inputContract = inputContracts.find(
        (ic) => ic.contract.contractId === cmd.contractId
      );

      const consumedPayload = inputContract?.contract.payload ?? {};
      const createdPayload = Object.keys(consumedPayload).length > 0
        ? { ...consumedPayload, ...cmd.arguments }
        : cmd.arguments;

      const childEventIds = [archiveEventId, createEventId];

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
        childEventIds,
        exerciseResult: `ContractId(${newContractId})`,
      };

      eventsById[archiveEventId] = {
        eventType: 'archived',
        eventId: archiveEventId,
        contractId: cmd.contractId,
        templateId,
        witnesses: actAs,
      } as LedgerEvent;

      const signatories = inputContract?.contract.signatories ?? actAs;
      const observers = inputContract?.contract.observers ?? [];

      eventsById[createEventId] = {
        eventType: 'created',
        eventId: createEventId,
        contractId: newContractId,
        templateId,
        payload: createdPayload,
        signatories,
        observers,
        witnesses: signatories,
      };

      outputs.push({
        contractId: newContractId,
        templateId,
        payload: createdPayload,
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
    commandId: `exec-cmd-${txId.slice(-8)}`,
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
