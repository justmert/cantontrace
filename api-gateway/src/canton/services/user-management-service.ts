/**
 * UserManagementService wrapper — GetUser, ListUserRights
 *
 * Used in bootstrap sequence to verify authenticated user's rights.
 */

import type * as grpc from '@grpc/grpc-js';
import type { GetUserResponse, ListUserRightsResponse, Right } from '../proto/types.js';
import { createMetadata, makeUnaryCall } from './shared.js';
import type { UserRight } from '../../types.js';

export interface UserInfo {
  id: string;
  primaryParty: string;
  isDeactivated: boolean;
  identityProviderId: string;
}

export class UserManagementServiceClient {
  constructor(
    private readonly client: grpc.Client,
    private readonly getToken: () => string | null,
  ) {}

  /**
   * Get user information by ID.
   * If userId is empty, returns the currently authenticated user.
   */
  async getUser(userId: string): Promise<UserInfo> {
    const metadata = createMetadata(this.getToken());

    const response = await makeUnaryCall<{ user_id: string }, GetUserResponse>(
      this.client,
      'GetUser',
      { user_id: userId },
      metadata,
    );

    return {
      id: response.user.id,
      primaryParty: response.user.primary_party ?? '',
      isDeactivated: response.user.is_deactivated ?? false,
      identityProviderId: response.user.identity_provider_id ?? '',
    };
  }

  /**
   * List rights for a specific user.
   */
  async listUserRights(userId: string): Promise<UserRight[]> {
    const metadata = createMetadata(this.getToken());

    const response = await makeUnaryCall<{ user_id: string }, ListUserRightsResponse>(
      this.client,
      'ListUserRights',
      { user_id: userId },
      metadata,
    );

    return (response.rights ?? []).map(mapRight).filter((r): r is UserRight => r !== null);
  }
}

function mapRight(right: Right): UserRight | null {
  if (right.participant_admin) {
    return { type: 'ParticipantAdmin' };
  }
  if (right.can_act_as) {
    return { type: 'CanActAs', party: right.can_act_as.party };
  }
  if (right.can_read_as) {
    return { type: 'CanReadAs', party: right.can_read_as.party };
  }
  if (right.can_execute_as) {
    return { type: 'CanExecuteAs', party: right.can_execute_as.party };
  }
  if (right.can_execute_as_any_party) {
    return { type: 'CanExecuteAsAnyParty' };
  }
  if (right.can_read_as_any_party) {
    return { type: 'CanReadAsAnyParty' };
  }
  return null;
}
