/**
 * PruningServiceClient — Pruning boundary discovery
 *
 * Used in bootstrap to discover the pruning boundary.
 * All historical features must check against this before querying.
 *
 * NOTE: In Canton 3.4+, GetLatestPrunedOffsets moved from admin.ParticipantPruningService
 * to the main StateService. This wrapper uses the StateService gRPC client
 * for GetLatestPrunedOffsets.
 */

import type * as grpc from '@grpc/grpc-js';
import type { GetLatestPrunedOffsetsResponse } from '../proto/types.js';
import { createMetadata, makeUnaryCall } from './shared.js';

export interface PruningInfo {
  /** The offset up to which participant data has been pruned (inclusive). */
  participantPrunedUpTo: string;
  /** The offset up to which all divulged contracts have been pruned (inclusive). */
  allDivulgedContractsPrunedUpTo: string;
}

export class PruningServiceClient {
  /**
   * @param stateClient - The StateService gRPC client (for GetLatestPrunedOffsets)
   * @param getToken - Token provider function
   */
  constructor(
    private readonly stateClient: grpc.Client,
    private readonly getToken: () => string | null,
  ) {}

  /**
   * Get the latest pruned offsets for the participant.
   *
   * Returns the pruning boundary — data before this offset has been permanently deleted.
   *
   * NOTE: This calls StateService.GetLatestPrunedOffsets, not the admin PruningService.
   */
  async getLatestPrunedOffsets(): Promise<PruningInfo> {
    const metadata = createMetadata(this.getToken());

    const response = await makeUnaryCall<object, GetLatestPrunedOffsetsResponse>(
      this.stateClient,
      'GetLatestPrunedOffsets',
      {},
      metadata,
    );

    return {
      participantPrunedUpTo: response.participant_pruned_up_to_inclusive ?? '',
      allDivulgedContractsPrunedUpTo: response.all_divulged_contracts_pruned_up_to_inclusive ?? '',
    };
  }

  /**
   * Check whether a given offset is within the pruned range.
   *
   * @param offset - The offset to check.
   * @param pruningBoundary - The pruning boundary offset.
   * @returns true if the offset is before or at the pruning boundary (data pruned).
   */
  static isOffsetPruned(offset: string, pruningBoundary: string): boolean {
    if (!pruningBoundary) return false;
    if (!offset) return false;

    // Offsets in Canton are participant-local, monotonically increasing strings.
    // String comparison works correctly for hex-encoded offsets.
    return offset <= pruningBoundary;
  }
}
