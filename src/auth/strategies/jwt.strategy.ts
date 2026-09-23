import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { CacheService } from '../../common/services/cache.service';
import { AuthUser } from '../../common/types/auth-user';
import { PrismaService } from '../../prisma/prisma.service';

interface AccessTokenPayload {
  sub: string;
}

const USER_CACHE_TTL = 60_000;

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly cacheService: CacheService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('jwt.accessSecret'),
    });
  }

  async validate(payload: AccessTokenPayload): Promise<AuthUser> {
    const user = await this.cacheService.wrap<AuthUser>(
      `user/${payload.sub}`,
      async () => {
        const dbUser = await this.prisma.user.findUnique({
          where: { id: payload.sub },
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
            isActive: true,
            deletedAt: true,
            providerProfile: { select: { id: true } },
          },
        });

        if (!dbUser || !dbUser.isActive || dbUser.deletedAt) {
          throw new UnauthorizedException('Account is disabled or deleted');
        }

        return {
          id: dbUser.id,
          email: dbUser.email,
          name: dbUser.name,
          role: dbUser.role,
          providerProfileId: dbUser.providerProfile?.id ?? null,
        };
      },
      USER_CACHE_TTL,
    );

    return user;
  }
}
