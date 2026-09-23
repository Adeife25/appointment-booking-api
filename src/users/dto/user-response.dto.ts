import { ApiProperty } from '@nestjs/swagger';
import { Role } from '../../generated/prisma/client';

export class UserSummaryDto {
  @ApiProperty() id: string;
  @ApiProperty() email: string;
  @ApiProperty() name: string;
  @ApiProperty({ enum: Role }) role: Role;
  @ApiProperty({ nullable: true }) phone: string | null;
  @ApiProperty({ nullable: true }) avatarUrl: string | null;
  @ApiProperty() isActive: boolean;
  @ApiProperty() createdAt: Date;
}
