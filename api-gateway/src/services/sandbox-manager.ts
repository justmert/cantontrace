/**
 * Sandbox Manager
 *
 * Manages local Canton Sandbox instances via `dpm sandbox` (JVM processes).
 * Each sandbox is a Canton node with an in-memory participant, sequencer,
 * and mediator, listening on a set of consecutive ports.
 *
 * SECURITY: All external command execution uses execFile (NOT exec) to prevent
 * shell injection. Arguments are passed as arrays, never interpolated into strings.
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import { writeFile, unlink } from 'fs/promises';
import net from 'net';
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

// Track freed ports so they can be reused after sandbox deletion
const freedPorts = new Set<number>();

interface SandboxState {
  sandbox: Sandbox;
  processHandle?: { pid?: number; kill: (signal?: string) => void };
  /** Original creation request, kept for reset */
  originalRequest?: SandboxCreateRequest;
}

// Start well above cn-quickstart's range. Each sandbox needs 5+ consecutive ports.
// cn-quickstart uses 6864-6869, 7265, 7768, and many others. Start at 10000 to be safe.
const SANDBOX_BASE_PORT = 10000;
const MAX_SANDBOXES = 10;
const PORT_RANGE = 100;

/**
 * Check if a TCP port is available by attempting to bind to it.
 * Returns true if the port is free, false if it is in use.
 */
function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => {
      resolve(false);
    });
    server.once('listening', () => {
      server.close(() => {
        resolve(true);
      });
    });
    server.listen(port, '127.0.0.1');
  });
}

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
    name: request.name || `Sandbox ${port}`,
    status: 'provisioning',
    ledgerApiEndpoint: `localhost:${port}`,
    createdAt: new Date().toISOString(),
    parties: [], // Populated after actual Canton allocation in startSandbox
    uploadedDars: [],
    profilingEnabled: request.enableProfiling ?? false,
    shareUrl: undefined,
  };

  sandboxes.set(id, { sandbox, originalRequest: request });

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
 * Stop a sandbox process with proper cleanup.
 * Sends SIGTERM first, waits briefly, then SIGKILL if still alive.
 */
