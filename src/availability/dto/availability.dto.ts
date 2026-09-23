import {
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateAvailabilityDto {
  @ApiProperty({
    description:
      'Recurring weekly working-hours window: 0=Sunday .. 6=Saturday. Add ONE slot per weekday you work (e.g. 1 = Monday). To cover a whole week, create several slots.',
    example: 1,
    minimum: 0,
    maximum: 6,
  })
  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek: number;

  @ApiProperty({
    description: 'Recurring weekly window start, 24h HH:mm format',
    example: '09:00',
  })
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, {
    message: 'startTime must be in HH:mm format',
  })
  startTime: string;

  @ApiProperty({
    description: 'Recurring weekly window end, 24h HH:mm format',
    example: '17:00',
  })
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, {
    message: 'endTime must be in HH:mm format',
  })
  endTime: string;
}

export class UpdateAvailabilityDto {
  @ApiPropertyOptional({
    description:
      'Recurring weekly working-hours window: 0=Sunday .. 6=Saturday. Add ONE slot per weekday you work (e.g. 1 = Monday). To cover a whole week, create several slots.',
    example: 2,
    minimum: 0,
    maximum: 6,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek?: number;

  @ApiPropertyOptional({
    description: 'Recurring weekly window start, 24h HH:mm format',
    example: '10:00',
  })
  @IsOptional()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, {
    message: 'startTime must be in HH:mm format',
  })
  startTime?: string;

  @ApiPropertyOptional({
    description: 'Recurring weekly window end, 24h HH:mm format',
    example: '16:00',
  })
  @IsOptional()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, {
    message: 'endTime must be in HH:mm format',
  })
  endTime?: string;
}
