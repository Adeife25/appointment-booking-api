import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ReviewsService } from './reviews.service';

type PrismaMock = Record<string, any>;

describe('ReviewsService', () => {
  let service: ReviewsService;
  let prisma: PrismaMock;

  beforeEach(() => {
    prisma = {
      appointment: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'appt-1',
          customerId: 'customer-1',
          status: 'COMPLETED',
          providerProfileId: 'pp-1',
        }),
      },
      review: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'rev-1' }),
        update: jest.fn().mockResolvedValue({ id: 'rev-1' }),
        delete: jest.fn().mockResolvedValue({}),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
    };
    service = new ReviewsService(prisma as unknown as PrismaService);
  });

  describe('create', () => {
    it('creates a review for an own completed appointment', async () => {
      const result = await service.create('customer-1', {
        appointmentId: 'appt-1',
        rating: 5,
        comment: 'Great',
      });
      expect(result.id).toBe('rev-1');
      expect(prisma.review.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          customerId: 'customer-1',
          providerProfileId: 'pp-1',
          rating: 5,
        }),
      });
    });

    it('forbids reviewing someone else appointment', async () => {
      prisma.appointment.findUnique.mockResolvedValue({
        id: 'appt-1',
        customerId: 'customer-2',
        status: 'COMPLETED',
        providerProfileId: 'pp-1',
      });
      await expect(
        service.create('customer-1', {
          appointmentId: 'appt-1',
          rating: 5,
        } as any),
      ).rejects.toThrow(ForbiddenException);
    });

    it('forbids reviewing a non-completed appointment', async () => {
      prisma.appointment.findUnique.mockResolvedValue({
        id: 'appt-1',
        customerId: 'customer-1',
        status: 'PENDING',
        providerProfileId: 'pp-1',
      });
      await expect(
        service.create('customer-1', {
          appointmentId: 'appt-1',
          rating: 5,
        } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects duplicate review for the same appointment', async () => {
      prisma.review.findUnique.mockResolvedValue({ id: 'rev-existing' });
      await expect(
        service.create('customer-1', {
          appointmentId: 'appt-1',
          rating: 5,
        } as any),
      ).rejects.toThrow('already been reviewed');
    });

    it('throws NotFound for missing appointment', async () => {
      prisma.appointment.findUnique.mockResolvedValue(null);
      await expect(
        service.create('customer-1', {
          appointmentId: 'appt-x',
          rating: 5,
        } as any),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('update/remove ownership', () => {
    it('allows the author to edit their review', async () => {
      prisma.review.findUnique.mockResolvedValue({
        id: 'rev-1',
        customerId: 'customer-1',
      });
      const result = await service.update('customer-1', 'rev-1', {
        rating: 4,
      });
      expect(result.id).toBe('rev-1');
    });

    it('forbids editing another user review', async () => {
      prisma.review.findUnique.mockResolvedValue({
        id: 'rev-1',
        customerId: 'customer-2',
      });
      await expect(
        service.update('customer-1', 'rev-1', { rating: 4 } as any),
      ).rejects.toThrow(ForbiddenException);
    });

    it('forbids deleting another user review', async () => {
      prisma.review.findUnique.mockResolvedValue({
        id: 'rev-1',
        customerId: 'customer-2',
      });
      await expect(service.remove('customer-1', 'rev-1')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });
});
