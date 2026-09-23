import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Role } from '../../generated/prisma/client';

export class UserSummaryDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  email: string;

  @ApiProperty()
  name: string;

  @ApiProperty({ enum: Role })
  role: Role;

  @ApiPropertyOptional({ nullable: true })
  providerProfileId?: string | null;
}

export class AuthResponseDto {
  @ApiProperty({ description: 'Short-lived JWT access token' })
  accessToken: string;

  @ApiProperty({ description: 'Opaque refresh token for renewal' })
  refreshToken: string;

  @ApiProperty({ type: UserSummaryDto })
  user: UserSummaryDto;
}

export class MessageResponseDto {
  @ApiProperty()
  message: string;

  @ApiPropertyOptional({
    description: 'Reset token — only returned when RETURN_RESET_TOKEN=true',
  })
  resetToken?: string;
}
