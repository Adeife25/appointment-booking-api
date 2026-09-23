import { Inject, Injectable, Logger } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from '@nestjs/cache-manager';

@Injectable()
export class CacheService {
  private readonly logger = new Logger(CacheService.name);
  private lastWarnAt = 0;

  constructor(@Inject(CACHE_MANAGER) private readonly cacheManager: Cache) {}

  async get<T>(key: string): Promise<T | undefined> {
    try {
      return await this.cacheManager.get<T>(key);
    } catch (error) {
      this.logGraceful(error);
      return undefined;
    }
  }

  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    try {
      await this.cacheManager.set(key, value, ttl);
    } catch (error) {
      this.logGraceful(error);
    }
  }

  async del(key: string): Promise<void> {
    try {
      await this.cacheManager.del(key);
    } catch (error) {
      this.logGraceful(error);
    }
  }

  async wrap<T>(key: string, fn: () => Promise<T>, ttl?: number): Promise<T> {
    try {
      return await this.cacheManager.wrap(key, fn, ttl ?? 60_000);
    } catch (error) {
      this.logGraceful(error);
      return fn();
    }
  }

  private logGraceful(error: unknown) {
    const now = Date.now();
    if (now - this.lastWarnAt > 5_000) {
      this.lastWarnAt = now;
      this.logger.warn(
        `Cache store error (falling back to cache-miss behavior): ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
