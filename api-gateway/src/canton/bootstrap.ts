/**
 * Canton Connection Bootstrap Sequence (Section 4.7 of spec)
 *
 * Runs the following steps before any feature is available:
 * 1. VersionService.GetLedgerApiVersion
 * 2. ParticipantPruningService.GetLatestPrunedOffsets
 * 3. StateService.GetLedgerEnd
 * 4. PackageService.ListPackages
 * 5. UserManagementService.GetUser + ListUserRights
 */

import type { CantonClient } from './client.js';
import type { BootstrapInfo, PackageSummary, UserRight } from '../types.js';
import { mapFeatureDescriptors } from './services/version-service.js';

export interface BootstrapOptions {
  /** User ID for UserManagementService. Empty string = current user. */
  userId?: string;
  /** Skip user management step (e.g., sandbox with no auth). */
  skipUserManagement?: boolean;
}

/**
 * Execute the full bootstrap sequence against a connected Canton participant.
 *
 * Each step is executed sequentially because later steps depend on earlier ones
 * (e.g., pruning boundary informs what offsets are valid).
 */
export async function runBootstrapSequence(
  client: CantonClient,
  options: BootstrapOptions = {},
): Promise<BootstrapInfo> {
  // Step 1: VersionService.GetLedgerApiVersion
  const versionInfo = await client.versionService.getLedgerApiVersion();
  const featureDescriptors = mapFeatureDescriptors(versionInfo.features);

  // Step 2: ParticipantPruningService.GetLatestPrunedOffsets
  let pruningOffset = '';
  try {
    const pruningInfo = await client.pruningService.getLatestPrunedOffsets();
    pruningOffset = pruningInfo.participantPrunedUpTo;
  } catch (err) {
    // Pruning service may not be available (e.g., sandbox without admin rights)
    // Non-fatal — proceed with empty pruning offset
    console.warn('Bootstrap: PruningService unavailable, proceeding without pruning info:', err);
  }

  // Step 3: StateService.GetLedgerEnd
  const currentOffset = await client.stateService.getLedgerEnd();

  // Step 4: PackageService.ListPackages (with metadata)
  let packages: PackageSummary[] = [];
  try {
    packages = await client.packageService.listPackagesWithMetadata();
  } catch (err) {
    // Fall back to just IDs if metadata fetch fails
    console.warn('Bootstrap: Package metadata fetch partial failure:', err);
    try {
      const packageIds = await client.packageService.listPackages();
      packages = packageIds.map((id) => ({ packageId: id }));
    } catch {
      console.warn('Bootstrap: PackageService unavailable');
    }
  }

  // Step 5: UserManagementService.GetUser + ListUserRights
  let userRights: UserRight[] = [];
  if (!options.skipUserManagement) {
    try {
      const userId = options.userId ?? '';
      const userInfo = await client.userManagementService.getUser(userId);
      userRights = await client.userManagementService.listUserRights(userInfo.id);
    } catch (err) {
      // User management may fail if auth is disabled (sandbox mode)
      // or if the service is not available
      console.warn('Bootstrap: UserManagementService unavailable, proceeding without user rights:', err);
    }
  }

  // Step 6: PartyManagementService.ListKnownParties
  // Discover all local parties so we can use them as fallback when userRights is empty
  // (common in sandbox mode where user management is skipped).
  let knownParties: string[] = [];
  try {
    const partyResult = await client.partyManagementService.listKnownParties();
    knownParties = partyResult.parties
      .filter((p) => p.isLocal)
      .map((p) => p.party);
  } catch (err) {
    console.warn('Bootstrap: PartyManagementService unavailable, proceeding without known parties:', err);
  }

  return {
    apiVersion: versionInfo.version,
    featureDescriptors,
    pruningOffset,
    currentOffset,
    packages,
    userRights,
    knownParties,
    connectedAt: new Date().toISOString(),
  };
}
