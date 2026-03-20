/**
 * CantonClient — Main Canton Ledger API v2 gRPC client.
 *
 * Manages the gRPC connection, JWT token, and provides typed accessors
 * for all Canton services.
 *
 * Uses gRPC Server Reflection to fetch proto definitions at connect time,
 * ensuring proper protobuf binary serialization. This replaces the previous
 * JSON-based approach which was incompatible with Canton's gRPC server.
 */

import * as grpc from '@grpc/grpc-js';
import { VersionServiceClient } from './services/version-service.js';
import { StateServiceClient } from './services/state-service.js';
import { UpdateServiceClient } from './services/update-service.js';
import { CommandCompletionServiceClient } from './services/command-completion-service.js';
import { InteractiveSubmissionServiceClient } from './services/interactive-submission-service.js';
import { EventQueryServiceClient } from './services/event-query-service.js';
import { PackageServiceClient } from './services/package-service.js';
import { PartyManagementServiceClient } from './services/party-management-service.js';
import { UserManagementServiceClient } from './services/user-management-service.js';
import { PruningServiceClient } from './services/pruning-service.js';
import { CANTON_SERVICES } from './proto/types.js';
import { loadCantonProtos, getServiceConstructor } from './proto-loader.js';
import { runBootstrapSequence, type BootstrapOptions } from './bootstrap.js';
import type { BootstrapInfo } from '../types.js';

export interface CantonClientOptions {
  tls?: boolean;
  token?: string;
  /** Max message size in bytes (default 50MB). */
  maxMessageSize?: number;
  /** gRPC keepalive interval in ms (default 30000). */
  keepaliveMs?: number;
}

/**
 * Canton Ledger API v2 gRPC client.
 *
 * Usage:
 *   const client = new CantonClient('localhost:6865');
 *   await client.connect();
 *   const bootstrap = await client.bootstrap();
 *   // ... use service accessors ...
 *   client.disconnect();
 */
export class CantonClient {
  private readonly endpoint: string;
  private readonly options: CantonClientOptions;
  private token: string | null;
  private connected = false;

  // Service clients (lazily initialized)
  private _versionService: VersionServiceClient | null = null;
  private _stateService: StateServiceClient | null = null;
  private _updateService: UpdateServiceClient | null = null;
  private _commandCompletionService: CommandCompletionServiceClient | null = null;
  private _interactiveSubmissionService: InteractiveSubmissionServiceClient | null = null;
  private _eventQueryService: EventQueryServiceClient | null = null;
  private _packageService: PackageServiceClient | null = null;
  private _partyManagementService: PartyManagementServiceClient | null = null;
  private _userManagementService: UserManagementServiceClient | null = null;
  private _pruningService: PruningServiceClient | null = null;

  // Raw gRPC clients per service
  private grpcClients: Map<string, grpc.Client> = new Map();

  constructor(endpoint: string, options?: CantonClientOptions) {
    this.endpoint = endpoint;
    this.options = options ?? {};
    this.token = options?.token ?? null;
  }

  /**
   * Establish the gRPC connection to the Canton participant node.
   *
   * Uses gRPC Server Reflection to fetch proto definitions from the Canton
   * server, then creates properly-typed gRPC clients with real protobuf
   * binary serialization.
   */
  async connect(): Promise<void> {
    if (this.connected) return;

    const channelOptions: grpc.ChannelOptions = {
      'grpc.max_receive_message_length': this.options.maxMessageSize ?? 50 * 1024 * 1024,
      'grpc.max_send_message_length': this.options.maxMessageSize ?? 50 * 1024 * 1024,
      'grpc.keepalive_time_ms': this.options.keepaliveMs ?? 30000,
      'grpc.keepalive_timeout_ms': 10000,
      'grpc.keepalive_permit_without_calls': 1,
    };

    const credentials = this.options.tls
      ? grpc.credentials.createSsl()
      : grpc.credentials.createInsecure();

    // Load proto definitions from the Canton server via gRPC Server Reflection.
    // This fetches the FileDescriptorSet and builds proper protobuf serializers.
    const cantonProtos = await loadCantonProtos(this.endpoint, credentials, channelOptions);

    // Create a gRPC client for each Canton service using the real proto definitions.
    for (const [key, servicePath] of Object.entries(CANTON_SERVICES)) {
      const ServiceConstructor = getServiceConstructor(cantonProtos.grpcObject, servicePath);
      if (!ServiceConstructor) {
        console.warn(`Canton service ${servicePath} not found in proto definitions (key: ${key}). Skipping.`);
        continue;
      }
      const client = new ServiceConstructor(this.endpoint, credentials, channelOptions);
      this.grpcClients.set(key, client);
    }

    this.connected = true;
  }

