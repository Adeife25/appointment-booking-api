import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { ServicesService } from './services.service';

type PrismaMock = Record<string, any>;

describe('ServicesService', () => {
  let service: ServicesService;
  let prisma: PrismaMock;
  let config: Record<string, any>;

  beforeEach(() => {
    prisma = {
      providerProfile: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'pp-1',
          userId: 'user-1',
        }),
      },
      service: {
        create: jest.fn().mockResolvedValue({ id: 'svc-1' }),
        findUnique: jest.fn().mockResolvedValue({
          id: 'svc-1',
          isActive: true,
          provider: { userId: 'user-1' },
        }),
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        update: jest.fn().mockResolvedValue({ id: 'svc-1' }),
      },
    };
    config = {
      get: jest.fn((key: string) =>
        key === 'publicBaseUrl' ? 'http://localhost:3001' : undefined,
      ),
    };
    service = new ServicesService(
      prisma as unknown as PrismaService,
      config as unknown as ConfigService,
    );
  });

  describe('create', () => {
    it('forbids a user without a provider profile', async () => {
      await expect(service.create('user-1', null, {} as any)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('forbids creating for another provider profile', async () => {
      prisma.providerProfile.findUnique.mockResolvedValue({
        id: 'pp-2',
        userId: 'other-user',
      });
      await expect(service.create('user-1', 'pp-2', {} as any)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('creates a service for an owned profile', async () => {
      await service.create('user-1', 'pp-1', {
        name: 'Haircut',
        pricingType: 'FIXED',
        pricingUnit: 'PER_SERVICE',
        price: '10000',
        durationMinutes: 60,
      } as any);
      expect(prisma.service.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          providerProfileId: 'pp-1',
          name: 'Haircut',
          pricingType: 'FIXED',
          pricingUnit: 'PER_SERVICE',
          price: '10000',
        }),
      });
    });

    it('requires pricingUnit when pricingType is FIXED', async () => {
      await expect(
        service.create('user-1', 'pp-1', {
          name: 'Haircut',
          price: '10000',
        } as any),
      ).rejects.toThrow('pricingUnit is required when pricingType is FIXED');
    });
  });

  describe('findAll', () => {
    it('lists only active services', async () => {
      const result = await service.findAll({ page: 1, limit: 10 });
      expect(result.meta.total).toBe(0);
      expect(prisma.service.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ isActive: true }),
        }),
      );
    });
  });

  describe('findOne', () => {
    it('throws when service is missing or inactive', async () => {
      prisma.service.findUnique.mockResolvedValue(null);
      await expect(service.findOne('svc-x')).rejects.toThrow(NotFoundException);

      prisma.service.findUnique.mockResolvedValue({
        id: 'svc-1',
        isActive: false,
      });
      await expect(service.findOne('svc-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('findByIdentifier', () => {
    const record = {
      id: 'svc-1',
      slug: 'bridal-makeup',
      isActive: true,
      provider: {
        id: 'pp-1',
        businessName: 'Sara Beauty Studio',
        slug: 'sara-beauty',
        location: 'Lagos',
      },
    };

    it('looks up an active service by slug', async () => {
      prisma.service.findFirst.mockResolvedValue(record);
      const result = await service.findByIdentifier('bridal-makeup');
      expect(result.id).toBe('svc-1');
      expect(prisma.service.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { slug: 'bridal-makeup', isActive: true },
        }),
      );
    });

    it('falls back to looking up by id when the slug does not match', async () => {
      prisma.service.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(record);
      const result = await service.findByIdentifier('svc-1');
      expect(result.id).toBe('svc-1');
      expect(prisma.service.findFirst).toHaveBeenLastCalledWith(
        expect.objectContaining({ where: { id: 'svc-1', isActive: true } }),
      );
    });

    it('throws when no active service matches slug or id', async () => {
      prisma.service.findFirst.mockResolvedValue(null);
      await expect(service.findByIdentifier('unknown')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('allows the owner to update', async () => {
      await service.update('user-1', 'svc-1', { name: 'Nails' });
      expect(prisma.service.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { name: 'Nails' } }),
      );
    });

    it('forbids updating an unowned service', async () => {
      prisma.service.findUnique.mockResolvedValue({
        id: 'svc-1',
        isActive: true,
        provider: { userId: 'other-user' },
      });
      await expect(
        service.update('user-1', 'svc-1', { name: 'Nails' }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('remove', () => {
    it('soft-deletes the service', async () => {
      const result = await service.remove('user-1', 'svc-1');
      expect(result.message).toContain('removed');
      expect(prisma.service.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { isActive: false } }),
      );
    });
  });
});
