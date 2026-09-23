import { ConfigService } from '@nestjs/config';
import { DistributedLockService } from '../common/services/distributed-lock.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { AppointmentRemindersService } from './appointment-reminders.service';

jest.mock('@nestjs/schedule', () => ({
  Cron: () => () => undefined,
  CronExpression: { EVERY_HOUR: '0 * * * *' },
}));

type PrismaMock = Record<string, any>;

describe('AppointmentRemindersService', () => {
  let service: AppointmentRemindersService;
  let prisma: PrismaMock;
  let config: Record<string, any>;
  let notifications: Record<string, any>;
  let locks: Record<string, any>;

  beforeEach(() => {
    prisma = {
      appointment: {
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue({}),
      },
      appointmentReminder: {
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    config = {
      get: jest.fn((key: string) =>
        key === 'reminderLeadHours' ? 24 : undefined,
      ),
    };
    notifications = {
      notifyAppointmentEvent: jest.fn().mockResolvedValue(undefined),
    };
    locks = {
      acquire: jest.fn().mockResolvedValue(true),
      release: jest.fn().mockResolvedValue(undefined),
    };

    service = new AppointmentRemindersService(
      prisma as unknown as PrismaService,
      config as unknown as ConfigService,
      notifications as unknown as NotificationsService,
      locks as unknown as DistributedLockService,
    );
  });

  it('does nothing when there are no due appointments', async () => {
    await service.sendUpcomingAppointmentReminders();
    expect(notifications.notifyAppointmentEvent).not.toHaveBeenCalled();
    expect(prisma.appointment.update).not.toHaveBeenCalled();
    expect(locks.release).toHaveBeenCalled();
  });

  it('skips when another instance holds the lock', async () => {
    locks.acquire.mockResolvedValue(false);
    await service.sendUpcomingAppointmentReminders();
    expect(prisma.appointment.findMany).not.toHaveBeenCalled();
    expect(notifications.notifyAppointmentEvent).not.toHaveBeenCalled();
    expect(locks.release).not.toHaveBeenCalled();
  });

  it('queries shared reminders first, then the legacy lead window', async () => {
    await service.sendUpcomingAppointmentReminders();
    const [shared, legacy] = prisma.appointment.findMany.mock.calls;
    const now = Date.now();

    expect(shared[0].where.status.in).toEqual(['PENDING', 'CONFIRMED']);
    expect(shared[0].where.reminderSentAt).toBeNull();
    expect(shared[0].where.reminderAt.lte).toBeInstanceOf(Date);

    expect(legacy[0].where.status.in).toEqual(['PENDING', 'CONFIRMED']);
    expect(legacy[0].where.reminderAt).toBeNull();
    expect(legacy[0].where.startTime.gt.getTime()).toBeLessThanOrEqual(now);
    expect(legacy[0].where.startTime.lt.getTime()).toBeCloseTo(
      now + 24 * 60 * 60 * 1000,
      -6,
    );
  });

  it('notifies and stamps shared and individual reminders', async () => {
    prisma.appointment.findMany
      .mockResolvedValueOnce([{ id: 'appt-1' }])
      .mockResolvedValueOnce([{ id: 'appt-2' }]);
    prisma.appointmentReminder.findMany.mockResolvedValue([
      { id: 'rem-1', appointmentId: 'appt-3' },
    ]);

    await service.sendUpcomingAppointmentReminders();

    expect(notifications.notifyAppointmentEvent).toHaveBeenCalledTimes(3);
    expect(notifications.notifyAppointmentEvent).toHaveBeenCalledWith({
      appointmentId: 'appt-1',
      type: 'APPOINTMENT_REMINDER',
    });
    expect(prisma.appointment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'appt-2' },
        data: expect.objectContaining({ reminderSentAt: expect.any(Date) }),
      }),
    );
    expect(prisma.appointmentReminder.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'rem-1' },
        data: expect.objectContaining({ sentAt: expect.any(Date) }),
      }),
    );
  });
});
