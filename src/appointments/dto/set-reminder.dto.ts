import { IsDateString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SetReminderDto {
  @ApiProperty({
    description: 'When to fire the reminder (ISO 8601)',
    example: '2026-09-20T10:00:00.000Z',
  })
  @IsDateString()
  reminderAt: string;
}
