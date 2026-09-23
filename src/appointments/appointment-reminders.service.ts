import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DistributedLockService } from '../common/services/distributed-lock.service';
import { AppointmentStatus } from '../generated/prisma/client';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';

const REMINDER_LOCK_KEY = 'cron:appointment-reminders';
const REMINDER_LOCK_TTL_MS = 15 * 60_000;

@Injectable()
export class AppointmentRemindersService {
  private readonly logger = new Logger(AppointmentRemindersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly notifications: NotificationsService,
    private readonly locks: DistributedLockService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async sendUpcomingAppointmentReminders(): Promise<void> {
    const lockToken = randomUUID();
    const acquired = await this.locks.acquire(
      REMINDER_LOCK_KEY,
      REMINDER_LOCK_TTL_MS,
      lockToken,
    );
    if (!acquired) {
      this.logger.log('Another instance is sending reminders – skipping');
      return;
    }

    try {
      await this.sendDueReminders();
    } finally {
      await this.locks.release(REMINDER_LOCK_KEY, lockToken);
    }
  }

  private async sendDueReminders(): Promise<void> {
    const now = new Date();
    const leadHours = Number(this.config.get('reminderLeadHours') ?? 24);
    const windowEnd = new Date(now.getTime() + leadHours * 60 * 60 * 1000);

    const activeStatuses: AppointmentStatus[] = ['PENDING', 'CONFIRMED'];

    const [sharedDue, legacyDue, dueIndividual] = await Promise.all([
      this.prisma.appointment.findMany({
        where: {
          status: { in: activeStatuses },
          reminderAt: { not: null, lte: now },
          reminderSentAt: null,
        },
        select: { id: true },
      }),
      this.prisma.appointment.findMany({
        where: {
          status: { in: activeStatuses },
          reminderAt: null,
          startTime: { gt: now, lt: windowEnd },
          reminderSentAt: null,
        },
        select: { id: true },
      }),
      this.prisma.appointmentReminder.findMany({
        where: {
          sentAt: null,
          reminderAt: { lte: now },
          appointment: { status: { in: activeStatuses } },
        },
        select: { id: true, appointmentId: true },
      }),
    ]);

    let sentCount = 0;

    for (const appointment of [...sharedDue, ...legacyDue]) {
      await this.notifications.notifyAppointmentEvent({
        appointmentId: appointment.id,
        type: 'APPOINTMENT_REMINDER',
      });
      await this.prisma.appointment.update({
        where: { id: appointment.id },
        data: { reminderSentAt: now },
      });
      sentCount += 1;
    }

    for (const reminder of dueIndividual) {
      await this.notifications.notifyAppointmentEvent({
        appointmentId: reminder.appointmentId,
        type: 'APPOINTMENT_REMINDER',
      });
      await this.prisma.appointmentReminder.update({
        where: { id: reminder.id },
        data: { sentAt: now },
      });
      sentCount += 1;
    }

    if (sentCount > 0) {
      this.logger.log(
        `Sent reminders for ${sentCount} upcoming appointment(s)`,
      );
    }
  }
}
