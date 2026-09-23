import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty } from 'class-validator';

export class CreateAppointmentDto {
  @ApiProperty({ description: 'Provider profile ID' })
  @IsNotEmpty()
  @IsString()
  providerProfileId: string;

  @ApiProperty({ description: 'Service ID' })
  @IsNotEmpty()
  @IsString()
  serviceId: string;

  @ApiProperty({
    description: 'Appointment start time (ISO 8601)',
    example: '2026-09-20T14:00:00.000Z',
  })
  @IsDateString()
  startTime: string;

  @ApiPropertyOptional({
    description:
      'Required when the service has no fixed duration. Ignored otherwise.',
    example: 60,
    minimum: 5,
  })
  @IsOptional()
  @IsInt()
  @Min(5)
  durationMinutes?: number;

  @ApiPropertyOptional({ example: 'Please bring my reference photo' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class RescheduleAppointmentDto {
  @ApiProperty({
    description: 'New appointment start time (ISO 8601)',
    example: '2026-09-20T16:00:00.000Z',
  })
  @IsDateString()
  startTime: string;

  @ApiPropertyOptional({
    description:
      'New duration in minutes. Only used when the service has no fixed duration.',
    example: 45,
    minimum: 5,
  })
  @IsOptional()
  @IsInt()
  @Min(5)
  durationMinutes?: number;
}
