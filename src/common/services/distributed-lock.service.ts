import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, type RedisClientType } from 'redis';

const RELEASE_SCRIPT = `
  if redis.call('get', KEYS[1]) == ARGV[1] then
    return redis.call('del', KEYS[1])
  end
  return 0
`;

/**
 * Minimal distributed lock backed by Redis `SET NX PX`. When Redis is
 * unavailable the lock is a best-effort no-op (job proceeds) so a coordinated
 * cron job never blocks the app because the lock store is down.
 */
@Injectable()
export class DistributedLockService implements OnModuleDestroy {
  private readonly logger = new Logger(DistributedLockService.name);
  private readonly client?: RedisClientType;
  private lastWarnAt = 0;

  constructor(config: ConfigService) {
    const url = config.get<string>('redisUrl');
    if (!url) {
      this.logger.log('Redis not configured – distributed lock disabled');
      return;
    }

    this.client = createClient({
      url,
      socket: {
        connectTimeout: 5000,
        reconnectStrategy: (retries: number) =>
          retries < 15 ? Math.min(retries, 3) * 200 : false,
      },
    });
    this.client.on('error', (err) => this.warnGracefully(err));
    this.client.connect().catch((err) => this.warnGracefully(err));
  }

  async acquire(key: string, ttlMs: number, token: string): Promise<boolean> {
    if (!this.client || !this.client.isReady) {
      return true;
    }
    try {
      const result = await this.client.set(key, token, {
        PX: ttlMs,
        NX: true,
      });
      return result === 'OK';
    } catch (error) {
      this.warnGracefully(error);
      return true;
    }
  }

  async release(key: string, token: string): Promise<void> {
    if (!this.client || !this.client.isReady) {
      return;
    }
    try {
      await this.client.eval(RELEASE_SCRIPT, {
        keys: [key],
        arguments: [token],
      });
    } catch (error) {
      this.warnGracefully(error);
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client) {
      await this.client.quit().catch(() => undefined);
    }
  }

  private warnGracefully(error: unknown) {
    const now = Date.now();
    if (now - this.lastWarnAt > 5_000) {
      this.lastWarnAt = now;
      this.logger.warn(
        `Redis distributed lock unavailable: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
