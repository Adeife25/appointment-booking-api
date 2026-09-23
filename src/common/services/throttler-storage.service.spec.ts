import {
  SharedThrottlerStorage,
  SharedThrottlerStorageOptions,
} from './throttler-storage.service';

jest.mock('redis', () => ({
  createClient: jest.fn(() => ({
    on: jest.fn(),
    connect: jest.fn().mockResolvedValue(undefined),
    isReady: false,
    quit: jest.fn(),
    eval: jest.fn(),
  })),
}));

describe('SharedThrottlerStorage', () => {
  const options: SharedThrottlerStorageOptions = {
    redisUrl: 'redis://localhost:6379',
  };

  it('uses the in-memory store when Redis is not ready', async () => {
    const storage = new SharedThrottlerStorage(options);
    const result = await storage.increment('key', 10_000, 5, 0, 'default');
    expect((storage as any).client.eval).not.toHaveBeenCalled();
    expect(result.totalHits).toBeGreaterThanOrEqual(1);
  });

  it('uses Redis and returns the fixed-window counter when ready', async () => {
    const storage = new SharedThrottlerStorage(options);
    (storage as any).client.isReady = true;
    (storage as any).client.eval.mockResolvedValue([2, 12_345]);

    const result = await storage.increment('key', 10_000, 5, 0, 'default');
    expect((storage as any).client.eval).toHaveBeenCalledWith(
      expect.stringContaining('INCR'),
      expect.objectContaining({
        keys: expect.arrayContaining([expect.stringContaining('default:key')]),
        arguments: ['10000'],
      }),
    );
    expect(result).toEqual({
      totalHits: 2,
      timeToExpire: 12_345,
      isBlocked: false,
      timeToBlockExpire: 0,
    });
  });

  it('falls back to the in-memory store when Redis increment fails', async () => {
    const storage = new SharedThrottlerStorage(options);
    (storage as any).client.isReady = true;
    (storage as any).client.eval.mockRejectedValue(new Error('redis down'));

    const result = await storage.increment('key', 10_000, 5, 0, 'default');
    expect(result.totalHits).toBeGreaterThanOrEqual(1);
  });
});
