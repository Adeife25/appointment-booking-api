import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import ms from 'ms';
import { Role } from '../generated/prisma/client';
import { generateSlug } from '../common/utils/slug.util';
import { CacheService } from '../common/services/cache.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthResponseDto, UserSummaryDto } from './dto/auth-response.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { generateOpaqueToken, hashToken } from './token.util';

const BCRYPT_ROUNDS = 12;
const RESET_TOKEN_TTL = '1h';

type TokenIssuer = UserSummaryDto & {
  isActive?: boolean;
  deletedAt?: Date | null;
};

export type OAuthUserData = {
  googleId: string;
  email: string;
  name: string;
  avatarUrl?: string | null;
};

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly notifications: NotificationsService,
    private readonly cacheService: CacheService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResponseDto> {
    const email = dto.email.trim().toLowerCase();
    const existing = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException('An account with this email already exists');
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    const role: Role = dto.role ?? Role.CUSTOMER;
    if (role === Role.ADMIN) {
      throw new BadRequestException(
        'ADMIN accounts cannot be created via public registration',
      );
    }

    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email,
          passwordHash,
          name: dto.name,
          phone: dto.phone,
          role,
        },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          providerProfile: { select: { id: true } },
        },
      });

      if (role === Role.PROVIDER) {
        await tx.providerProfile.create({
          data: {
            userId: created.id,
            businessName: dto.name,
            slug: generateSlug(dto.name),
          },
        });
      }

      await tx.notificationPreference.create({
        data: { userId: created.id },
      });

      return created;
    });

    const profile = await this.prisma.providerProfile.findUnique({
      where: { userId: user.id },
      select: { id: true },
    });

    return this.issueTokens({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      providerProfileId: profile?.id ?? null,
    });
  }

  async login(dto: LoginDto): Promise<AuthResponseDto> {
    const email = dto.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        passwordHash: true,
        isActive: true,
        deletedAt: true,
        providerProfile: { select: { id: true } },
      },
    });

    if (!user || user.deletedAt) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Invalid credentials');
    }
    if (!user.isActive) {
      throw new UnauthorizedException('Account is disabled');
    }

    return this.issueTokens({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      providerProfileId: user.providerProfile?.id ?? null,
    });
  }

  async oauthLogin(
    profile: OAuthUserData,
    userAgent?: string,
  ): Promise<AuthResponseDto> {
    const user = await this.findOrCreateOAuthUser(profile);
    if (!user.isActive || user.deletedAt) {
      throw new UnauthorizedException('Account is disabled or deleted');
    }

    return this.issueTokens(
      {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        providerProfileId: user.providerProfile?.id ?? null,
      },
      userAgent,
    );
  }

  private async findOrCreateOAuthUser(profile: OAuthUserData) {
    const email = profile.email.trim().toLowerCase();
    const select = {
      id: true,
      email: true,
      name: true,
      role: true,
      googleId: true,
      isActive: true,
      deletedAt: true,
      providerProfile: { select: { id: true } },
    } as const;

    let user = await this.prisma.user.findUnique({ where: { email }, select });

    if (!user) {
      const passwordHash = await bcrypt.hash(
        randomBytes(32).toString('hex'),
        BCRYPT_ROUNDS,
      );
      user = await this.prisma.$transaction(async (tx) => {
        const created = await tx.user.create({
          data: {
            email,
            googleId: profile.googleId,
            passwordHash,
            name: profile.name,
            avatarUrl: profile.avatarUrl ?? null,
            role: Role.CUSTOMER,
          },
          select,
        });
        await tx.notificationPreference.create({
          data: { userId: created.id },
        });
        return created;
      });
    } else if (user.deletedAt) {
      throw new UnauthorizedException('Account is deleted');
    } else if (!user.googleId) {
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: { googleId: profile.googleId },
        select,
      });
    }

    return user;
  }

  async refresh(
    refreshToken: string,
    userAgent?: string,
  ): Promise<AuthResponseDto> {
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: hashToken(refreshToken) },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
            isActive: true,
            deletedAt: true,
            providerProfile: { select: { id: true } },
          },
        },
      },
    });

    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
    if (!stored.user.isActive || stored.user.deletedAt) {
      throw new UnauthorizedException('Account is disabled or deleted');
    }

    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });

    return this.issueTokens(
      {
        id: stored.user.id,
        email: stored.user.email,
        name: stored.user.name,
        role: stored.user.role,
        providerProfileId: stored.user.providerProfile?.id ?? null,
      },
      userAgent,
    );
  }

  async logout(refreshToken: string): Promise<{ message: string }> {
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: hashToken(refreshToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { message: 'Logged out successfully' };
  }

  async forgotPassword(
    dto: ForgotPasswordDto,
  ): Promise<{ message: string; resetToken?: string }> {
    const email = dto.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, isActive: true, deletedAt: true },
    });

    const genericMessage =
      'If an account exists for that email, a password reset link has been sent.';

    if (!user || user.deletedAt || !user.isActive) {
      return { message: genericMessage };
    }

    const token = generateOpaqueToken();
    await this.prisma.passwordResetToken.create({
      data: {
        tokenHash: hashToken(token),
        userId: user.id,
        expiresAt: new Date(Date.now() + ms(RESET_TOKEN_TTL)),
      },
    });

    await this.notifications.sendPasswordResetEmail(user.email, token);

    const returnResetToken = this.config.get<boolean>(
      'returnResetToken',
      false,
    );
    return {
      message: genericMessage,
      ...(returnResetToken ? { resetToken: token } : {}),
    };
  }

  async resetPassword(dto: ResetPasswordDto): Promise<{ message: string }> {
    const stored = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash: hashToken(dto.token) },
      include: {
        user: {
          select: { id: true, isActive: true, deletedAt: true },
        },
      },
    });

    if (!stored || stored.usedAt || stored.expiresAt < new Date()) {
      throw new BadRequestException('Invalid or expired reset token');
    }
    if (!stored.user.isActive || stored.user.deletedAt) {
      throw new UnauthorizedException('Account is disabled or deleted');
    }

    const passwordHash = await bcrypt.hash(dto.newPassword, BCRYPT_ROUNDS);

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: stored.userId },
        data: { passwordHash },
      });
      await tx.passwordResetToken.update({
        where: { id: stored.id },
        data: { usedAt: new Date() },
      });
      await tx.refreshToken.updateMany({
        where: { userId: stored.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await tx.passwordResetToken.updateMany({
        where: { userId: stored.userId, usedAt: null },
        data: { usedAt: new Date() },
      });
    });

    await this.cacheService.del(`user/${stored.userId}`);

    return { message: 'Password reset successfully' };
  }

  private async issueTokens(
    user: TokenIssuer,
    userAgent?: string,
  ): Promise<AuthResponseDto> {
    const accessToken = await this.jwt.signAsync(
      { sub: user.id, email: user.email, role: user.role },
      {
        secret: this.config.getOrThrow<string>('jwt.accessSecret'),
        expiresIn: this.config.get<string>(
          'jwt.accessExpiresIn',
        ) as JwtSignOptions['expiresIn'],
      },
    );

    const refreshToken = generateOpaqueToken();
    const ttl = ms(
      this.config.get<string>('jwt.refreshExpiresIn') as Parameters<
        typeof ms
      >[0],
    );
    await this.prisma.refreshToken.create({
      data: {
        tokenHash: hashToken(refreshToken),
        userId: user.id,
        expiresAt: new Date(Date.now() + ttl),
        userAgent,
      },
    });

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        providerProfileId: user.providerProfileId,
      },
    };
  }
}
