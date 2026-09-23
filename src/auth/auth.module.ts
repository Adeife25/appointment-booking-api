import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { CacheService } from '../common/services/cache.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { GoogleConfiguredGuard } from './social/google-configured.guard';
import { GoogleStrategy } from './social/google.strategy';
import { SocialAuthController } from './social/social-auth.controller';

const GOOGLE_OAUTH_ENABLED = Boolean(
  process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET,
);

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.register({}),
    NotificationsModule,
  ],
  controllers: [AuthController, SocialAuthController],
  providers: [
    AuthService,
    JwtStrategy,
    CacheService,
    GoogleConfiguredGuard,
    ...(GOOGLE_OAUTH_ENABLED ? [GoogleStrategy] : []),
  ],
  exports: [AuthService],
})
export class AuthModule {}
