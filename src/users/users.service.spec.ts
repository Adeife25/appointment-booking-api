import * as bcrypt from 'bcrypt';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Role } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from './users.service';

jest.mock('bcrypt', () => ({
  compare: jest.fn(),
  hash: jest.fn().mockResolvedValue('hashed'),
}));

type PrismaMock = Record<string, any>;

describe('UsersService', () => {
  let service: UsersService;
  let prisma: PrismaMock;
  let config: Record<string, any>;

  beforeEach(() => {
    (bcrypt.compare as jest.Mock).mockClear();
    (bcrypt.hash as jest.Mock).mockClear();

    prisma = {
      $transaction: jest.fn((actions: any[]) => Promise.all(actions)),
      user: {
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue({ id: 'user-1' }),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      refreshToken: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
      notificationPreference: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest
          .fn()
          .mockImplementation(({ data }) => ({ id: 'np-1', ...data })),
        upsert: jest.fn().mockResolvedValue({}),
      },
    };

    config = {
      get: jest.fn((key: string) =>
        key === 'publicBaseUrl' ? 'http://localhost:3001' : undefined,
      ),
    };

    const cacheService = {
      del: jest.fn().mockResolvedValue(undefined),
    };

    service = new UsersService(
      prisma as unknown as PrismaService,
      config as unknown as ConfigService,
      cacheService as any,
    );
  });

  describe('getMe', () => {
    it('returns the current user', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'a@example.com',
        role: Role.CUSTOMER,
        deletedAt: null,
      });
      const result = await service.getMe('user-1');
      expect(result?.email).toBe('a@example.com');
      expect(prisma.user.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'user-1' } }),
      );
    });

    it('throws when user is deleted', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        deletedAt: new Date(),
      });
      await expect(service.getMe('user-1')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('updateMe', () => {
    it('updates only provided fields', async () => {
      prisma.user.update.mockResolvedValue({ id: 'user-1' });
      await service.updateMe('user-1', { name: 'New Name' });
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'user-1' },
          data: expect.objectContaining({ name: 'New Name' }),
        }),
      );
    });
  });

  describe('changePassword', () => {
    it('changes the password and revokes refresh tokens', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        passwordHash: 'hashed',
      });
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await service.changePassword('user-1', {
        currentPassword: 'OldPass123!',
        newPassword: 'NewPass123!',
      });

      expect(result.message).toContain('changed');
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ userId: 'user-1' }),
        }),
      );
    });

    it('rejects an incorrect current password', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        passwordHash: 'hashed',
      });
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(
        service.changePassword('user-1', {
          currentPassword: 'Wrong',
          newPassword: 'NewPass123!',
        } as any),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('deleteMe', () => {
    it('anonymizes the account and revokes tokens', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'a@example.com',
      });
      const result = await service.deleteMe('user-1');
      expect(result.message).toContain('deleted');

      const updateData = prisma.user.update.mock.calls[0][0].data;
      expect(updateData.deletedAt).toBeInstanceOf(Date);
      expect(updateData.isActive).toBe(false);
      expect(updateData.email).toMatch(/@deleted\.invalid$/);
    });
  });

  describe('notification settings', () => {
    it('creates preferences when missing', async () => {
      const result = await service.getNotificationSettings('user-1');
      expect(result.id).toBe('np-1');
      expect(prisma.notificationPreference.create).toHaveBeenCalled();
    });

    it('updates preferences via upsert', async () => {
      prisma.notificationPreference.findUnique.mockResolvedValue({
        id: 'np-1',
        emailEnabled: false,
      });
      await service.updateNotificationSettings('user-1', {
        emailEnabled: false,
      });
      expect(prisma.notificationPreference.upsert).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        create: expect.objectContaining({ userId: 'user-1' }),
        update: { emailEnabled: false },
      });
    });
  });

  describe('admin user management', () => {
    it('lists active users with pagination meta', async () => {
      const result = await service.listUsers(1, 10);
      expect(result.meta.total).toBe(0);
      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { deletedAt: null } }),
      );
    });

    it('deactivates a user and revokes tokens', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        deletedAt: null,
      });
      const result = await service.deactivateUser('user-1');
      expect(result.message).toContain('deactivated');
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { isActive: false } }),
      );
    });

    it('rejects deactivating a deleted user', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        deletedAt: new Date(),
      });
      await expect(service.deactivateUser('user-1')).rejects.toThrow(
        ConflictException,
      );
    });

    it('activates a user', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'user-1' });
      const result = await service.activateUser('user-1');
      expect(result.message).toContain('activated');
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { isActive: true } }),
      );
    });
  });
});
