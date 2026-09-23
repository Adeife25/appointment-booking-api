import { ConfigService } from '@nestjs/config';
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { AppointmentStatus } from '../generated/prisma/client';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { AppointmentsService } from './appointments.service';

const CUSTOMER_CTX = {
  userId: 'customer-1',
  role: 'CUSTOMER' as const,
  providerProfileId: null,
};
const PROVIDER_CTX = {
  userId: 'provider-user-1',
  role: 'PROVIDER' as const,
  providerProfileId: 'pp-1',
};
const ADMIN_CTX = {
  userId: 'admin-1',
  role: 'ADMIN' as const,
  providerProfileId: null,
};

const FUTURE = (() => {
  const d = new Date(Date.now() + 48 * 60 * 60_000);
  d.setUTCMinutes(0, 0, 0);
  return d;
})();

const appointment = (
  overrides: Partial<{
    status: AppointmentStatus;
    startTime: Date;
    customerId: string;
    providerProfileId: string;
  }> = {},
) => ({
  id: 'appt-1',
  status: overrides.status ?? 'PENDING',
  startTime: overrides.startTime ?? FUTURE,
  endTime: new Date((overrides.startTime ?? FUTURE).getTime() + 60 * 60_000),
  customerId: overrides.customerId ?? 'customer-1',
  providerProfileId: overrides.providerProfileId ?? 'pp-1',
  serviceId: 'svc-1',
  notes: null,
  service: {
    id: 'svc-1',
    name: 'Consultation',
    price: 50,
    durationMinutes: 60,
  },
  provider: { id: 'pp-1', businessName: 'Pro', location: null },
  customer: { id: 'customer-1', name: 'C', email: 'c@e.com', phone: null },
  review: null,
});

type PrismaMock = Record<string, any>;

