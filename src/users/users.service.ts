import * as bcrypt from 'bcrypt';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { generateSlug } from '../common/utils/slug.util';
import { CacheService } from '../common/services/cache.service';
import { Role } from '../generated/prisma/client';
import { ConfigService } from '@nestjs/config';
import { ChangePasswordDto } from './dto/change-password.dto';
import { UpdateNotificationSettingsDto } from './dto/update-notification-settings.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { SwitchRoleDto } from './dto/switch-role.dto';

type ProfileWithLink = {
  id: string;
  slug: string | null;
  [key: string]: unknown;
};

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly cacheService: CacheService,
  ) {}

  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        phone: true,
        avatarUrl: true,
        isActive: true,
        createdAt: true,
        deletedAt: true,
        providerProfile: {
          select: {
            id: true,
            businessName: true,
            location: true,
            slug: true,
            isActive: true,
            contactMethods: true,
          },
        },
      },
    });
    if (!user || user.deletedAt) {
      throw new UnauthorizedException('User not found');
    }
    return this.attachProfileLink(user);
  }

  async updateMe(userId: string, dto: UpdateProfileDto) {
    return this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.phone !== undefined && { phone: dto.phone }),
        ...(dto.avatarUrl !== undefined && { avatarUrl: dto.avatarUrl }),
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        phone: true,
        avatarUrl: true,
      },
    });
  }

  async switchRole(userId: string, dto: SwitchRoleDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        phone: true,
        providerProfile: { select: { id: true, isActive: true } },
      },
    });
    if (!user) throw new UnauthorizedException('User not found');

    if (user.role === Role.ADMIN) {
      throw new ForbiddenException('Admin accounts cannot switch roles');
    }
    if (user.role === dto.role) {
      throw new BadRequestException(
        `Account is already of type ${dto.role.toLowerCase()}`,
      );
    }

    if (dto.role === Role.PROVIDER) {
      if (!user.providerProfile) {
        if (!dto.businessName) {
          throw new BadRequestException(
            'businessName is required when switching to provider',
          );
        }
        await this.prisma.$transaction([
          this.prisma.providerProfile.create({
            data: {
              userId: user.id,
              businessName: dto.businessName,
              slug: generateSlug(dto.businessName),
            },
          }),
          this.prisma.user.update({
            where: { id: userId },
            data: { role: Role.PROVIDER },
          }),
        ]);
      } else {
        await this.prisma.$transaction([
          this.prisma.providerProfile.update({
            where: { id: user.providerProfile.id },
            data: { isActive: true },
          }),
          this.prisma.user.update({
            where: { id: userId },
            data: { role: Role.PROVIDER },
          }),
        ]);
      }
    }

    if (dto.role === Role.CUSTOMER) {
      if (!user.providerProfile) {
        throw new BadRequestException(
          'No provider profile exists to switch from',
        );
      }

      const activeFuture = await this.prisma.appointment.count({
        where: {
          providerProfileId: user.providerProfile.id,
          startTime: { gt: new Date() },
          status: { in: ['PENDING', 'CONFIRMED'] },
        },
      });
      if (activeFuture > 0) {
        throw new ConflictException(
          'Cannot switch to customer while you have pending or confirmed upcoming appointments',
        );
      }

      await this.prisma.$transaction([
        this.prisma.providerProfile.update({
          where: { id: user.providerProfile.id },
          data: { isActive: false },
        }),
        this.prisma.service.updateMany({
          where: { providerProfileId: user.providerProfile.id },
          data: { isActive: false },
        }),
        this.prisma.user.update({
          where: { id: userId },
          data: { role: Role.CUSTOMER },
        }),
      ]);
    }

    const updated = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        phone: true,
        providerProfile: {
          select: {
            id: true,
            businessName: true,
            slug: true,
            isActive: true,
            contactMethods: true,
          },
        },
      },
    });

    await this.invalidateUserCache(userId);

    return this.attachProfileLink(updated);
  }

  private async invalidateUserCache(userId: string): Promise<void> {
    await this.cacheService.del(`user/${userId}`);
  }

  private attachProfileLink<
    T extends { providerProfile: ProfileWithLink | null },
  >(user: T | null) {
    if (!user?.providerProfile?.slug) {
      return user;
    }
    const base = this.config.get<string>(
      'publicBaseUrl',
      'http://localhost:3001',
    );
    return {
      ...user,
      providerProfile: {
        ...user.providerProfile,
        shareLink: `${base}/${user.providerProfile.slug}`,
      },
    };
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, passwordHash: true },
    });
    if (!user) throw new UnauthorizedException('User not found');

    const valid = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    const passwordHash = await bcrypt.hash(dto.newPassword, 12);
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { passwordHash },
      }),
      this.prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    await this.invalidateUserCache(userId);

    return { message: 'Password changed successfully' };
  }

  async deleteMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true },
    });
    if (!user) throw new UnauthorizedException('User not found');

    const anonymizedEmail = `deleted_${Date.now()}_${Math.random().toString(36).slice(2)}@deleted.invalid`;
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: {
          email: anonymizedEmail,
          name: '[Deleted Account]',
          phone: null,
          avatarUrl: null,
          isActive: false,
          deletedAt: new Date(),
        },
      }),
      this.prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    await this.invalidateUserCache(userId);

    return { message: 'Account deleted successfully' };
  }

  async getNotificationSettings(userId: string) {
    let prefs = await this.prisma.notificationPreference.findUnique({
      where: { userId },
    });
    if (!prefs) {
      prefs = await this.prisma.notificationPreference.create({
        data: { userId },
      });
    }
    return prefs;
  }

  async updateNotificationSettings(
    userId: string,
    dto: UpdateNotificationSettingsDto,
  ) {
    await this.prisma.notificationPreference.upsert({
      where: { userId },
      create: { userId, ...dto },
      update: dto,
    });
    return this.getNotificationSettings(userId);
  }

  async listUsers(page = 1, limit = 20) {
    const [items, total] = await Promise.all([
      this.prisma.user.findMany({
        where: { deletedAt: null },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          isActive: true,
          createdAt: true,
        },
      }),
      this.prisma.user.count({ where: { deletedAt: null } }),
    ]);
    return {
      items,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async deactivateUser(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.deletedAt) throw new ConflictException('User not found');

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { isActive: false },
      }),
      this.prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    await this.invalidateUserCache(userId);

    return { message: 'User deactivated' };
  }

  async activateUser(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.deletedAt) throw new ConflictException('User not found');

    await this.prisma.user.update({
      where: { id: userId },
      data: { isActive: true },
    });

    await this.invalidateUserCache(userId);

    return { message: 'User activated' };
  }
}
