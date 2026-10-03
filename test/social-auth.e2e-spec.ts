import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportModule } from '@nestjs/passport';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AuthService } from './../src/auth/auth.service';
import { GoogleConfiguredGuard } from './../src/auth/social/google-configured.guard';
import { GoogleStrategy } from './../src/auth/social/google.strategy';
import { SocialAuthController } from './../src/auth/social/social-auth.controller';

describe('Social auth (e2e)', () => {
  describe('when Google OAuth is not configured', () => {
    let app: INestApplication;

    beforeAll(async () => {
      const moduleFixture: TestingModule = await Test.createTestingModule({
        imports: [PassportModule],
        controllers: [SocialAuthController],
        providers: [
          { provide: AuthService, useValue: { oauthLogin: jest.fn() } },
          {
            provide: ConfigService,
            useValue: {
              get: jest.fn(() => undefined),
              getOrThrow: jest.fn(() => {
                throw new Error('not configured');
              }),
            },
          },
          GoogleConfiguredGuard,
        ],
      }).compile();

      app = moduleFixture.createNestApplication();
      await app.init();
    });

    afterAll(async () => {
      await app.close();
    });

    it('returns 503 when hitting the authorize endpoint', async () => {
      const res = await request(app.getHttpServer()).get('/auth/google');
      expect(res.status).toBe(503);
    });

    it('returns 503 when hitting the callback endpoint', async () => {
      const res = await request(app.getHttpServer()).get(
        '/auth/google/callback',
      );
      expect(res.status).toBe(503);
    });
  });

  describe('when Google OAuth is configured', () => {
    let app: INestApplication;

    beforeAll(async () => {
      const moduleFixture: TestingModule = await Test.createTestingModule({
        imports: [PassportModule],
        controllers: [SocialAuthController],
        providers: [
          { provide: AuthService, useValue: { oauthLogin: jest.fn() } },
          {
            provide: ConfigService,
            useValue: {
              get: jest.fn((key: string) => {
                if (key === 'googleClientId') return 'client-id-123';
                if (key === 'googleClientSecret') return 'client-secret-123';
                if (key === 'googleCallbackUrl')
                  return 'http://localhost:3001/api/v1/auth/google/callback';
                return undefined;
              }),
              getOrThrow: jest.fn((key: string) => {
                if (key === 'googleClientId') return 'client-id-123';
                if (key === 'googleClientSecret') return 'client-secret-123';
                throw new Error(`missing key: ${key}`);
              }),
            },
          },
          GoogleConfiguredGuard,
          GoogleStrategy,
        ],
      }).compile();

      app = moduleFixture.createNestApplication();
      await app.init();
    });

    afterAll(async () => {
      await app.close();
    });

    it('redirects to the Google consent screen', async () => {
      const res = await request(app.getHttpServer()).get('/auth/google');
      expect(res.status).toBe(302);
      expect(res.headers.location).toContain('accounts.google.com');
      expect(res.headers.location).toContain('client_id=client-id-123');
    });

    it('rejects a callback that arrives with an error from Google', async () => {
      const res = await request(app.getHttpServer()).get(
        '/auth/google/callback?error=access_denied',
      );
      expect(res.status).toBe(401);
    });
  });
});
