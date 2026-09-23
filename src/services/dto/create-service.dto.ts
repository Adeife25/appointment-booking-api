import {
  IsDecimal,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PricingType, PricingUnit } from '../../generated/prisma/client';
import { SLUG_REGEX, TIME_REGEX } from '../../common/utils/slug.util';

export class CreateServiceDto {
  @ApiProperty({ example: 'Haircut' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(150)
  name: string;

  @ApiPropertyOptional({
    example: 'haircut',
    description: 'Custom slug for the public shareable service link',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Matches(SLUG_REGEX, {
    message: 'slug must be lowercase letters, numbers and hyphens',
  })
  slug?: string;

  @ApiPropertyOptional({ example: 'Professional wash, dry and styling' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ example: 'https://example.com/haircut.jpg' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  imageUrl?: string;

  @ApiPropertyOptional({ enum: PricingType, default: PricingType.FIXED })
  @IsOptional()
  @IsEnum(PricingType)
  pricingType?: PricingType;

  @ApiPropertyOptional({
    enum: PricingUnit,
    description:
      'Required when pricingType is FIXED. PER_SERVICE = flat fee per booking; PER_HOUR = rate per hour.',
  })
  @IsOptional()
  @IsEnum(PricingUnit)
  pricingUnit?: PricingUnit;

  @ApiProperty({
    example: '10000.00',
    description:
      'Required when pricingType is FIXED or PER_HOUR. Interpreted per the pricingUnit for FIXED.',
  })
  @IsOptional()
  @IsDecimal({ decimal_digits: '0,2' })
  price?: string;

  @ApiPropertyOptional({
    example: 60,
    minimum: 5,
    description: 'Optional fixed duration in minutes',
  })
  @IsOptional()
  @IsInt()
  @Min(5)
  durationMinutes?: number;

  @ApiPropertyOptional({
    example: '09:00',
    description: 'Earliest start time the service can be booked (HH:mm)',
  })
  @IsOptional()
  @Matches(TIME_REGEX, { message: 'startTime must be in HH:mm format' })
  startTime?: string;

  @ApiPropertyOptional({
    example: '17:00',
    description: 'Latest end time the service can be booked (HH:mm)',
  })
  @IsOptional()
  @Matches(TIME_REGEX, { message: 'endTime must be in HH:mm format' })
  endTime?: string;
}
