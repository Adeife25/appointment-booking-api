import {
  IsBoolean,
  IsDecimal,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PricingType, PricingUnit } from '../../generated/prisma/client';
import { SLUG_REGEX, TIME_REGEX } from '../../common/utils/slug.util';

export class UpdateServiceDto {
  @ApiPropertyOptional({ example: 'Haircut & Beard Trim' })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  name?: string;

  @ApiPropertyOptional({
    example: 'haircut-and-beard-trim',
    description: 'Custom slug for the public shareable service link',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Matches(SLUG_REGEX, {
    message: 'slug must be lowercase letters, numbers and hyphens',
  })
  slug?: string;

  @ApiPropertyOptional({ example: 'Professional wash, dry, styling and trim' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ example: 'https://example.com/haircut.jpg' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  imageUrl?: string;

  @ApiPropertyOptional({ enum: PricingType })
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

  @ApiPropertyOptional({ example: '15000.00' })
  @IsOptional()
  @IsDecimal({ decimal_digits: '0,2' })
  price?: string;

  @ApiPropertyOptional({ example: 75, minimum: 5 })
  @IsOptional()
  @IsInt()
  @Min(5)
  durationMinutes?: number | null;

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

  @ApiPropertyOptional({ description: 'Soft delete / hide the service' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