async function stopSandboxProcess(state: SandboxState, id: string): Promise<void> {
  // Kill process tree — dpm spawns a JVM child that doesn't die with SIGTERM.
  // First try SIGTERM, then escalate to SIGKILL on the entire process group.
  if (state.processHandle) {
    const pid = state.processHandle.pid;
    try {
      state.processHandle.kill('SIGTERM');
    } catch {
      // Process may already be dead
    }
    // Also kill the process group so child JVM processes receive the signal
    if (pid) {
      try { process.kill(-pid, 'SIGTERM'); } catch { /* group may not exist */ }
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
    // Escalate: SIGKILL the process group in case SIGTERM was ignored
    if (pid) {
      try { process.kill(-pid, 'SIGKILL'); } catch { /* already dead */ }
    }
    try {
      state.processHandle.kill('SIGKILL');
    } catch {
      // Process may already be dead
    }
  }

  // Force kill any remaining processes on all 6 sandbox ports.
  // dpm/Canton binds 6 consecutive ports; a child JVM may linger on any of them.
  const port = extractPort(state.sandbox.ledgerApiEndpoint);
  for (let offset = 0; offset < 6; offset++) {
    try {
      const { stdout } = await execFileAsync('lsof', ['-ti', `:${port + offset}`]);
      const pids = stdout.trim().split('\n').filter(Boolean);
      for (const pidStr of pids) {
        try { process.kill(parseInt(pidStr, 10), 'SIGKILL'); } catch { /* already dead */ }
      }
    } catch {
      // No processes on this port — good
    }
  }
}

/**
 * Clean up temp files associated with a sandbox, including the Canton config file.
 */
async function cleanupTempFiles(id: string): Promise<void> {
  const { readdir, unlink: unlinkAsync } = await import('fs/promises');

  // Remove the Canton config file explicitly
  try {
    await unlinkAsync(cantonConfigPath(id));
  } catch {
    // May not exist
  }

  // Remove any other temp files (DARs, etc.)
  try {
    const tmpFiles = await readdir('/tmp');
    for (const file of tmpFiles) {
      if (file.startsWith(`cantontrace-${id}`) || file.startsWith(`cantontrace-sandbox-${id}`)) {
        try {
          await unlinkAsync(`/tmp/${file}`);
        } catch {
          // Best-effort cleanup
        }
      }
    }
  } catch {
    // /tmp read failed — non-critical
  }
}

/**
 * Delete a sandbox and clean up resources.
 */
export async function deleteSandbox(id: string): Promise<void> {
  const state = sandboxes.get(id);
  if (!state) {
    throw Object.assign(new Error(`Sandbox ${id} not found`), { statusCode: 404 });
  }

  const port = extractPort(state.sandbox.ledgerApiEndpoint);

  // Stop the process/container
  await stopSandboxProcess(state, id);

  // Clean up temp files
  await cleanupTempFiles(id);

  // Mark port as freed for reuse and remove from registry
  freedPorts.add(port);
  sandboxes.delete(id);
}

/**
 * Reset a sandbox: stop it, clear state, restart with the same configuration.
 *
 * Properly kills the JVM process tree, waits for all 6 sandbox ports to be
 * freed, then restarts with the original request parameters.
 */
export async function resetSandbox(id: string): Promise<Sandbox> {
  const state = sandboxes.get(id);
  if (!state) {
    throw Object.assign(new Error(`Sandbox ${id} not found`), { statusCode: 404 });
  }

  const port = extractPort(state.sandbox.ledgerApiEndpoint);
  const originalRequest = state.originalRequest ?? {
    parties: [...state.sandbox.parties],
    enableProfiling: state.sandbox.profilingEnabled,
  };

  // Stop the running sandbox
  state.sandbox.status = 'stopped';
  await stopSandboxProcess(state, id);

  // Clean up temp files
  await cleanupTempFiles(id);

  // Wait for all 6 sandbox ports to be freed before restarting.
  // The JVM may take a moment to release sockets after SIGKILL.
  await waitForPortsFree(port, 6, 15000);

  // Reset sandbox state, keeping same ID and port
  const resetSandboxObj: Sandbox = {
    id,
    status: 'provisioning',
    ledgerApiEndpoint: `localhost:${port}`,
    createdAt: new Date().toISOString(),
    parties: originalRequest.parties ?? [],
    uploadedDars: [],
    profilingEnabled: originalRequest.enableProfiling ?? false,
    shareUrl: undefined,
  };

  const newState: SandboxState = {
    sandbox: resetSandboxObj,
    originalRequest,
  };
  sandboxes.set(id, newState);

  // Restart the sandbox asynchronously
  startSandbox(id, port, originalRequest).catch((err) => {
    const s = sandboxes.get(id);
    if (s) {
      s.sandbox.status = 'error';
    }
    console.error(`Sandbox ${id} failed to restart during reset:`, err);
  });

  return resetSandboxObj;
}

/**
 * Upload a DAR file to a running sandbox.
 *
 * Sandboxes run as local JVM processes via `dpm sandbox` (not Docker).
 * Upload uses grpcurl to call the Ledger API PackageService/UploadDarFile
 * on the sandbox's gRPC port, sending the DAR bytes as a base64-encoded
 * `dar_file` field. This mirrors how allocatePartyOnSandbox already works.
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

  const port = extractPort(state.sandbox.ledgerApiEndpoint);
  const darFileName = `upload-${Date.now()}.dar`;
  const hostDarPath = `/tmp/cantontrace-${sandboxId}-${darFileName}`;
  const darBytes = Buffer.from(darBase64, 'base64');

  await writeFile(hostDarPath, darBytes);

  try {
    // Upload via Canton Admin API (port+1) PackageService/UploadDar.
    // Canton 3.4.11 uses the admin.participant.v30 service, NOT the Ledger API.
    // Request format: {dars: [{bytes: "<base64>"}], vet_all_packages: true, synchronize_vetting: true}
    const adminPayload = JSON.stringify({
      dars: [{ bytes: darBase64, description: darFileName }],
      vet_all_packages: true,
      synchronize_vetting: true,
    });

    await execFileAsync('grpcurl', [
      '-plaintext',
      '-d', adminPayload,
      `localhost:${port + 1}`,
      'com.digitalasset.canton.admin.participant.v30.PackageService/UploadDar',
    ], { timeout: 120000 });

    state.sandbox.uploadedDars.push(darFileName);
  } catch (adminErr) {
    console.warn(`DAR upload via admin API failed for sandbox ${sandboxId}:`, adminErr);

    try {
      // Fallback: try Ledger API (some setups expose UploadDarFile there)
      const ledgerPayload = JSON.stringify({ dar_file: darBase64 });
      await execFileAsync('grpcurl', [
        '-plaintext',
        '-d', ledgerPayload,
        `localhost:${port}`,
        'com.daml.ledger.api.v2.PackageService/UploadDarFile',
      ], { timeout: 120000 });

      state.sandbox.uploadedDars.push(darFileName);
    } catch (ledgerErr) {
      console.warn(
        `DAR upload via Canton admin API also failed for sandbox ${sandboxId}:`,
        adminErr,
      );
      // Last resort: record the DAR path so it is tracked in sandbox state.
      // The user can connect to the sandbox through CantonTrace's main UI
      // and use the normal package upload flow (which goes through the
      // full CantonClient gRPC connection).
      state.sandbox.uploadedDars.push(hostDarPath);
      throw Object.assign(
        new Error(
          `DAR upload failed. The file has been saved to ${hostDarPath}. ` +
          `Connect to the sandbox via CantonTrace and use the package upload feature, ` +
          `or ensure grpcurl is installed and the sandbox Ledger API is accessible at localhost:${port}.`,
        ),
        { statusCode: 502 },
      );
    }
  } finally {
    // Clean up the temp file only if we successfully uploaded via gRPC.
    // If we fell through to the error path, the file is kept for manual upload.
    if (state.sandbox.uploadedDars.includes(darFileName)) {
      try { await unlink(hostDarPath); } catch { /* best-effort */ }
    }
  }
}

