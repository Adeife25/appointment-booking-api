import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { ResendService } from './resend.service';

@Module({
  controllers: [NotificationsController],
  providers: [ResendService, NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