  /**
   * Disconnect all gRPC clients.
   */
  disconnect(): void {
    for (const client of this.grpcClients.values()) {
      client.close();
    }
    this.grpcClients.clear();
    this.connected = false;

    // Reset service client caches
    this._versionService = null;
    this._stateService = null;
    this._updateService = null;
    this._commandCompletionService = null;
    this._interactiveSubmissionService = null;
    this._eventQueryService = null;
    this._packageService = null;
    this._partyManagementService = null;
    this._userManagementService = null;
    this._pruningService = null;
  }

  /**
   * Set or update the JWT token for authenticated calls.
   */
  setToken(jwt: string): void {
    this.token = jwt;
  }

  /**
   * Get the current JWT token.
   */
  getToken(): string | null {
    return this.token;
  }

  /**
   * Run the full bootstrap sequence (Section 4.7 of spec).
   */
  async bootstrap(options?: BootstrapOptions): Promise<BootstrapInfo> {
    this.ensureConnected();
    return runBootstrapSequence(this, options);
  }

  /**
   * Check whether the client is connected.
   */
  isConnected(): boolean {
    return this.connected;
  }

  // ============================================================
  // Service Accessors
  // ============================================================

  get versionService(): VersionServiceClient {
    this.ensureConnected();
    if (!this._versionService) {
      this._versionService = new VersionServiceClient(
        this.getGrpcClient('VERSION_SERVICE'),
        () => this.token,
      );
    }
    return this._versionService;
  }

  get stateService(): StateServiceClient {
    this.ensureConnected();
    if (!this._stateService) {
      this._stateService = new StateServiceClient(
        this.getGrpcClient('STATE_SERVICE'),
        () => this.token,
      );
    }
    return this._stateService;
  }

  get updateService(): UpdateServiceClient {
    this.ensureConnected();
    if (!this._updateService) {
      this._updateService = new UpdateServiceClient(
        this.getGrpcClient('UPDATE_SERVICE'),
        () => this.token,
      );
    }
    return this._updateService;
  }

  get commandCompletionService(): CommandCompletionServiceClient {
    this.ensureConnected();
    if (!this._commandCompletionService) {
      this._commandCompletionService = new CommandCompletionServiceClient(
        this.getGrpcClient('COMMAND_COMPLETION_SERVICE'),
        () => this.token,
      );
    }
    return this._commandCompletionService;
  }

  get interactiveSubmissionService(): InteractiveSubmissionServiceClient {
    this.ensureConnected();
    if (!this._interactiveSubmissionService) {
      this._interactiveSubmissionService = new InteractiveSubmissionServiceClient(
        this.getGrpcClient('INTERACTIVE_SUBMISSION_SERVICE'),
        () => this.token,
      );
    }
    return this._interactiveSubmissionService;
  }

  get eventQueryService(): EventQueryServiceClient {
    this.ensureConnected();
    if (!this._eventQueryService) {
      this._eventQueryService = new EventQueryServiceClient(
        this.getGrpcClient('EVENT_QUERY_SERVICE'),
        () => this.token,
      );
    }
    return this._eventQueryService;
  }

  get packageService(): PackageServiceClient {
    this.ensureConnected();
    if (!this._packageService) {
      this._packageService = new PackageServiceClient(
        this.getGrpcClient('PACKAGE_SERVICE'),
        () => this.token,
      );
    }
    return this._packageService;
  }

  get partyManagementService(): PartyManagementServiceClient {
    this.ensureConnected();
    if (!this._partyManagementService) {
      this._partyManagementService = new PartyManagementServiceClient(
        this.getGrpcClient('PARTY_MANAGEMENT_SERVICE'),
        () => this.token,
      );
    }
    return this._partyManagementService;
  }

  get userManagementService(): UserManagementServiceClient {
    this.ensureConnected();
    if (!this._userManagementService) {
      this._userManagementService = new UserManagementServiceClient(
        this.getGrpcClient('USER_MANAGEMENT_SERVICE'),
        () => this.token,
      );
    }
    return this._userManagementService;
  }

  get pruningService(): PruningServiceClient {
    this.ensureConnected();
    if (!this._pruningService) {
      this._pruningService = new PruningServiceClient(
        this.getGrpcClient('STATE_SERVICE'),
        () => this.token,
      );
    }
    return this._pruningService;
  }

  // ============================================================
  // Private Helpers
  // ============================================================

  private ensureConnected(): void {
    if (!this.connected) {
      throw new Error('CantonClient is not connected. Call connect() first.');
    }
  }

  private getGrpcClient(serviceKey: string): grpc.Client {
    const client = this.grpcClients.get(serviceKey);
    if (!client) {
      throw new Error(`gRPC client for service ${serviceKey} not initialized.`);
    }
    return client;
  }
}

// The old buildServiceDefinition/getServiceMethods functions have been removed.
// Service definitions are now loaded dynamically from the Canton server via
// gRPC Server Reflection (see proto-loader.ts), providing proper protobuf
// binary serialization instead of the broken JSON approach.
