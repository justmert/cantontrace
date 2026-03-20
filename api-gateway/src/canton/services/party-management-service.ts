/**
 * PartyManagementService wrapper — AllocateParty, ListKnownParties
 */

import type * as grpc from '@grpc/grpc-js';
import type {
  AllocatePartyResponse,
  ListKnownPartiesResponse,
  PartyDetails,
} from '../proto/types.js';
import { createMetadata, makeUnaryCall } from './shared.js';

export interface PartyInfo {
  party: string;
  displayName: string;
  isLocal: boolean;
  identityProviderId: string;
}

export class PartyManagementServiceClient {
  constructor(
    private readonly client: grpc.Client,
    private readonly getToken: () => string | null,
  ) {}

  /**
   * Allocate a new party on the participant.
   *
   * @param partyIdHint - Optional hint for the party ID.
   * @param displayName - Optional display name for the party.
   */
  async allocateParty(partyIdHint?: string, displayName?: string): Promise<PartyInfo> {
    const metadata = createMetadata(this.getToken());

    const request: Record<string, unknown> = {};
    if (partyIdHint) request.party_id_hint = partyIdHint;
    if (displayName) request.display_name = displayName;

    const response = await makeUnaryCall<Record<string, unknown>, AllocatePartyResponse>(
      this.client,
      'AllocateParty',
      request,
      metadata,
    );

    return mapPartyDetails(response.party_details);
  }

  /**
   * List all known parties on the participant.
   *
   * @param pageSize - Optional page size.
   * @param pageToken - Optional page token for pagination.
   */
  async listKnownParties(
    pageSize?: number,
    pageToken?: string,
  ): Promise<{ parties: PartyInfo[]; nextPageToken: string }> {
    const metadata = createMetadata(this.getToken());

    const request: Record<string, unknown> = {};
    if (pageSize) request.page_size = pageSize;
    if (pageToken) request.page_token = pageToken;

    const response = await makeUnaryCall<Record<string, unknown>, ListKnownPartiesResponse>(
      this.client,
      'ListKnownParties',
      request,
      metadata,
    );

    return {
      parties: (response.party_details ?? []).map(mapPartyDetails),
      nextPageToken: response.next_page_token ?? '',
    };
  }
}

function mapPartyDetails(details: PartyDetails): PartyInfo {
  return {
    party: details.party,
    displayName: details.display_name ?? '',
    isLocal: details.is_local ?? false,
    identityProviderId: details.identity_provider_id ?? '',
  };
}
