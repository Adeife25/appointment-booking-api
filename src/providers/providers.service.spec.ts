import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { ProvidersService } from './providers.service';

type PrismaMock = Record<string, any>;

describe('ProvidersService', () => {
  let service: ProvidersService;
  let prisma: PrismaMock;
  let config: Record<string, any>;

  beforeEach(() => {
    prisma = {
      providerProfile: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        update: jest.fn().mockResolvedValue({ id: 'pp-1' }),
      },
    };
    config = {
      get: jest.fn((key: string) =>
        key === 'publicBaseUrl' ? 'http://localhost:3001' : undefined,
      ),
    };
    service = new ProvidersService(
      prisma as unknown as PrismaService,
      config as unknown as ConfigService,
    );
  });

  describe('findAll', () => {
    it('lists providers without search', async () => {
      const result = await service.findAll({ page: 1, limit: 10 }, undefined);
      expect(result.meta.total).toBe(0);
      expect(prisma.providerProfile.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { isActive: true },
          skip: 0,
          take: 10,
        }),
      );
    });

    it('builds an OR search query', async () => {
      await service.findAll({ page: 2, limit: 5 }, 'hair');
      const call = prisma.providerProfile.findMany.mock.calls[0][0];
      expect(call.where.OR).toBeInstanceOf(Array);
      expect(call.skip).toBe(5);
    });
  });

  describe('findOne', () => {
    it('throws when provider does not exist', async () => {
      prisma.providerProfile.findFirst.mockResolvedValue(null);
      await expect(service.findOne('pp-x')).rejects.toThrow(NotFoundException);
    });

    it('returns the provider with services and availability', async () => {
      prisma.providerProfile.findFirst.mockResolvedValue({
        id: 'pp-1',
        user: { id: 'user-1' },
        services: [],
        availabilities: [],
      });
      const result = await service.findOne('pp-1');
      expect(result.id).toBe('pp-1');
    });
  });

  describe('findByIdentifier', () => {
    const record = {
      id: 'pp-1',
      slug: 'sara-beauty',
      user: { id: 'user-1', name: 'Sara' },
      services: [],
      availabilities: [],
    };

    it('looks up an active provider by slug', async () => {
      prisma.providerProfile.findFirst.mockResolvedValue(record);
      const result = await service.findByIdentifier('sara-beauty');
      expect(result.id).toBe('pp-1');
      expect(prisma.providerProfile.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { slug: 'sara-beauty', isActive: true },
        }),
      );
    });

    it('falls back to looking up by id when the slug does not match', async () => {
      prisma.providerProfile.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(record);
      const result = await service.findByIdentifier('pp-1');
      expect(result.id).toBe('pp-1');
      expect(prisma.providerProfile.findFirst).toHaveBeenLastCalledWith(
        expect.objectContaining({ where: { id: 'pp-1', isActive: true } }),
      );
    });

    it('throws when no active provider matches slug or id', async () => {
      prisma.providerProfile.findFirst.mockResolvedValue(null);
      await expect(service.findByIdentifier('unknown')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('allows the owner to update their profile', async () => {
      prisma.providerProfile.findUnique.mockResolvedValue({
        id: 'pp-1',
        userId: 'user-1',
      });
      await service.update('user-1', 'pp-1', {
        businessName: 'New Name',
        location: 'Lagos',
      });
      expect(prisma.providerProfile.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'pp-1' },
          data: expect.objectContaining({ businessName: 'New Name' }),
        }),
      );
    });

    it('hides a non-owner profile', async () => {
      prisma.providerProfile.findUnique.mockResolvedValue({
        id: 'pp-1',
        userId: 'other-user',
      });
      await expect(
        service.update('user-1', 'pp-1', { businessName: 'X' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('setVerification', () => {
    it('verifies an existing provider', async () => {
      prisma.providerProfile.findUnique.mockResolvedValue({ id: 'pp-1' });
      await service.setVerification('pp-1', true);
      expect(prisma.providerProfile.update).toHaveBeenCalledWith({
        where: { id: 'pp-1' },
        data: { isVerified: true },
      });
    });

    it('unverifies a provider', async () => {
      prisma.providerProfile.findUnique.mockResolvedValue({ id: 'pp-1' });
      await service.setVerification('pp-1', false);
      expect(prisma.providerProfile.update).toHaveBeenCalledWith({
        where: { id: 'pp-1' },
        data: { isVerified: false },
      });
    });

    it('throws for an unknown provider', async () => {
      prisma.providerProfile.findUnique.mockResolvedValue(null);
      await expect(service.setVerification('pp-x', true)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
