import { IsDateString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SlotsQueryDto {
  @ApiProperty({
    example: '2026-09-20',
    description: 'Start date (YYYY-MM-DD, UTC). Inclusive.',
  })
  @IsDateString()
  from: string;

  @ApiProperty({
    example: '2026-09-30',
    description:
      'End date (YYYY-MM-DD, UTC). Inclusive. At most 31 days after from.',
  })
  @IsDateString()
  to: string;
}
