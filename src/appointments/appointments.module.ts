import { Module } from '@nestjs/common';
import { DistributedLockService } from '../common/services/distributed-lock.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { AppointmentRemindersService } from './appointment-reminders.service';
import { AppointmentsController } from './appointments.controller';
import { AppointmentsService } from './appointments.service';

@Module({
  imports: [NotificationsModule],
  controllers: [AppointmentsController],
  providers: [
    AppointmentsService,
    AppointmentRemindersService,
    DistributedLockService,
  ],
})
export class AppointmentsModule {}
