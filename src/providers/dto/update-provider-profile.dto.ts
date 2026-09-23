import {
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { ContactMethod } from '../../generated/prisma/client';
import { SLUG_REGEX } from '../../common/utils/slug.util';

export class UpdateProviderProfileDto {
  @ApiPropertyOptional({ example: 'ABC Hair Studio' })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  businessName?: string;

  @ApiPropertyOptional({
    example: 'abc-hair-studio',
    description: 'Custom slug for the public shareable profile link',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Matches(SLUG_REGEX, {
    message: 'slug must be lowercase letters, numbers and hyphens',
  })
  slug?: string;

  @ApiPropertyOptional({
    example: 'Professional hair styling and beauty services',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ example: '123 Main St, Lagos, Nigeria' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  location?: string;

  @ApiPropertyOptional({ example: '+2348012345678' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  contactPhone?: string;

  @ApiPropertyOptional({ example: 'abc@salon.com' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  contactEmail?: string;

  @ApiPropertyOptional({
    enum: ContactMethod,
    isArray: true,
    description: 'Contact channels clients can use',
  })
  @IsOptional()
  @IsArray()
  @IsEnum(ContactMethod, { each: true })
  contactMethods?: ContactMethod[];

  @ApiPropertyOptional({ example: 'https://example.com/photo.jpg' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  profileImage?: string;
}
