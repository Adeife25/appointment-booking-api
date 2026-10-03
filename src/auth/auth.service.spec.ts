import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  BadRequestException,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { Role } from '../generated/prisma/client';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';

jest.mock('bcrypt', () => ({
  hash: jest.fn().mockResolvedValue('hashed'),
  compare: jest.fn().mockResolvedValue(true),
}));

describe('AuthService', () => {
  let service: AuthService;
  let prisma: Record<string, any>;
  let notifications: Record<string, any>;
  let config: Record<string, any>;

  const baseUser = {
    id: 'user-1',
    email: 'customer@example.com',
    name: 'Test Customer',
    role: Role.CUSTOMER,
    passwordHash: 'hashed',
    isActive: true,
    deletedAt: null,
    providerProfile: null,
  };

  beforeEach(() => {
    (bcrypt.hash as jest.Mock).mockClear();
    (bcrypt.compare as jest.Mock).mockClear();

    prisma = {
      user: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      providerProfile: { findUnique: jest.fn(), create: jest.fn() },
      refreshToken: {
        findUnique: jest.fn(),
        create: jest.fn().mockResolvedValue({ id: 'rt-1' }),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      passwordResetToken: {
        findUnique: jest.fn(),
        create: jest.fn().mockResolvedValue({ id: 'prt-1' }),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      notificationPreference: { create: jest.fn().mockResolvedValue({}) },
      $transaction: jest.fn((fn: (tx: unknown) => Promise<unknown>) =>
        fn(prisma),
      ),
    };

    notifications = {
      sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
    };

    config = {
      get: jest.fn((key: string) => {
        if (key === 'returnResetToken') return false;
        if (key === 'jwt.accessExpiresIn') return '15m';
        if (key === 'jwt.refreshExpiresIn') return '7d';
        return undefined;
      }),
      getOrThrow: jest.fn(() => 'secret'),
    };

    service = new AuthService(
      prisma as unknown as PrismaService,
      {
        signAsync: jest.fn().mockResolvedValue('access-token'),
      } as unknown as JwtService,
      config as unknown as ConfigService,
      notifications as unknown as NotificationsService,
      { del: jest.fn().mockResolvedValue(undefined) } as any,
    );
  });

  describe('register', () => {
    it('rejects duplicate email', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'existing' });
      await expect(
        service.register({
          name: 'A',
          email: 'DUPE@example.com',
          password: 'Password123!',
        } as any),
      ).rejects.toThrow(ConflictException);
    });

    it('creates a customer account with tokens', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create = jest.fn().mockResolvedValue({
        id: 'user-1',
        email: 'customer@example.com',
        name: 'Test Customer',
        role: Role.CUSTOMER,
        providerProfile: null,
      });
      prisma.providerProfile.findUnique.mockResolvedValue(null);

      const result = await service.register({
        name: 'Test Customer',
        email: 'customer@example.com',
        password: 'Password123!',
      });

      expect(result.accessToken).toBe('access-token');
      expect(result.refreshToken).toMatch(/^[a-f0-9]{64}$/);
      expect(result.user.role).toBe(Role.CUSTOMER);
      expect(result.user.providerProfileId).toBeNull();
      expect(prisma.refreshToken.create).toHaveBeenCalled();
    });

    it('rejects ADMIN role during registration', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      try {
        await service.register({
          name: 'Hacker',
          email: 'admin@example.com',
          password: 'Password123!',
          role: Role.ADMIN,
        });
        throw new Error('Expected register to throw');
      } catch (error) {
        expect(error).toBeInstanceOf(BadRequestException);
      }
    });

    it('creates a provider profile for PROVIDER role', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create = jest.fn().mockResolvedValue({
        id: 'user-2',
        email: 'p@example.com',
        name: 'Pro',
        role: Role.PROVIDER,
        providerProfile: null,
      });
      prisma.providerProfile.findUnique.mockResolvedValue({
        id: 'pp-1',
      });
      prisma.providerProfile.create = jest.fn().mockResolvedValue({});

      const result = await service.register({
        name: 'Pro',
        email: 'p@example.com',
        password: 'Password123!',
        role: Role.PROVIDER,
      });

      expect(prisma.providerProfile.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-2',
          businessName: 'Pro',
          slug: expect.stringMatching(/^pro-[a-z0-9]{4}$/),
        },
      });
      expect(result.user.providerProfileId).toBe('pp-1');
    });
  });

  describe('login', () => {
    it('returns tokens on valid credentials', async () => {
      prisma.user.findUnique.mockResolvedValue(baseUser);
      const result = await service.login({
        email: 'customer@example.com',
        password: 'Password123!',
      });
      expect(result.accessToken).toBe('access-token');
      expect(result.user.id).toBe('user-1');
    });

    it('rejects unknown email', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(
        service.login({ email: 'nope@example.com', password: 'x' } as any),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejects deleted account', async () => {
      prisma.user.findUnique.mockResolvedValue({
        ...baseUser,
        deletedAt: new Date(),
      });
      await expect(
        service.login({ email: 'customer@example.com', password: 'x' } as any),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejects disabled account', async () => {
      prisma.user.findUnique.mockResolvedValue({
        ...baseUser,
        isActive: false,
      });
      await expect(
        service.login({ email: 'customer@example.com', password: 'x' } as any),
      ).rejects.toThrow('Account is disabled');
    });
  });

  describe('refresh', () => {
    it('rotates the refresh token', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue({
        id: 'rt-1',
        revokedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
        user: baseUser,
      });

      const result = await service.refresh('a'.repeat(64), 'agent');

      expect(prisma.refreshToken.update).toHaveBeenCalledWith({
        where: { id: 'rt-1' },
        data: { revokedAt: expect.any(Date) },
      });
      expect(prisma.refreshToken.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ userAgent: 'agent' }),
        }),
      );
      expect(result.accessToken).toBe('access-token');
    });

    it('rejects already revoked token', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue({
        id: 'rt-1',
        revokedAt: new Date(),
        expiresAt: new Date(Date.now() + 60_000),
        user: baseUser,
      });
      await expect(service.refresh('a'.repeat(64))).rejects.toThrow(
        UnauthorizedException,
      );
      expect(prisma.refreshToken.create).not.toHaveBeenCalled();
    });
  });

  describe('logout', () => {
    it('revokes the supplied token', async () => {
      await service.logout('a'.repeat(64));
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ revokedAt: null }),
        }),
      );
    });
  });

  describe('password reset flow', () => {
    it('returns reset token in dev when enabled', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'customer@example.com',
        isActive: true,
        deletedAt: null,
      });
      config.get.mockImplementation((key: string) =>
        key === 'returnResetToken' ? true : undefined,
      );

      const result = await service.forgotPassword({
        email: 'customer@example.com',
      });

      expect(result.resetToken).toMatch(/^[a-f0-9]{64}$/);
      expect(prisma.passwordResetToken.create).toHaveBeenCalled();
      expect(notifications.sendPasswordResetEmail).toHaveBeenCalled();
    });

    it('returns generic message for unknown email', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      const result = await service.forgotPassword({
        email: 'nope@example.com',
      });
      expect(result.resetToken).toBeUndefined();
      expect(result.message).toContain('If an account exists');
    });

    it('rejects an expired/unknown reset token', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue(null);
      await expect(
        service.resetPassword({
          token: 'x',
          newPassword: 'NewPass123!',
        } as any),
      ).rejects.toThrow('Invalid or expired reset token');
    });
  });

  describe('oauthLogin', () => {
    const oauthUser = {
      id: 'user-oauth',
      email: 'ada@example.com',
      name: 'Ada Lovelace',
      role: Role.CUSTOMER,
      googleId: 'google-1',
      isActive: true,
      deletedAt: null,
      providerProfile: null,
    };

    const oauthData = {
      googleId: 'google-1',
      email: 'ada@example.com',
      name: 'Ada Lovelace',
    };

    beforeEach(() => {
      prisma.user.create = jest.fn().mockResolvedValue(oauthUser);
      prisma.user.update = jest.fn().mockResolvedValue(oauthUser);
    });

    it('creates a new account when the email is unknown', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      const result = await service.oauthLogin(oauthData);

      expect(prisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            email: 'ada@example.com',
            googleId: 'google-1',
            role: Role.CUSTOMER,
            passwordHash: 'hashed',
          }),
        }),
      );
      expect(prisma.notificationPreference.create).toHaveBeenCalledWith({
        data: { userId: 'user-oauth' },
      });
      expect(result.accessToken).toBe('access-token');
      expect(result.user.id).toBe('user-oauth');
      expect(result.user.role).toBe(Role.CUSTOMER);
      expect(result.user.providerProfileId).toBeNull();
      expect(prisma.refreshToken.create).toHaveBeenCalled();
    });

    it('links googleId to an existing account without one', async () => {
      prisma.user.findUnique.mockResolvedValue({
        ...oauthUser,
        googleId: null,
      });

      const result = await service.oauthLogin(oauthData);

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'user-oauth' },
          data: { googleId: 'google-1' },
        }),
      );
      expect(prisma.user.create).not.toHaveBeenCalled();
      expect(result.user.id).toBe('user-oauth');
    });

    it('reuses an account already linked to the google id', async () => {
      prisma.user.findUnique.mockResolvedValue(oauthUser);

      const result = await service.oauthLogin(oauthData);

      expect(prisma.user.create).not.toHaveBeenCalled();
      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(result.user.id).toBe('user-oauth');
    });

    it('rejects an account that has been deleted', async () => {
      prisma.user.findUnique.mockResolvedValue({
        ...oauthUser,
        googleId: null,
        deletedAt: new Date(),
      });

      await expect(service.oauthLogin(oauthData)).rejects.toThrow(
        'Account is deleted',
      );
    });

    it('rejects a disabled account', async () => {
      prisma.user.findUnique.mockResolvedValue({
        ...oauthUser,
        isActive: false,
      });

      await expect(service.oauthLogin(oauthData)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('passes the user agent through to stored refresh tokens', async () => {
      prisma.user.findUnique.mockResolvedValue(oauthUser);

      await service.oauthLogin(oauthData, 'test-agent');

      expect(prisma.refreshToken.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ userAgent: 'test-agent' }),
        }),
      );
    });
  });
});
