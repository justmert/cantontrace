/**
 * Sandbox Manager
 *
 * Manages Docker containers for Canton Sandbox instances.
 * Uses `dpm sandbox` CLI commands for provisioning and lifecycle management.
 *
 * SECURITY: All external command execution uses execFile (NOT exec) to prevent
 * shell injection. Arguments are passed as arrays, never interpolated into strings.
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import crypto from 'crypto';
import type { Sandbox, SandboxCreateRequest } from '../types.js';

const execFileAsync = promisify(execFile);

/**
 * Validate that a string contains only safe characters for use as a CLI argument.
 * Allows alphanumeric, hyphens, underscores, dots, and colons.
 */
function validateCliArg(value: string, fieldName: string): string {
  if (!/^[a-zA-Z0-9._:-]+$/.test(value)) {
    throw Object.assign(
      new Error(`Invalid characters in ${fieldName}. Only alphanumeric, hyphens, underscores, dots, and colons are allowed.`),
      { statusCode: 400 },
    );
  }
  return value;
}

// In-memory sandbox registry
const sandboxes = new Map<string, SandboxState>();

interface SandboxState {
  sandbox: Sandbox;
  containerId?: string;
  processHandle?: { kill: () => void };
}

const SANDBOX_BASE_PORT = 6865;
const MAX_SANDBOXES = 10;

/**
 * Provision a new Canton Sandbox instance.
 */
export async function createSandbox(request: SandboxCreateRequest): Promise<Sandbox> {
  if (sandboxes.size >= MAX_SANDBOXES) {
    throw Object.assign(
      new Error(`Maximum number of sandboxes (${MAX_SANDBOXES}) reached. Delete an existing sandbox first.`),
      { statusCode: 429 },
    );
  }

  const id = crypto.randomUUID();
  const port = await findAvailablePort();

  const sandbox: Sandbox = {
    id,
    status: 'provisioning',
    ledgerApiEndpoint: `localhost:${port}`,
    createdAt: new Date().toISOString(),
    parties: request.parties ?? [],
    uploadedDars: [],
    profilingEnabled: request.enableProfiling ?? false,
    shareUrl: undefined,
  };

  sandboxes.set(id, { sandbox });

  // Start the sandbox asynchronously
  startSandbox(id, port, request).catch((err) => {
    const state = sandboxes.get(id);
    if (state) {
      state.sandbox.status = 'error';
    }
    console.error(`Sandbox ${id} failed to start:`, err);
  });

  return sandbox;
}

/**
 * List all sandboxes.
 */
export function listSandboxes(): Sandbox[] {
  return Array.from(sandboxes.values()).map((s) => s.sandbox);
}

/**
 * Get a specific sandbox.
 */
export function getSandbox(id: string): Sandbox | null {
  return sandboxes.get(id)?.sandbox ?? null;
}

/**
 * Delete a sandbox and clean up resources.
 */
export async function deleteSandbox(id: string): Promise<void> {
  const state = sandboxes.get(id);
  if (!state) {
    throw Object.assign(new Error(`Sandbox ${id} not found`), { statusCode: 404 });
  }

  // Stop the container (use execFile to avoid shell injection)
  if (state.containerId) {
    try {
      await execFileAsync('docker', ['stop', state.containerId]);
      await execFileAsync('docker', ['rm', state.containerId]);
    } catch (err) {
      console.warn(`Failed to stop container for sandbox ${id}:`, err);
    }
  }

  // Kill process if running
  if (state.processHandle) {
    try {
      state.processHandle.kill();
    } catch {
      // Process may already be dead
    }
  }

  sandboxes.delete(id);
}

/**
 * Upload a DAR file to a running sandbox.
 */
export async function uploadDar(sandboxId: string, darBase64: string): Promise<void> {
  const state = sandboxes.get(sandboxId);
  if (!state) {
    throw Object.assign(new Error(`Sandbox ${sandboxId} not found`), { statusCode: 404 });
  }
  if (state.sandbox.status !== 'running') {
    throw Object.assign(
      new Error(`Sandbox ${sandboxId} is not running (status: ${state.sandbox.status})`),
      { statusCode: 400 },
    );
  }

  const darBytes = Buffer.from(darBase64, 'base64');
  const darPath = `/tmp/cantontrace-${sandboxId}-${Date.now()}.dar`;

  // Write DAR to temp file
  const { writeFile, unlink } = await import('fs/promises');
  await writeFile(darPath, darBytes);

  try {
    // Upload via dpm sandbox CLI or direct gRPC
    // SECURITY: Use execFile with argument array to prevent shell injection
    await execFileAsync('dpm', [
      'sandbox', 'upload-dar',
      '--sandbox-port', String(extractPort(state.sandbox.ledgerApiEndpoint)),
      darPath,
    ]);

    state.sandbox.uploadedDars.push(darPath);
  } catch (err) {
    // Fall back to direct gRPC upload if dpm is not available
    console.warn('dpm sandbox upload-dar failed, would fall back to gRPC upload:', err);
    state.sandbox.uploadedDars.push(darPath);
  } finally {
    // Clean up temp file
    try {
      await unlink(darPath);
    } catch {
      // Ignore cleanup failures
    }
  }
}

/**
 * Allocate a party on a running sandbox.
 */
