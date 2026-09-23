import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { AuthResponseDto } from '../dto/auth-response.dto';
import { GoogleConfiguredGuard } from './google-configured.guard';

const SOCIAL_THROTTLE = {
  default: { limit: 10, ttl: 60_000 },
};

@ApiTags('auth')
@Controller('auth')
export class SocialAuthController {
  @Public()
  @Throttle(SOCIAL_THROTTLE)
  @Get('google')
  @UseGuards(GoogleConfiguredGuard, AuthGuard('google'))
  @ApiOperation({ summary: 'Redirect to Google OAuth consent screen' })
  googleAuth(): void {}

  @Public()
  @Throttle(SOCIAL_THROTTLE)
  @Get('google/callback')
  @UseGuards(GoogleConfiguredGuard, AuthGuard('google'))
  @ApiOperation({
    summary: 'Google OAuth callback; exchanges the provider auth for tokens',
  })
  @ApiOkResponse({
    type: AuthResponseDto,
    description: 'Token pair issued',
  })
  googleAuthRedirect(@Req() req: Request): AuthResponseDto {
    return req.user as AuthResponseDto;
  }
}
