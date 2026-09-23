import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Profile, Strategy, VerifyCallback } from 'passport-google-oauth20';
import { AuthService, OAuthUserData } from '../auth.service';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(
    config: ConfigService,
    private readonly authService: AuthService,
  ) {
    super({
      clientID: config.getOrThrow<string>('googleClientId'),
      clientSecret: config.getOrThrow<string>('googleClientSecret'),
      callbackURL: config.get<string>('googleCallbackUrl'),
      scope: ['email', 'profile'],
    });
  }

  async validate(
    _accessToken: string,
    _refreshToken: string,
    profile: Profile,
    done: VerifyCallback,
  ): Promise<void> {
    const email = profile.emails?.[0]?.value;
    if (!email) {
      done(new UnauthorizedException('Google account has no email'), undefined);
      return;
    }
    try {
      const user = await this.authService.oauthLogin({
        googleId: profile.id,
        email,
        name: profile.displayName ?? email.split('@')[0],
        avatarUrl: profile.photos?.[0]?.value ?? null,
      } satisfies OAuthUserData);
      done(null, user);
    } catch (error) {
      done(error as Error, undefined);
    }
  }
}