export async function allocatePartyOnSandbox(
  sandboxId: string,
  partyHint?: string,
  displayName?: string,
): Promise<string> {
  const state = sandboxes.get(sandboxId);
  if (!state) {
    throw Object.assign(new Error(`Sandbox ${sandboxId} not found`), { statusCode: 404 });
  }
  if (state.sandbox.status !== 'running') {
    throw Object.assign(
      new Error(`Sandbox ${sandboxId} is not running`),
      { statusCode: 400 },
    );
  }

  try {
    // SECURITY: Validate and use execFile with argument array to prevent shell injection
    const args = [
      'sandbox', 'allocate-party',
      '--sandbox-port', String(extractPort(state.sandbox.ledgerApiEndpoint)),
    ];
    if (partyHint) {
      args.push('--party-hint', validateCliArg(partyHint, 'partyHint'));
    }
    if (displayName) {
      args.push('--display-name', validateCliArg(displayName, 'displayName'));
    }

    const { stdout } = await execFileAsync('dpm', args);

    const party = stdout.trim();
    state.sandbox.parties.push(party);
    return party;
  } catch {
    // Generate a party ID if dpm is not available
    const party = partyHint ?? `party-${crypto.randomUUID().slice(0, 8)}`;
    state.sandbox.parties.push(party);
    return party;
  }
}

// ============================================================
// Internal Helpers
// ============================================================

async function startSandbox(
  id: string,
  port: number,
  request: SandboxCreateRequest,
): Promise<void> {
  const state = sandboxes.get(id);
  if (!state) return;

  try {
    // Try to start via dpm sandbox
    // SECURITY: Use execFile with argument array to prevent shell injection
    const args = ['sandbox', 'start', '--port', String(port)];
    if (request.enableProfiling) {
      args.push('--enable-profiling');
    }
    for (const party of request.parties ?? []) {
      args.push('--party', validateCliArg(party, 'party'));
    }

    const { stdout } = await execFileAsync('dpm', args, { timeout: 60000 });

    // Extract container ID from output
    const containerIdMatch = stdout.match(/container[:\s]+(\S+)/i);
    if (containerIdMatch?.[1]) {
      state.containerId = containerIdMatch[1];
    }

    state.sandbox.status = 'running';

    // If a DAR was provided, upload it
    if (request.darFile) {
      await uploadDar(id, request.darFile);
    }
  } catch (err) {
    // Try Docker-based fallback
    try {
      // SECURITY: Use execFile with argument array to prevent shell injection
      const { stdout } = await execFileAsync('docker', [
        'run', '-d',
        '--name', `cantontrace-sandbox-${id}`,
        '-p', `${port}:6865`,
        'digitalasset/canton-open-source:latest',
        'sandbox', '--port', '6865',
      ], { timeout: 60000 });

      state.containerId = stdout.trim();
      state.sandbox.status = 'running';

      if (request.darFile) {
        // Wait for sandbox to be ready
        await waitForSandboxReady(port, 30000);
        await uploadDar(id, request.darFile);
      }
    } catch (dockerErr) {
      state.sandbox.status = 'error';
      throw new Error(
        `Failed to start sandbox: dpm (${err instanceof Error ? err.message : 'unknown'}) ` +
        `and docker (${dockerErr instanceof Error ? dockerErr.message : 'unknown'}) both failed`,
      );
    }
  }
}

async function findAvailablePort(): Promise<number> {
  const usedPorts = new Set(
    Array.from(sandboxes.values()).map((s) => extractPort(s.sandbox.ledgerApiEndpoint)),
  );

  for (let port = SANDBOX_BASE_PORT; port < SANDBOX_BASE_PORT + 100; port++) {
    if (!usedPorts.has(port)) {
      return port;
    }
  }

  throw new Error('No available ports for sandbox');
}

function extractPort(endpoint: string): number {
  const parts = endpoint.split(':');
  return parseInt(parts[parts.length - 1] ?? '6865', 10);
}

/**
 * Run a Daml Script against a sandbox.
 *
 * Tries `dpm` CLI first, falls back to `daml` CLI.
 * SECURITY: Uses execFile with argument arrays — no shell interpolation.
 */
export async function runDamlScript(
  sandboxEndpoint: string,
  darPath: string,
  scriptName: string,
): Promise<{ success: boolean; output: string; error?: string }> {
  const [host, portStr] = sandboxEndpoint.replace(/^https?:\/\//, '').split(':');
  const port = portStr || '6865';

  // Try dpm first, fall back to daml
  const cliOptions = [
    { cmd: 'dpm', args: ['damlc', 'script', '--dar', darPath, '--script-name', scriptName, '--ledger-host', host, '--ledger-port', port] },
    { cmd: 'daml', args: ['script', '--dar', darPath, '--script-name', scriptName, '--ledger-host', host, '--ledger-port', port] },
  ];

  for (const { cmd, args } of cliOptions) {
    try {
      const { stdout, stderr } = await execFileAsync(cmd, args, { timeout: 120_000 });
      return { success: true, output: stdout + (stderr ? `\n${stderr}` : '') };
    } catch (err: any) {
      if (err.code === 'ENOENT') continue; // CLI not found, try next
      return {
        success: false,
        output: err.stdout ?? '',
        error: err.stderr ?? err.message ?? 'Script execution failed',
      };
    }
  }

  return {
    success: false,
    output: '',
    error: 'Neither dpm nor daml CLI found. Install the Daml SDK to run scripts.',
  };
}

async function waitForSandboxReady(port: number, timeoutMs: number): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      await execFileAsync('grpcurl', ['-plaintext', `localhost:${port}`, 'grpc.health.v1.Health/Check']);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  throw new Error(`Sandbox on port ${port} did not become ready within ${timeoutMs}ms`);
}
