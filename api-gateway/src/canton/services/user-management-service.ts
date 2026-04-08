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

  /**
   * Create a user. Throws if user already exists (ALREADY_EXISTS).
   */
  async createUser(userId: string, primaryParty?: string): Promise<UserInfo> {
    const metadata = createMetadata(this.getToken());

    const response = await makeUnaryCall<{ user: Record<string, unknown> }, GetUserResponse>(
      this.client,
      'CreateUser',
      {
        user: {
          id: userId,
          primary_party: primaryParty ?? '',
          is_deactivated: false,
        },
      },
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
   * Grant rights to an existing user.
   */
  async grantUserRights(userId: string, rights: Right[]): Promise<void> {
    const metadata = createMetadata(this.getToken());

    await makeUnaryCall<{ user_id: string; rights: Right[] }, unknown>(
      this.client,
      'GrantUserRights',
      { user_id: userId, rights },
      metadata,
    );
  }

  /**
   * Ensure a user exists with the required CanActAs and CanReadAs rights.
   * Creates the user if it doesn't exist, then grants any missing rights.
   *
   * Used before PrepareSubmission/ExecuteSubmission in sandbox mode where
   * Canton requires a valid user_id in the request.
   */
  async ensureUserWithRights(
    userId: string,
    actAs: string[],
    readAs: string[],
  ): Promise<void> {
    // Try to get the user — if it doesn't exist, create it
    try {
      await this.getUser(userId);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '';
      if (msg.includes('NOT_FOUND') || msg.includes('5 ')) {
        // User doesn't exist — create it
        await this.createUser(userId, actAs[0]);
      } else {
        throw err;
      }
    }

    // Check existing rights
    const existingRights = await this.listUserRights(userId);
    const existingActAs = new Set(
      existingRights.filter(r => r.type === 'CanActAs').map(r => (r as { party: string }).party)
    );
    const existingReadAs = new Set(
      existingRights.filter(r => r.type === 'CanReadAs').map(r => (r as { party: string }).party)
    );

    // Build missing rights
    const missingRights: Right[] = [];
    for (const party of actAs) {
      if (!existingActAs.has(party)) {
        missingRights.push({ can_act_as: { party } });
      }
    }
    for (const party of readAs) {
      if (!existingReadAs.has(party)) {
        missingRights.push({ can_read_as: { party } });
      }
    }

    if (missingRights.length > 0) {
      await this.grantUserRights(userId, missingRights);
    }
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
