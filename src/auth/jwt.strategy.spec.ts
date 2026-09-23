import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Role } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { JwtStrategy } from './strategies/jwt.strategy';

type PrismaMock = Record<string, any>;

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;
  let prisma: PrismaMock;
  let cache: Record<string, any>;

  const activeUser = {
    id: 'user-1',
    email: 'a@example.com',
    name: 'Ada',
    role: Role.CUSTOMER,
    isActive: true,
    deletedAt: null,
    providerProfile: null,
  };

  const cacheStore = new Map<string, unknown>();

  beforeEach(() => {
    cacheStore.clear();
    prisma = { user: { findUnique: jest.fn() } };
    cache = {
      wrap: jest.fn((key: string, fn: () => Promise<unknown>) => {
        if (cacheStore.has(key)) {
          return Promise.resolve(cacheStore.get(key));
        }
        return fn().then((value) => {
          cacheStore.set(key, value);
          return value;
        });
      }),
      del: jest.fn((key: string) => {
        cacheStore.delete(key);
        return Promise.resolve();
      }),
    };
    const config = {
      getOrThrow: jest.fn(() => 'test-secret'),
    } as unknown as ConfigService;
    strategy = new JwtStrategy(
      config,
      prisma as unknown as PrismaService,
      cache as any,
    );
  });

  it('returns an AuthUser for a valid payload', async () => {
    prisma.user.findUnique.mockResolvedValue(activeUser);
    const result = await strategy.validate({ sub: 'user-1' });
    expect(result).toEqual({
      id: 'user-1',
      email: 'a@example.com',
      name: 'Ada',
      role: Role.CUSTOMER,
      providerProfileId: null,
    });
  });

  it('maps the provider profile id when present', async () => {
    prisma.user.findUnique.mockResolvedValue({
      ...activeUser,
      role: Role.PROVIDER,
      providerProfile: { id: 'pp-1' },
    });
    const result = await strategy.validate({ sub: 'user-1' });
    expect(result.providerProfileId).toBe('pp-1');
  });

  it('caches the lookup so the DB is hit only once', async () => {
    prisma.user.findUnique.mockResolvedValue(activeUser);
    await strategy.validate({ sub: 'user-1' });
    await strategy.validate({ sub: 'user-1' });
    await strategy.validate({ sub: 'user-1' });
    expect(prisma.user.findUnique).toHaveBeenCalledTimes(1);
  });

  it('rejects a missing account', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(strategy.validate({ sub: 'user-1' })).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects a disabled account', async () => {
    prisma.user.findUnique.mockResolvedValue({
      ...activeUser,
      isActive: false,
    });
    await expect(strategy.validate({ sub: 'user-1' })).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects a deleted account', async () => {
    prisma.user.findUnique.mockResolvedValue({
      ...activeUser,
      deletedAt: new Date(),
    });
    await expect(strategy.validate({ sub: 'user-1' })).rejects.toThrow(
      UnauthorizedException,
    );
  });
});
