import {
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Role } from '../../generated/prisma/client';

export const PUBLIC_REGISTRATION_ROLES: ReadonlyArray<Role> = [
  Role.CUSTOMER,
  Role.PROVIDER,
];

export type PublicRegistrationRole = (typeof PUBLIC_REGISTRATION_ROLES)[number];

export class RegisterDto {
  @ApiProperty({ example: 'jane@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'StrongPass123!' })
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password: string;

  @ApiProperty({ example: 'Jane Doe' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name: string;

  @ApiPropertyOptional({ example: '+2348012345678' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @ApiPropertyOptional({
    enum: PUBLIC_REGISTRATION_ROLES,
    default: Role.CUSTOMER,
  })
  @IsOptional()
  @IsIn(PUBLIC_REGISTRATION_ROLES)
  role?: PublicRegistrationRole;
}
