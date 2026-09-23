import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AvailabilityService } from './availability.service';

type PrismaMock = Record<string, any>;

describe('AvailabilityService', () => {
  let service: AvailabilityService;
  let prisma: PrismaMock;

  const slot = {
    id: 'av-1',
    providerProfileId: 'pp-1',
    dayOfWeek: 1,
    startTime: '09:00',
    endTime: '17:00',
  };

  beforeEach(() => {
    prisma = {
      providerProfile: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: 'pp-1', userId: 'user-1' }),
      },
      availability: {
        create: jest.fn().mockResolvedValue(slot),
        findMany: jest.fn().mockResolvedValue([slot]),
        findUnique: jest.fn().mockResolvedValue(slot),
        update: jest.fn().mockResolvedValue(slot),
      },
    };
    service = new AvailabilityService(prisma as unknown as PrismaService);
  });

  describe('create', () => {
    it('forbids a user without a provider profile', async () => {
      await expect(service.create('user-1', null, slot as any)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('forbids creating for another provider profile', async () => {
      prisma.providerProfile.findUnique.mockResolvedValue({
        id: 'pp-2',
        userId: 'other-user',
      });
      await expect(
        service.create('user-1', 'pp-2', slot as any),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects an inverted time range', async () => {
      await expect(
        service.create('user-1', 'pp-1', {
          dayOfWeek: 1,
          startTime: '17:00',
          endTime: '09:00',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('maps a duplicate slot to BadRequest', async () => {
      prisma.availability.create.mockRejectedValue({ code: 'P2002' });
      await expect(
        service.create('user-1', 'pp-1', slot as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('creates a slot for an owned profile', async () => {
      const result = await service.create('user-1', 'pp-1', slot);
      expect(result.id).toBe('av-1');
      expect(prisma.availability.create).toHaveBeenCalledWith({
        data: { ...slot, providerProfileId: 'pp-1' },
      });
    });
  });

  describe('findAllForProvider', () => {
    it('returns active slots for the provider', async () => {
      const result = await service.findAllForProvider('pp-1');
      expect(result).toHaveLength(1);
      expect(prisma.availability.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { providerProfileId: 'pp-1', isActive: true },
        }),
      );
    });
  });

  describe('update', () => {
    it('throws for a missing slot', async () => {
      prisma.availability.findUnique.mockResolvedValue(null);
      await expect(
        service.update('user-1', 'av-x', slot as any),
      ).rejects.toThrow(NotFoundException);
    });

    it('forbids updating a slot owned by another provider', async () => {
      prisma.providerProfile.findUnique.mockResolvedValue({
        id: 'pp-2',
        userId: 'other-user',
      });
      await expect(
        service.update('user-1', 'av-1', slot as any),
      ).rejects.toThrow(ForbiddenException);
    });

    it('updates the slot with the provided fields', async () => {
      await service.update('user-1', 'av-1', {
        dayOfWeek: 1,
        startTime: '09:00',
        endTime: '17:00',
      });
      expect(prisma.availability.update).toHaveBeenCalledWith({
        where: { id: 'av-1' },
        data: { dayOfWeek: 1, startTime: '09:00', endTime: '17:00' },
      });
    });
  });

  describe('remove', () => {
    it('soft-removes the slot', async () => {
      const result = await service.remove('user-1', 'av-1');
      expect(result.message).toContain('removed');
      expect(prisma.availability.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { isActive: false } }),
      );
    });
  });
});
