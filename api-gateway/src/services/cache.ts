/**
 * Redis Caching Layer
 *
 * Caches ACS snapshots, package metadata, bootstrap info,
 * and other frequently accessed data.
 */

import Redis from 'ioredis';
import type { BootstrapInfo, PackageSummary, ActiveContract, PackageDetail } from '../types.js';

const DEFAULT_TTL_SECONDS = 300; // 5 minutes
const BOOTSTRAP_TTL_SECONDS = 3600; // 1 hour
const PACKAGE_TTL_SECONDS = 86400; // 24 hours (packages rarely change)
const ACS_TTL_SECONDS = 60; // 1 minute (ACS changes frequently)

export class CacheService {
  private redis: Redis | null = null;
  private enabled: boolean;

  constructor(redisUrl?: string) {
    this.enabled = !!redisUrl;
    if (redisUrl) {
      this.redis = new Redis(redisUrl, {
        maxRetriesPerRequest: 3,
        retryStrategy: (times: number) => {
          if (times > 3) return null; // Stop retrying
          return Math.min(times * 200, 2000);
        },
        lazyConnect: true,
      });

      this.redis.on('error', (err) => {
        console.error('Redis connection error:', err.message);
      });
    }
  }

  async connect(): Promise<void> {
    if (this.redis) {
      try {
        await this.redis.connect();
      } catch (err) {
        console.warn('Redis connection failed, caching disabled:', err);
        this.enabled = false;
      }
    }
  }

  async disconnect(): Promise<void> {
    if (this.redis) {
      await this.redis.quit();
    }
  }

  isAvailable(): boolean {
    return this.enabled && this.redis?.status === 'ready';
  }

  // ============================================================
  // Bootstrap Info
  // ============================================================

  async setBootstrapInfo(info: BootstrapInfo): Promise<void> {
    await this.set('cantontrace:bootstrap', info, BOOTSTRAP_TTL_SECONDS);
  }

  async getBootstrapInfo(): Promise<BootstrapInfo | null> {
    return this.get<BootstrapInfo>('cantontrace:bootstrap');
  }

  async clearBootstrapInfo(): Promise<void> {
    await this.del('cantontrace:bootstrap');
  }

  // ============================================================
  // Package Metadata
  // ============================================================

  async setPackageSummaries(packages: PackageSummary[]): Promise<void> {
    await this.set('cantontrace:packages:summaries', packages, PACKAGE_TTL_SECONDS);
  }

  async getPackageSummaries(): Promise<PackageSummary[] | null> {
    return this.get<PackageSummary[]>('cantontrace:packages:summaries');
  }

  async setPackageDetail(packageId: string, detail: PackageDetail): Promise<void> {
    await this.set(`cantontrace:packages:detail:${packageId}`, detail, PACKAGE_TTL_SECONDS);
  }

  async getPackageDetail(packageId: string): Promise<PackageDetail | null> {
    return this.get<PackageDetail>(`cantontrace:packages:detail:${packageId}`);
  }

  async setPackageBytes(packageId: string, bytes: Buffer): Promise<void> {
    if (!this.isAvailable() || !this.redis) return;
    try {
      await this.redis.setex(`cantontrace:packages:bytes:${packageId}`, PACKAGE_TTL_SECONDS, bytes.toString('base64'));
    } catch {
      // Cache write failure is non-fatal
    }
  }

  async getPackageBytes(packageId: string): Promise<Buffer | null> {
    if (!this.isAvailable() || !this.redis) return null;
    try {
      const data = await this.redis.get(`cantontrace:packages:bytes:${packageId}`);
      return data ? Buffer.from(data, 'base64') : null;
    } catch {
      return null;
    }
  }

  // ============================================================
  // ACS Snapshots
  // ============================================================

  async setACSSnapshot(
    offset: string,
    parties: string[],
    contracts: ActiveContract[],
    templateFilter?: string,
  ): Promise<void> {
    const filterSuffix = templateFilter ? `:t=${templateFilter}` : ':t=*';
    const key = `cantontrace:acs:${offset}:${parties.sort().join(',')}${filterSuffix}`;
    await this.set(key, contracts, ACS_TTL_SECONDS);
  }

  async getACSSnapshot(
    offset: string,
    parties: string[],
    templateFilter?: string,
  ): Promise<ActiveContract[] | null> {
    const filterSuffix = templateFilter ? `:t=${templateFilter}` : ':t=*';
    const key = `cantontrace:acs:${offset}:${parties.sort().join(',')}${filterSuffix}`;
    return this.get<ActiveContract[]>(key);
  }

  // ============================================================
  // Connection Config
  // ============================================================

  async setConnectionConfig(config: Record<string, unknown>): Promise<void> {
    await this.set('cantontrace:connection', config, BOOTSTRAP_TTL_SECONDS);
  }

  async getConnectionConfig(): Promise<Record<string, unknown> | null> {
    return this.get<Record<string, unknown>>('cantontrace:connection');
  }

  async clearConnectionConfig(): Promise<void> {
    await this.del('cantontrace:connection');
  }

  // ============================================================
  // Generic Offset Tracking
  // ============================================================

  async setLastOffset(streamKey: string, offset: string): Promise<void> {
    if (!this.isAvailable() || !this.redis) return;
    try {
      await this.redis.set(`cantontrace:offset:${streamKey}`, offset);
    } catch {
      // Non-fatal
    }
  }

  async getLastOffset(streamKey: string): Promise<string | null> {
    if (!this.isAvailable() || !this.redis) return null;
    try {
      return await this.redis.get(`cantontrace:offset:${streamKey}`);
    } catch {
      return null;
    }
  }

  // ============================================================
  // Cache Clearing
  // ============================================================

  async clearAll(): Promise<void> {
    if (!this.isAvailable() || !this.redis) return;
    try {
      const keys = await this.redis.keys('cantontrace:*');
      if (keys.length > 0) {
        await this.redis.del(...keys);
      }
    } catch {
      // Non-fatal
    }
  }

  // ============================================================
  // Generic Helpers
  // ============================================================

  private async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    if (!this.isAvailable() || !this.redis) return;
    try {
      const serialized = JSON.stringify(value);
      await this.redis.setex(key, ttlSeconds, serialized);
    } catch {
      // Cache write failure is non-fatal
    }
  }

  private async get<T>(key: string): Promise<T | null> {
    if (!this.isAvailable() || !this.redis) return null;
    try {
      const data = await this.redis.get(key);
      if (!data) return null;
      return JSON.parse(data) as T;
    } catch {
      return null;
    }
  }

  private async del(key: string): Promise<void> {
    if (!this.isAvailable() || !this.redis) return;
    try {
      await this.redis.del(key);
    } catch {
      // Non-fatal
    }
  }
}
