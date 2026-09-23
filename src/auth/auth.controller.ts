import { Body, Controller, Post } from '@nestjs/common';
import { ApiCreatedResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../common/decorators/public.decorator';
import { AuthService } from './auth.service';
import { AuthResponseDto, MessageResponseDto } from './dto/auth-response.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { TokenDto } from './dto/token.dto';

const AUTH_THROTTLE = {
  default: {
    limit: Number(process.env.THROTTLE_AUTH_LIMIT ?? 5),
    ttl: Number(process.env.THROTTLE_AUTH_TTL ?? 60) * 1000,
  },
};

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('register')
  @ApiOperation({ summary: 'Register a new user' })
  @ApiCreatedResponse({ type: AuthResponseDto })
  register(@Body() dto: RegisterDto): Promise<AuthResponseDto> {
    return this.authService.register(dto);
  }

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('login')
  @ApiOperation({ summary: 'Login with email and password' })
  @ApiCreatedResponse({ type: AuthResponseDto })
  login(@Body() dto: LoginDto): Promise<AuthResponseDto> {
    return this.authService.login(dto);
  }

  @Public()
  @Post('refresh')
  @ApiOperation({
    summary: 'Exchange a valid refresh token for a new token pair',
  })
  @ApiCreatedResponse({ type: AuthResponseDto })
  refresh(@Body() dto: TokenDto): Promise<AuthResponseDto> {
    return this.authService.refresh(dto.token);
  }

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('logout')
  @ApiOperation({ summary: 'Logout and revoke the given refresh token' })
  @ApiCreatedResponse({ type: MessageResponseDto })
  logout(@Body() dto: TokenDto): Promise<{ message: string }> {
    return this.authService.logout(dto.token);
  }

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('forgot-password')
  @ApiOperation({ summary: 'Request a password reset link' })
  @ApiCreatedResponse({ type: MessageResponseDto })
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('reset-password')
  @ApiOperation({ summary: 'Set a new password using a reset token' })
  @ApiCreatedResponse({ type: MessageResponseDto })
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }
}
