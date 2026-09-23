import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Role } from '../../generated/prisma/client';

const SWITCHABLE_ROLES = [Role.CUSTOMER, Role.PROVIDER];

export class SwitchRoleDto {
  @ApiProperty({ enum: SWITCHABLE_ROLES })
  @IsIn(SWITCHABLE_ROLES)
  role: Role;

  @ApiPropertyOptional({
    example: 'ABC Hair Studio',
    description:
      'Required when switching to PROVIDER and no profile exists yet',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  businessName?: string;
}
