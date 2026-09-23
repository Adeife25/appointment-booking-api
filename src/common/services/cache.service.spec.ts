import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Test } from '@nestjs/testing';
import { CacheService } from './cache.service';
import type { Cache } from '@nestjs/cache-manager';

describe('CacheService', () => {
  let service: CacheService;
  const cacheManager = {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    wrap: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        CacheService,
        { provide: CACHE_MANAGER, useValue: cacheManager },
      ],
    }).compile();
    service = moduleRef.get(CacheService);
  });

  it('returns cached value on get', async () => {
    cacheManager.get.mockResolvedValue({ id: 1 });
    await expect(service.get<{ id: number }>('key')).resolves.toEqual({
      id: 1,
    });
    expect(cacheManager.get).toHaveBeenCalledWith('key');
  });

  it('returns undefined when the store throws on get', async () => {
    cacheManager.get.mockRejectedValue(new Error('redis down'));
    await expect(service.get('key')).resolves.toBeUndefined();
  });

  it('sets a value with a ttl', async () => {
    cacheManager.set.mockResolvedValue(true);
    await service.set('key', { a: 1 }, 5_000);
    expect(cacheManager.set).toHaveBeenCalledWith('key', { a: 1 }, 5_000);
  });

  it('swallows store errors on set', async () => {
    cacheManager.set.mockRejectedValue(new Error('redis down'));
    await expect(service.set('key', { a: 1 })).resolves.toBeUndefined();
  });

  it('deletes a key', async () => {
    cacheManager.del.mockResolvedValue(true);
    await service.del('key');
    expect(cacheManager.del).toHaveBeenCalledWith('key');
  });

  it('swallows store errors on del', async () => {
    cacheManager.del.mockRejectedValue(new Error('redis down'));
    await expect(service.del('key')).resolves.toBeUndefined();
  });

  it('wraps a function with a default ttl', async () => {
    cacheManager.wrap.mockImplementation((_k, fn) => fn());
    await service.wrap('key', () => Promise.resolve('value'));
    expect(cacheManager.wrap).toHaveBeenCalledWith(
      'key',
      expect.any(Function),
      60_000,
    );
  });

  it('falls back to the function when wrap fails', async () => {
    cacheManager.wrap.mockRejectedValue(new Error('redis down'));
    await expect(
      service.wrap('key', () => Promise.resolve('computed')),
    ).resolves.toBe('computed');
  });
});
