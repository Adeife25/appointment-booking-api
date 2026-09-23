import { Logger } from '@nestjs/common';
import { ThrottlerStorage, ThrottlerStorageService } from '@nestjs/throttler';
import { createClient, type RedisClientType } from 'redis';

export interface SharedThrottlerStorageOptions {
  redisUrl: string;
  connectTimeout?: number;
}

const KEY_PREFIX = 'throttle:';

// Fixed-window counter: INCR the key and set TTL on first hit, returning the
// current hit count and remaining time-to-live so @nestjs/throttler can apply
// the configured limit and build Retry-After headers.
const FIXED_WINDOW_SCRIPT = `
  local current = redis.call('INCR', KEYS[1])
  if current == 1 then
    redis.call('PEXPIRE', KEYS[1], ARGV[1])
  end
  return { current, redis.call('PTTL', KEYS[1]) }
`;

/**
 * Throttler storage that uses Redis when available (so rate limits are
 * enforced globally across API replicas) and falls back to the built-in
 * in-memory store when Redis is down, so rate limiting never fails or hangs
 * the API at the edge.
 */
export class SharedThrottlerStorage implements ThrottlerStorage {
  private readonly logger = new Logger(SharedThrottlerStorage.name);
  private readonly memory: ThrottlerStorageService;
  private readonly client: RedisClientType;
  private lastWarnAt = 0;

  constructor(options: SharedThrottlerStorageOptions) {
    this.memory = new ThrottlerStorageService();
    this.client = createClient({
      url: options.redisUrl,
      socket: {
        connectTimeout: options.connectTimeout ?? 5000,
        reconnectStrategy: (retries: number) =>
          retries < 15 ? Math.min(retries, 3) * 200 : false,
      },
    });
    this.client.on('error', (err) => this.warnGracefully(err));
    this.client.connect().catch((err) => this.warnGracefully(err));
  }

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ) {
    if (this.client.isReady) {
      try {
        const [hits, ttlMs] = (await this.client.eval(FIXED_WINDOW_SCRIPT, {
          keys: [`${KEY_PREFIX}${throttlerName}:${key}`],
          arguments: [String(ttl)],
        })) as [number, number];
        const totalHits = Number(hits);
        const timeToExpire = Number(ttlMs);
        return {
          totalHits,
          timeToExpire,
          isBlocked: totalHits > limit,
          timeToBlockExpire: totalHits > limit ? timeToExpire : 0,
        };
      } catch (error) {
        this.warnGracefully(error);
      }
    }
    return this.memory.increment(key, ttl, limit, blockDuration, throttlerName);
  }

  private warnGracefully(error: unknown) {
    const now = Date.now();
    if (now - this.lastWarnAt > 5_000) {
      this.lastWarnAt = now;
      this.logger.warn(
        `Redis throttler storage unavailable, using in-memory store: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
