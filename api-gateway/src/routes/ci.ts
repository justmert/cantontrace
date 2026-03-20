/**
 * CI/CD Integration Routes
 *
 * POST /api/v1/ci/run — Full CI pipeline:
 *   1. Provision sandbox
 *   2. Upload DAR
 *   3. Run tests (Daml Script or assertion-based)
 *   4. Collect results (traces, ACS snapshot, errors)
 *   5. Tear down sandbox
 */

import type { FastifyInstance } from 'fastify';
import {
  createSandbox,
  deleteSandbox,
  uploadDar,
  runDamlScript,
} from '../services/sandbox-manager.js';
import { CantonClient } from '../canton/client.js';
import type {
  CIRunRequest,
  CIRunResult,
  CIAssertion,
  ActiveContract,
  CommandError,
  ApiResponse,
} from '../types.js';
import crypto from 'crypto';

const PLATFORM_BASE_URL = process.env.PLATFORM_URL ?? 'http://localhost:3000';

export function registerCIRoutes(app: FastifyInstance): void {
  /**
   * POST /api/v1/ci/run
   *
   * Execute a full CI pipeline:
   * 1. Provision a fresh Canton Sandbox
   * 2. Upload the DAR file
   * 3. Run test assertions against the sandbox
   * 4. Collect transaction traces, ACS snapshot, and errors
   * 5. Tear down the sandbox
   *
   * Returns comprehensive results including links to the platform UI.
   */
  app.post<{
    Body: CIRunRequest;
  }>('/api/v1/ci/run', {
    schema: {
      description: 'Execute full CI pipeline: sandbox -> upload -> test -> results -> teardown',
      tags: ['CI/CD Integration'],
      body: {
        type: 'object',
        required: ['darFile'],
        properties: {
          darFile: { type: 'string', description: 'Base64-encoded DAR file' },
          testScript: { type: 'string', description: 'Daml Script name to execute' },
          assertions: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                type: { type: 'string', enum: ['contract_exists', 'contract_count', 'no_errors'] },
                templateId: { type: 'object' },
                expectedCount: { type: 'number' },
              },
            },
          },
        },
      },
    },
  }, async (request, reply) => {
    const runId = crypto.randomUUID();
    const startTime = Date.now();
    const body = request.body;

    let sandboxId = '';

    try {
      // Step 1: Provision sandbox
      request.log.info({ runId }, 'CI: Provisioning sandbox');
      const sandbox = await createSandbox({
        enableProfiling: true,
      });
      sandboxId = sandbox.id;

      // Wait for sandbox to be ready (poll status)
      await waitForSandboxReady(sandboxId, 60000);

      // Step 2: Upload DAR
      request.log.info({ runId, sandboxId }, 'CI: Uploading DAR');
      await uploadDar(sandboxId, body.darFile);

      // Step 3: Connect to the sandbox and run bootstrap
      request.log.info({ runId, sandboxId }, 'CI: Connecting to sandbox');
      const client = new CantonClient(sandbox.ledgerApiEndpoint);
      await client.connect();
      const bootstrapInfo = await client.bootstrap({ skipUserManagement: true });

      // Step 4: Run test script if specified
      const transactionTraces: string[] = [];
      const errors: CommandError[] = [];

      if (body.testScript) {
        request.log.info({ runId, testScript: body.testScript }, 'CI: Running test script');

        // The DAR was uploaded to the sandbox — write it to a temp file for the CLI
        const darPath = `/tmp/ci-${runId}.dar`;

        const fs = await import('fs/promises');
        await fs.writeFile(darPath, Buffer.from(body.darFile, 'base64'));

        try {
          const scriptResult = await runDamlScript(
            sandbox.ledgerApiEndpoint,
            darPath,
            body.testScript,
          );

          if (!scriptResult.success) {
            errors.push({
              errorCodeId: 'DAML_SCRIPT_FAILED',
              categoryId: 'InvalidIndependentOfSystemState',
              grpcStatusCode: 'INTERNAL',
              message: scriptResult.error ?? 'Daml Script execution failed',
              correlationId: runId,
            });
            request.log.error({ runId, error: scriptResult.error }, 'CI: Daml Script failed');
          } else {
            request.log.info({ runId, output: scriptResult.output.slice(0, 500) }, 'CI: Daml Script succeeded');
          }
        } finally {
          // Clean up temp file
          await fs.unlink(darPath).catch(() => {});
        }
      }

      // Step 5: Collect ACS snapshot
      request.log.info({ runId }, 'CI: Collecting ACS snapshot');
      const currentOffset = await client.stateService.getLedgerEnd();

      // Get all parties from bootstrap
      const allParties = bootstrapInfo.userRights
        .filter((r): r is { type: 'CanReadAs'; party: string } => 'party' in r)
        .map((r) => r.party);

      let acsSnapshot: ActiveContract[] = [];
      if (allParties.length > 0) {
        const acs = await client.stateService.getActiveContracts(currentOffset, allParties);
        acsSnapshot = acs.contracts;
      }

      // Step 6: Collect completions (check for errors)
      // In a full implementation, we'd stream completions from the test script execution

      // Step 7: Run assertions
      const assertionResults = runAssertions(body.assertions ?? [], acsSnapshot, errors);

      // Determine overall status
      const allAssertionsPassed = assertionResults.every((a) => a.passed);
      const hasErrors = errors.length > 0;
      const status = hasErrors ? 'error' : allAssertionsPassed ? 'passed' : 'failed';

      const duration = Date.now() - startTime;

      // Disconnect from sandbox
      client.disconnect();

      // Step 8: Tear down sandbox
      request.log.info({ runId, sandboxId }, 'CI: Tearing down sandbox');
      await deleteSandbox(sandboxId);

      const result: CIRunResult = {
        runId,
        status,
        sandboxId,
        duration,
        transactionTraces,
        acsSnapshot,
        errors,
        assertions: assertionResults,
        platformUrl: `${PLATFORM_BASE_URL}/ci/runs/${runId}`,
      };

      const response: ApiResponse<CIRunResult> = {
        data: result,
        meta: {
          timestamp: new Date().toISOString(),
        },
      };

      return reply.send(response);
    } catch (err) {
      // Clean up sandbox on failure
      if (sandboxId) {
        try {
          await deleteSandbox(sandboxId);
        } catch {
          request.log.warn({ sandboxId }, 'CI: Failed to clean up sandbox after error');
        }
      }

      const duration = Date.now() - startTime;
      const message = err instanceof Error ? err.message : 'Unknown error';

      const result: CIRunResult = {
        runId,
        status: 'error',
        sandboxId,
        duration,
        transactionTraces: [],
        acsSnapshot: [],
        errors: [{
          errorCodeId: 'CI_PIPELINE_ERROR',
          categoryId: 'SystemInternalAssumptionViolated',
          grpcStatusCode: 'INTERNAL',
          message,
          correlationId: runId,
        }],
        assertions: [],
        platformUrl: `${PLATFORM_BASE_URL}/ci/runs/${runId}`,
      };

      return reply.send({
        data: result,
        meta: { timestamp: new Date().toISOString() },
      } satisfies ApiResponse<CIRunResult>);
    }
  });
}