describe('AppointmentsService', () => {
  let service: AppointmentsService;
  let prisma: PrismaMock;
  let notifications: Record<string, any>;
  let config: Record<string, any>;

  const ALL_DAYS_SLOT = Array.from({ length: 7 }, (_, dayOfWeek) => ({
    dayOfWeek,
    startTime: '00:00',
    endTime: '23:59',
    isActive: true,
  }));

  const makeService = (overrides?: {
    prisma?: Partial<Record<string, any>>;
    tx?: any;
  }) => {
    const tx: any = overrides?.tx ?? {
      $queryRaw: jest.fn().mockResolvedValue([]),
      appointment: { create: jest.fn().mockResolvedValue({ id: 'appt-1' }) },
      providerProfile: {},
    };

    prisma = {
      service: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'svc-1',
          name: 'Consultation',
          price: 50,
          durationMinutes: 60,
          providerProfileId: 'pp-1',
          isActive: true,
          provider: { id: 'pp-1', isActive: true },
        }),
      },
      availability: { findMany: jest.fn().mockResolvedValue(ALL_DAYS_SLOT) },
      appointment: {
        findMany: jest.fn().mockResolvedValue([appointment()]),
        count: jest.fn().mockResolvedValue(1),
        findUnique: jest.fn().mockResolvedValue(appointment()),
        update: jest.fn().mockImplementation(({ data }: any) =>
          Promise.resolve(
            appointment({
              status: data?.status ?? 'PENDING',
              startTime: data?.startTime ?? FUTURE,
            }),
          ),
        ),
      },
      $transaction: jest.fn((fn: (t: unknown) => Promise<unknown>) => fn(tx)),
      ...overrides?.prisma,
    };

    notifications = {
      notifyAppointmentEvent: jest.fn().mockResolvedValue(undefined),
      dispatchAppointmentEvent: jest.fn(),
    };
    config = {
      get: jest.fn((key: string) => {
        if (key === 'cancelWindowHours') return 24;
        return undefined;
      }),
    };

    return new AppointmentsService(
      prisma as unknown as PrismaService,
      config as unknown as ConfigService,
      notifications as unknown as NotificationsService,
    );
  };

  const validDto = () => ({
    serviceId: 'svc-1',
    providerProfileId: 'pp-1',
    startTime: FUTURE.toISOString(),
  });

  beforeEach(() => {
    service = makeService();
  });

  describe('create', () => {
    it('creates an appointment when slot is free', async () => {
      const result = await service.create('customer-1', validDto());
      expect(result.id).toBe('appt-1');
      expect(notifications.dispatchAppointmentEvent).toHaveBeenCalledWith({
        appointmentId: 'appt-1',
        type: 'APPOINTMENT_CREATED',
      });
    });

    it('throws NotFound when service does not exist', async () => {
      service = makeService({
        prisma: { service: { findUnique: jest.fn().mockResolvedValue(null) } },
      });
      await expect(
        service.create('customer-1', validDto() as any),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequest when service belongs to another provider', async () => {
      await expect(
        service.create('customer-1', {
          ...validDto(),
          providerProfileId: 'pp-2',
        } as any),
      ).rejects.toThrow('does not belong');
    });

    it('throws BadRequest when outside provider availability', async () => {
      service = makeService({
        prisma: {
          availability: {
            findMany: jest.fn().mockResolvedValue([
              {
                dayOfWeek: 6,
                startTime: '09:00',
                endTime: '12:00',
                isActive: true,
              },
            ]),
          },
        },
      });
      await expect(
        service.create('customer-1', validDto() as any),
      ).rejects.toThrow('outside');
    });

    it('throws Conflict on double booking', async () => {
      const tx: any = {
        $queryRaw: jest
          .fn()
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([{ id: 'existing' }]),
        appointment: { create: jest.fn() },
      };
      service = makeService({ tx });
      await expect(
        service.create('customer-1', validDto() as any),
      ).rejects.toThrow(ConflictException);
      expect(tx.appointment.create).not.toHaveBeenCalled();
    });

    it('rejects past start times', async () => {
      await expect(
        service.create('customer-1', {
          ...validDto(),
          startTime: new Date(Date.now() - 60_000).toISOString(),
        } as any),
      ).rejects.toThrow('must be in the future');
    });
  });

  describe('cancel', () => {
    it('blocks customer cancellation inside the window', async () => {
      const soon = new Date(Date.now() + 12 * 60 * 60_000);
      soon.setUTCMinutes(0, 0, 0);
      service = makeService({
        prisma: {
          appointment: {
            findUnique: jest
              .fn()
              .mockResolvedValue(
                appointment({ status: 'CONFIRMED', startTime: soon }),
              ),
            update: prisma.appointment.update,
          },
        },
      });
      await expect(service.cancel(CUSTOMER_CTX, 'appt-1')).rejects.toThrow(
        'can only be cancelled',
      );
    });

    it('allows cancellation when far enough in advance', async () => {
      const result = await service.cancel(CUSTOMER_CTX, 'appt-1');
      expect(result.status).toBe('CANCELLED');
    });

    it('allows a customer to cancel when window is zero', async () => {
      config.get.mockReturnValue(0);
      const result = await service.cancel(CUSTOMER_CTX, 'appt-1');
      expect(result.status).toBe('CANCELLED');
    });

    it('allows a provider to cancel regardless of window', async () => {
      const soon = new Date(Date.now() + 2 * 60 * 60_000);
      soon.setUTCMinutes(0, 0, 0);
      service = makeService({
        prisma: {
          appointment: {
            findUnique: jest
              .fn()
              .mockResolvedValue(
                appointment({ status: 'CONFIRMED', startTime: soon }),
              ),
            update: prisma.appointment.update,
          },
        },
      });
      const result = await service.cancel(PROVIDER_CTX, 'appt-1');
      expect(result.status).toBe('CANCELLED');
    });
  });

  describe('status transitions', () => {
    it('confirms a pending appointment', async () => {
      const result = await service.confirm(PROVIDER_CTX, 'appt-1');
      expect(result.status).toBe('CONFIRMED');
      expect(notifications.dispatchAppointmentEvent).toHaveBeenCalledWith({
        appointmentId: 'appt-1',
        type: 'APPOINTMENT_CONFIRMED',
      });
    });

    it('rejects an invalid transition', async () => {
      service = makeService({
        prisma: {
          appointment: {
            findUnique: jest
              .fn()
              .mockResolvedValue(appointment({ status: 'COMPLETED' })),
            update: prisma.appointment.update,
          },
        },
      });
      await expect(service.confirm(PROVIDER_CTX, 'appt-1')).rejects.toThrow(
        ConflictException,
      );
    });

    it('only allows provider/admins to complete', async () => {
      service = makeService({
        prisma: {
          appointment: {
            findUnique: jest
              .fn()
              .mockResolvedValue(appointment({ status: 'CONFIRMED' })),
            update: prisma.appointment.update,
          },
        },
      });
      await expect(service.complete(CUSTOMER_CTX, 'appt-1')).rejects.toThrow(
        'Only the provider can complete',
      );
    });

    it('completes when provider', async () => {
      service = makeService({
        prisma: {
          appointment: {
            findUnique: jest
              .fn()
              .mockResolvedValue(appointment({ status: 'CONFIRMED' })),
            update: prisma.appointment.update,
          },
        },
      });
      const result = await service.complete(PROVIDER_CTX, 'appt-1');
      expect(result.status).toBe('COMPLETED');
    });
  });

  describe('access control', () => {
    it('forbids a customer from other appointments', async () => {
      service = makeService({
        prisma: {
          appointment: {
            findUnique: jest
              .fn()
              .mockResolvedValue(appointment({ customerId: 'customer-2' })),
            update: prisma.appointment.update,
          },
        },
      });
      await expect(service.findOne(CUSTOMER_CTX, 'appt-1')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('allows admin to view any appointment', async () => {
      const result = await service.findOne(ADMIN_CTX, 'appt-1');
      expect(result.id).toBe('appt-1');
    });

    it('throws NotFound for missing appointment', async () => {
      service = makeService({
        prisma: {
          appointment: { findUnique: jest.fn().mockResolvedValue(null) },
        },
      });
      await expect(service.findOne(CUSTOMER_CTX, 'appt-x')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
