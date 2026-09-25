import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Profile, VerifyCallback } from 'passport-google-oauth20';
import { AuthService, OAuthUserData } from '../auth.service';
import { GoogleStrategy } from './google.strategy';

type Callback = jest.Mock<ReturnType<VerifyCallback>>;

describe('GoogleStrategy', () => {
  let strategy: GoogleStrategy;
  let authService: { oauthLogin: jest.Mock };
  let done: Callback;

  const config = {
    get: jest.fn((key: string) =>
      key === 'googleCallbackUrl' ? 'http://localhost/cb' : undefined,
    ),
    getOrThrow: jest.fn((key: string) => {
      if (key === 'googleClientId') return 'client-id';
      if (key === 'googleClientSecret') return 'client-secret';
      throw new Error(`missing key: ${key}`);
    }),
  } as unknown as ConfigService;

  const profile = {
    id: 'google-1',
    provider: 'google' as const,
    displayName: 'Ada Lovelace',
    emails: [{ value: 'ada@example.com', verified: true }],
    photos: [{ value: 'https://img.example.com/ada.png' }],
    profileUrl: 'https://plus.google.com/103202766294928077604',
    _raw: '{}',
    _json: {},
  } as Profile;

  beforeEach(() => {
    authService = { oauthLogin: jest.fn() };
    done = jest.fn() as Callback;
    strategy = new GoogleStrategy(
      config,
      authService as unknown as AuthService,
    );
  });

  it('maps the Google profile and issues tokens on success', async () => {
    authService.oauthLogin.mockResolvedValue({ accessToken: 'at' });

    await strategy.validate('access-token', 'refresh-token', profile, done);

    const expected: OAuthUserData = {
      googleId: 'google-1',
      email: 'ada@example.com',
      name: 'Ada Lovelace',
      avatarUrl: 'https://img.example.com/ada.png',
    };
    expect(authService.oauthLogin).toHaveBeenCalledWith(expected);
    expect(done).toHaveBeenCalledWith(null, { accessToken: 'at' });
  });

  it('falls back to the email local part when displayName is missing', async () => {
    authService.oauthLogin.mockResolvedValue({ accessToken: 'at' });
    const noName = {
      ...profile,
      displayName: undefined,
    } as unknown as Profile;

    await strategy.validate('at', 'rt', noName, done);

    expect(done).not.toHaveBeenCalledWith(expect.any(Error), undefined);
    expect(authService.oauthLogin).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'ada' }),
    );
  });

  it('rejects an account with no verified email', async () => {
    const noEmail = { ...profile, emails: [] } as Profile;

    await strategy.validate('at', 'rt', noEmail, done);

    expect(done).toHaveBeenCalledWith(
      expect.any(UnauthorizedException),
      undefined,
    );
    expect(authService.oauthLogin).not.toHaveBeenCalled();
  });

  it('forwards failures from the auth service', async () => {
    const error = new Error('oauth failed');
    authService.oauthLogin.mockRejectedValue(error);

    await strategy.validate('at', 'rt', profile, done);

    expect(done).toHaveBeenCalledWith(error, undefined);
  });
});