/**
 * Allocate a party on a running sandbox via the Ledger API PartyManagementService.
 *
 * Uses grpcurl to call the gRPC endpoint directly rather than relying on
 * an external CLI tool.
 *
 * @param displayName - Accepted for API compatibility but ignored.
 *   Canton 3.x removed display_name from AllocatePartyRequest (reserved field 2).
 */
export async function allocatePartyOnSandbox(
  sandboxId: string,
  partyHint?: string,
  _displayName?: string,
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

  const port = extractPort(state.sandbox.ledgerApiEndpoint);
  const hint = partyHint ? validateCliArg(partyHint, 'partyHint') : `party-${crypto.randomUUID().slice(0, 8)}`;

  try {
    // SECURITY: Use execFile with argument array to prevent shell injection.
    // The JSON payload is constructed safely from validated inputs.
    //
    // Canton 3.4.11 AllocatePartyRequest fields:
    //   party_id_hint, local_metadata, identity_provider_id, synchronizer_id, user_id
    // Note: display_name was removed in Canton 3.x (reserved field 2).
    const grpcPayload = JSON.stringify({
      party_id_hint: hint,
    });

    // PartyManagementService is available on the Ledger API port
    // (com.daml.ledger.api.v2.admin.PartyManagementService).
    const { stdout } = await execFileAsync('grpcurl', [
      '-plaintext',
      '-d', grpcPayload,
      `localhost:${port}`,
      'com.daml.ledger.api.v2.admin.PartyManagementService/AllocateParty',
    ], { timeout: 15000 });

    // Extract the party identifier from the gRPC response.
    // grpcurl emits snake_case JSON, e.g.:
    //   { "party_details": { "party": "alice::12200a3f...", "is_local": true } }
    try {
      const response = JSON.parse(stdout);
      const partyId = response.party_details?.party ?? hint;
      if (!state.sandbox.parties.includes(partyId)) {
        state.sandbox.parties.push(partyId);
      }
      return partyId;
    } catch {
      // Could not parse response — use the hint as the party name
      if (!state.sandbox.parties.includes(hint)) {
        state.sandbox.parties.push(hint);
      }
      return hint;
    }
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    throw Object.assign(
      new Error(`Failed to allocate party "${hint}" on sandbox ${sandboxId}: ${errMsg}`),
      { statusCode: 502 },
    );
  }
}

// ============================================================
// Internal Helpers
// ============================================================

/**
 * Return the path to the Canton config file for a given sandbox ID.
 */
function cantonConfigPath(id: string): string {
  return `/tmp/cantontrace-sandbox-${id}.conf`;
}