// ============================================================
// Assertion Runner
// ============================================================

function runAssertions(
  assertions: CIAssertion[],
  acs: ActiveContract[],
  errors: CommandError[],
): Array<CIAssertion & { passed: boolean; actual?: unknown }> {
  return assertions.map((assertion) => {
    switch (assertion.type) {
      case 'contract_exists': {
        if (!assertion.templateId) {
          return { ...assertion, passed: false, actual: 'Missing templateId in assertion' };
        }
        const found = acs.some(
          (c) =>
            c.templateId.moduleName === assertion.templateId!.moduleName &&
            c.templateId.entityName === assertion.templateId!.entityName,
        );
        return { ...assertion, passed: found, actual: found ? 'found' : 'not found' };
      }

      case 'contract_count': {
        if (!assertion.templateId || assertion.expectedCount === undefined) {
          return { ...assertion, passed: false, actual: 'Missing templateId or expectedCount' };
        }
        const count = acs.filter(
          (c) =>
            c.templateId.moduleName === assertion.templateId!.moduleName &&
            c.templateId.entityName === assertion.templateId!.entityName,
        ).length;
        return {
          ...assertion,
          passed: count === assertion.expectedCount,
          actual: count,
        };
      }

      case 'no_errors': {
        return {
          ...assertion,
          passed: errors.length === 0,
          actual: errors.length > 0 ? `${errors.length} errors found` : 'no errors',
        };
      }

      default:
        return { ...assertion, passed: false, actual: 'Unknown assertion type' };
    }
  });
}

// ============================================================
// Helpers
// ============================================================

async function waitForSandboxReady(sandboxId: string, timeoutMs: number): Promise<void> {
  const { getSandbox } = await import('../services/sandbox-manager.js');
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    const sandbox = getSandbox(sandboxId);
    if (!sandbox) throw new Error(`Sandbox ${sandboxId} disappeared`);
    if (sandbox.status === 'running') return;
    if (sandbox.status === 'error') throw new Error(`Sandbox ${sandboxId} failed to start`);

    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  throw new Error(`Sandbox ${sandboxId} did not become ready within ${timeoutMs}ms`);
}
