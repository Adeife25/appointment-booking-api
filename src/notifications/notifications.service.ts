import { Injectable, Logger } from '@nestjs/common';
import { NotificationType, Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ResendService } from './resend.service';

const EMAIL_RETRIES = 2;
const EMAIL_RETRY_BASE_MS = 250;

type AppointmentEventType = Extract<
  NotificationType,
  | 'APPOINTMENT_CREATED'
  | 'APPOINTMENT_CONFIRMED'
  | 'APPOINTMENT_CANCELLED'
  | 'APPOINTMENT_REMINDER'
>;

type PrefField =
  | 'appointmentCreated'
  | 'appointmentConfirmed'
  | 'appointmentCancelled'
  | 'appointmentReminder';

const TYPE_TO_PREF: Record<string, PrefField> = {
  APPOINTMENT_CREATED: 'appointmentCreated',
  APPOINTMENT_CONFIRMED: 'appointmentConfirmed',
  APPOINTMENT_CANCELLED: 'appointmentCancelled',
  APPOINTMENT_REMINDER: 'appointmentReminder',
};

type Recipient = {
  id: string;
  email: string;
  notificationPreference: {
    emailEnabled: boolean;
    inAppEnabled: boolean;
    appointmentCreated: boolean;
    appointmentConfirmed: boolean;
    appointmentCancelled: boolean;
    appointmentReminder: boolean;
  } | null;
};

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly resend: ResendService,
  ) {}

  async createInApp(
    userId: string,
    type: NotificationType,
    subject: string,
    body: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    await this.prisma.notification.create({
      data: {
        userId,
        type,
        channel: 'IN_APP',
        subject,
        body,
        metadata: (metadata ?? undefined) as Prisma.InputJsonValue,
      },
    });
  }

  async sendPasswordResetEmail(email: string, token: string): Promise<void> {
    await this.sendEmailWithRetry(
      email,
      'Reset your password',
      `Your password reset token: ${token}\nThis token expires in 1 hour.`,
    );
  }

  /**
   * Fire-and-forget variant for the request path: booking/confirm/cancel
   * return immediately and notification delivery happens in the background.
   */
  dispatchAppointmentEvent(payload: {
    appointmentId: string;
    type: AppointmentEventType;
  }): void {
    void this.notifyAppointmentEvent(payload).catch((error) => {
      this.logger.error(
        `Failed to deliver appointment event: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    });
  }

  async notifyAppointmentEvent(payload: {
    appointmentId: string;
    type: AppointmentEventType;
  }): Promise<void> {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id: payload.appointmentId },
      include: {
        customer: {
          select: {
            id: true,
            email: true,
            notificationPreference: true,
          },
        },
        provider: {
          include: {
            user: {
              select: {
                id: true,
                email: true,
                notificationPreference: true,
              },
            },
          },
        },
        service: { select: { name: true } },
      },
    });
    if (!appointment) return;

    const { type } = payload;
    const { subject, customerBody, providerBody } = this.composeMessages(
      appointment.service.name,
      type,
    );

    await this.deliver(appointment.customer, type, subject, customerBody, {
      appointmentId: payload.appointmentId,
    });
    await this.deliver(
      {
        ...appointment.provider.user,
        notificationPreference:
          appointment.provider.user.notificationPreference,
      },
      type,
      `Appointment ${type.toLowerCase().replace('appointment_', '')}`,
      providerBody,
      { appointmentId: payload.appointmentId },
    );
  }

  private async deliver(
    recipient: Recipient,
    type: NotificationType,
    subject: string,
    body: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    const prefs = recipient.notificationPreference;
    if (!prefs) return;

    try {
      if (prefs.inAppEnabled) {
        await this.prisma.notification.create({
          data: {
            userId: recipient.id,
            type,
            channel: 'IN_APP',
            subject,
            body,
            metadata: metadata as Prisma.InputJsonValue,
          },
        });
      }

      if (prefs.emailEnabled && prefs[TYPE_TO_PREF[type]]) {
        await this.sendEmailWithRetry(recipient.email, subject, body);
      }
    } catch (error) {
      this.logger.error(
        `Notification delivery failed for user ${recipient.id}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private async sendEmailWithRetry(
    email: string,
    subject: string,
    body: string,
  ): Promise<void> {
    let attempt = 0;
    for (;;) {
      try {
        await this.resend.sendEmail(email, subject, body);
        return;
      } catch (error) {
        if (attempt >= EMAIL_RETRIES) {
          throw error;
        }
        attempt += 1;
        const delayMs =
          EMAIL_RETRY_BASE_MS * 2 ** attempt * (Math.random() * 0.5 + 0.75);
        this.logger.warn(
          `Email to ${email} failed (attempt ${attempt}), retrying: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }

  private composeMessages(serviceName: string, type: NotificationType) {
    switch (type) {
      case 'APPOINTMENT_CREATED':
        return {
          subject: 'Appointment Booked',
          customerBody: `Your ${serviceName} appointment has been booked and is pending confirmation.`,
          providerBody: `A new ${serviceName} appointment has been booked and requires confirmation.`,
        };
      case 'APPOINTMENT_CONFIRMED':
        return {
          subject: 'Appointment Confirmed',
          customerBody: `Your ${serviceName} appointment has been confirmed.`,
          providerBody: `You confirmed a ${serviceName} appointment.`,
        };
      case 'APPOINTMENT_CANCELLED':
        return {
          subject: 'Appointment Cancelled',
          customerBody: `Your ${serviceName} appointment has been cancelled.`,
          providerBody: `A ${serviceName} appointment has been cancelled.`,
        };
      case 'APPOINTMENT_REMINDER':
        return {
          subject: 'Appointment Reminder',
          customerBody: `Reminder: your ${serviceName} appointment is coming up soon.`,
          providerBody: `Reminder: a ${serviceName} appointment is coming up soon.`,
        };
      default:
        return {
          subject: 'Appointment Update',
          customerBody: `There has been an update to your ${serviceName} appointment.`,
          providerBody: `There has been an update to a ${serviceName} appointment.`,
        };
    }
  }
}