async function startSandbox(
  id: string,
  port: number,
  request: SandboxCreateRequest,
): Promise<void> {
  const state = sandboxes.get(id);
  if (!state) return;

  // Resolve dpm path — installed at ~/.dpm/bin/dpm
  const homeDir = process.env.HOME ?? process.env.USERPROFILE ?? '/root';
  const dpmPath = `${homeDir}/.dpm/bin/dpm`;

  try {
    // Build dpm sandbox arguments using a config file
    // Canton sandbox needs 6 ports: ledger-api, admin-api, http-ledger-api,
    // sequencer-public, sequencer-admin, mediator-admin
    const configPath = cantonConfigPath(id);
    const portConfig = `
canton.participants.sandbox.ledger-api.port = ${port}
canton.participants.sandbox.admin-api.port = ${port + 1}
canton.participants.sandbox.http-ledger-api.port = ${port + 2}
canton.sequencers.sequencer1.public-api.port = ${port + 3}
canton.sequencers.sequencer1.admin-api.port = ${port + 4}
canton.mediators.mediator1.admin-api.port = ${port + 5}
`;
    await writeFile(configPath, portConfig, 'utf-8');

    const args = [
      'sandbox',
      '-c', configPath,
    ];

    if (request.enableProfiling) {
      args.push('--dev');
    }

    // Start dpm sandbox as a background process
    // SECURITY: execFile with argument array prevents shell injection
    const { spawn } = await import('child_process');
    const child = spawn(dpmPath, args, {
      detached: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    // Store the process reference for later cleanup
    state.processHandle = child;
    if (child.pid) {
      (state as Record<string, unknown>).pid = child.pid;
    }

    child.unref();

    // Capture stderr/stdout for debugging
    let output = '';
    child.stdout?.on('data', (data: Buffer) => { output += data.toString(); });
    child.stderr?.on('data', (data: Buffer) => { output += data.toString(); });

    child.on('error', (err) => {
      console.error(`Sandbox ${id} process error:`, err);
      state.sandbox.status = 'error';
    });

    child.on('exit', (code) => {
      if (code !== 0 && state.sandbox.status !== 'stopped') {
        console.error(`Sandbox ${id} exited with code ${code}. Output: ${output.slice(-500)}`);
        state.sandbox.status = 'error';
      }
    });

    // Wait for sandbox to be fully ready (gRPC services registered)
    // dpm sandbox takes ~10-30s to start Canton
    await waitForSandboxReady(port, 60000);
    state.sandbox.status = 'running';

    // Parties and DARs are added separately via the sandbox detail page
    // after the sandbox is running. No auto-provisioning during creation.
  } catch (err) {
    state.sandbox.status = 'error';
    throw new Error(
      `Failed to start sandbox ${id}: ${err instanceof Error ? err.message : 'unknown error'}`,
    );
  }
}

async function findAvailablePort(): Promise<number> {
  const usedPorts = new Set(
    Array.from(sandboxes.values()).map((s) => extractPort(s.sandbox.ledgerApiEndpoint)),
  );

  // Each sandbox needs 6 consecutive ports, step by 6
  for (let port = SANDBOX_BASE_PORT; port < SANDBOX_BASE_PORT + PORT_RANGE; port += 6) {
    if (usedPorts.has(port)) {
      continue;
    }

    // Check all 6 consecutive ports for availability
    let allFree = true;
    for (let offset = 0; offset < 6; offset++) {
      const available = await isPortAvailable(port + offset);
      if (!available) {
        allFree = false;
        break;
      }
    }

    if (allFree) {
      freedPorts.delete(port);
      return port;
    }
  }

  throw Object.assign(
    new Error(
      `No available ports in range ${SANDBOX_BASE_PORT}-${SANDBOX_BASE_PORT + PORT_RANGE - 1}. ` +
      `All ports are occupied. Delete existing sandboxes or free external processes.`,
    ),
    { statusCode: 503 },
  );
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
  const parts = sandboxEndpoint.replace(/^https?:\/\//, '').split(':');
  const host = parts[0] ?? 'localhost';
  const port = parts[1] ?? '6865';

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

/**
 * Wait until a range of consecutive ports are all free.
 * Polls every 500ms until all ports are available or the timeout expires.
 * This is critical after killing a JVM process, as the OS may take a moment
 * to release the sockets (especially with SO_LINGER / TIME_WAIT).
 */
async function waitForPortsFree(basePort: number, count: number, timeoutMs: number): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    let allFree = true;
    for (let offset = 0; offset < count; offset++) {
      const free = await isPortAvailable(basePort + offset);
      if (!free) {
        allFree = false;
        break;
      }
    }
    if (allFree) return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  // If ports are still occupied after timeout, log a warning but proceed anyway.
  // startSandbox will fail with a clear error if the port is truly stuck.
  console.warn(
    `Ports ${basePort}-${basePort + count - 1} not fully freed after ${timeoutMs}ms. ` +
    `Proceeding with restart — it may fail if ports are still held.`,
  );
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
