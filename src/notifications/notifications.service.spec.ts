import { NotificationType } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from './notifications.service';
import { ResendService } from './resend.service';

type PrismaMock = Record<string, any>;

const defaultPrefs = {
  emailEnabled: true,
  inAppEnabled: true,
  appointmentCreated: true,
  appointmentConfirmed: true,
  appointmentCancelled: true,
  appointmentReminder: true,
};

describe('NotificationsService', () => {
  let service: NotificationsService;
  let prisma: PrismaMock;
  let resend: Record<string, any>;

  beforeEach(() => {
    prisma = {
      notification: { create: jest.fn().mockResolvedValue({ id: 'n-1' }) },
      appointment: { findUnique: jest.fn() },
    };
    resend = { sendEmail: jest.fn().mockResolvedValue(undefined) };
    service = new NotificationsService(
      prisma as unknown as PrismaService,
      resend as unknown as ResendService,
    );
  });

  describe('createInApp', () => {
    it('creates an in-app notification', async () => {
      await service.createInApp(
        'user-1',
        NotificationType.APPOINTMENT_CREATED,
        'Subject',
        'Body',
      );
      expect(prisma.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'user-1',
          channel: 'IN_APP',
          type: NotificationType.APPOINTMENT_CREATED,
        }),
      });
    });
  });

  describe('notifyAppointmentEvent', () => {
    function appointmentMock() {
      return {
        id: 'appt-1',
        service: { name: 'Haircut' },
        customer: {
          id: 'customer-1',
          email: 'customer@example.com',
          notificationPreference: defaultPrefs,
        },
        provider: {
          user: {
            id: 'provider-1',
            email: 'provider@example.com',
            notificationPreference: defaultPrefs,
          },
        },
      };
    }

    it('notifies both customer and provider', async () => {
      prisma.appointment.findUnique.mockResolvedValue(appointmentMock());
      await service.notifyAppointmentEvent({
        appointmentId: 'appt-1',
        type: NotificationType.APPOINTMENT_CREATED,
      });

      expect(prisma.notification.create).toHaveBeenCalledTimes(2);
      expect(resend.sendEmail).toHaveBeenCalledTimes(2);
      expect(resend.sendEmail).toHaveBeenCalledWith(
        'customer@example.com',
        expect.stringContaining('Appointment Booked'),
        expect.stringContaining('Haircut'),
      );
    });

    it('sends reminders for upcoming appointments', async () => {
      prisma.appointment.findUnique.mockResolvedValue(appointmentMock());
      await service.notifyAppointmentEvent({
        appointmentId: 'appt-1',
        type: NotificationType.APPOINTMENT_REMINDER,
      });
      expect(resend.sendEmail).toHaveBeenCalledWith(
        'customer@example.com',
        expect.stringContaining('Appointment Reminder'),
        expect.stringContaining('coming up'),
      );
    });

    it('skips delivery when preferences are missing', async () => {
      prisma.appointment.findUnique.mockResolvedValue({
        id: 'appt-1',
        service: { name: 'Haircut' },
        customer: {
          id: 'customer-1',
          email: 'customer@example.com',
          notificationPreference: null,
        },
        provider: {
          user: {
            id: 'provider-1',
            email: 'provider@example.com',
            notificationPreference: null,
          },
        },
      });
      await service.notifyAppointmentEvent({
        appointmentId: 'appt-1',
        type: NotificationType.APPOINTMENT_CONFIRMED,
      });
      expect(prisma.notification.create).not.toHaveBeenCalled();
      expect(resend.sendEmail).not.toHaveBeenCalled();
    });

    it('respects disabled email preference', async () => {
      prisma.appointment.findUnique.mockResolvedValue(appointmentMock());
      const noEmail = {
        ...defaultPrefs,
        emailEnabled: false,
      };
      prisma.appointment.findUnique.mockResolvedValue({
        id: 'appt-1',
        service: { name: 'Haircut' },
        customer: {
          id: 'customer-1',
          email: 'customer@example.com',
          notificationPreference: noEmail,
        },
        provider: {
          user: {
            id: 'provider-1',
            email: 'provider@example.com',
            notificationPreference: noEmail,
          },
        },
      });
      await service.notifyAppointmentEvent({
        appointmentId: 'appt-1',
        type: NotificationType.APPOINTMENT_CREATED,
      });
      expect(prisma.notification.create).toHaveBeenCalledTimes(2);
      expect(resend.sendEmail).not.toHaveBeenCalled();
    });

    it('does nothing for an unknown appointment', async () => {
      prisma.appointment.findUnique.mockResolvedValue(null);
      await service.notifyAppointmentEvent({
        appointmentId: 'appt-x',
        type: NotificationType.APPOINTMENT_CREATED,
      });
      expect(prisma.notification.create).not.toHaveBeenCalled();
    });
  });

  describe('email retry', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    function appointmentMock() {
      return {
        id: 'appt-1',
        service: { name: 'Haircut' },
        customer: {
          id: 'customer-1',
          email: 'customer@example.com',
          notificationPreference: defaultPrefs,
        },
        provider: {
          user: {
            id: 'provider-1',
            email: 'provider@example.com',
            notificationPreference: defaultPrefs,
          },
        },
      };
    }

    it('retries a transient email failure', async () => {
      prisma.appointment.findUnique.mockResolvedValue(appointmentMock());
      prisma.notification.create = jest.fn().mockResolvedValue({ id: 'n-1' });
      resend.sendEmail = jest
        .fn()
        .mockRejectedValueOnce(new Error('network'))
        .mockResolvedValue(undefined);

      const run = service.notifyAppointmentEvent({
        appointmentId: 'appt-1',
        type: NotificationType.APPOINTMENT_CREATED,
      });
      await jest.advanceTimersByTimeAsync(2_000);
      await run;

      expect(resend.sendEmail).toHaveBeenCalledTimes(3);
      expect(prisma.notification.create).toHaveBeenCalledTimes(2);
    });

    it('gives up after retries and still resolves', async () => {
      prisma.appointment.findUnique.mockResolvedValue(appointmentMock());
      resend.sendEmail = jest
        .fn()
        .mockRejectedValue(new Error('provider down'));

      const run = service.notifyAppointmentEvent({
        appointmentId: 'appt-1',
        type: NotificationType.APPOINTMENT_CREATED,
      });
      await jest.advanceTimersByTimeAsync(6_000);
      await expect(run).resolves.toBeUndefined();

      expect(resend.sendEmail).toHaveBeenCalledTimes(6);
    });

    it('dispatchAppointmentEvent does not throw on delivery failure', async () => {
      prisma.appointment.findUnique.mockResolvedValue(appointmentMock());
      resend.sendEmail = jest
        .fn()
        .mockRejectedValue(new Error('provider down'));

      service.dispatchAppointmentEvent({
        appointmentId: 'appt-1',
        type: NotificationType.APPOINTMENT_CREATED,
      });
      await jest.advanceTimersByTimeAsync(6_000);
      for (let i = 0; i < 5; i += 1) {
        await Promise.resolve();
      }
      expect(resend.sendEmail).toHaveBeenCalled();
    });
  });
});
