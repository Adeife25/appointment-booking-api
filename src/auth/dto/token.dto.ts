import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class TokenDto {
  @ApiProperty({ description: 'Opaque refresh or reset token' })
  @IsString()
  @IsNotEmpty()
  token: string;
}
