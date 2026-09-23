import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { PaginationQueryDto } from '../common/dto/pagination.dto';
import { UpdateProviderProfileDto } from './dto/update-provider-profile.dto';
import { Prisma } from '../generated/prisma/client';

@Injectable()
export class ProvidersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async findAll(query: PaginationQueryDto, search?: string) {
    const where: Prisma.ProviderProfileWhereInput = {
      isActive: true,
      ...(search
        ? {
            OR: [
              { businessName: { contains: search, mode: 'insensitive' } },
              { description: { contains: search, mode: 'insensitive' } },
              { location: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.providerProfile.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        include: {
          user: { select: { id: true, name: true, avatarUrl: true } },
        },
      }),
      this.prisma.providerProfile.count({ where }),
    ]);

    return {
      items: items.map((item) => this.withShareLink(item)),
      meta: {
        total,
        page: query.page,
        limit: query.limit,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  async findOne(id: string) {
    const provider = await this.prisma.providerProfile.findFirst({
      where: { id, isActive: true },
      include: {
        user: { select: { id: true, name: true, avatarUrl: true } },
        services: { where: { isActive: true }, orderBy: { createdAt: 'desc' } },
        availabilities: {
          where: { isActive: true },
          orderBy: { dayOfWeek: 'asc' },
        },
      },
    });
    if (!provider) throw new NotFoundException('Provider not found');
    return this.withShareLink(provider);
  }

  async findByIdentifier(slugOrId: string) {
    const provider =
      (await this.prisma.providerProfile.findFirst({
        where: { slug: slugOrId, isActive: true },
        include: {
          user: { select: { id: true, name: true, avatarUrl: true } },
          services: {
            where: { isActive: true },
            orderBy: { createdAt: 'desc' },
          },
          availabilities: {
            where: { isActive: true },
            orderBy: { dayOfWeek: 'asc' },
          },
        },
      })) ??
      (await this.prisma.providerProfile.findFirst({
        where: { id: slugOrId, isActive: true },
        include: {
          user: { select: { id: true, name: true, avatarUrl: true } },
          services: {
            where: { isActive: true },
            orderBy: { createdAt: 'desc' },
          },
          availabilities: {
            where: { isActive: true },
            orderBy: { dayOfWeek: 'asc' },
          },
        },
      }));
    if (!provider) throw new NotFoundException('Provider not found');
    return this.withShareLink(provider);
  }

  async update(
    userId: string,
    providerProfileId: string,
    dto: UpdateProviderProfileDto,
  ) {
    const profile = await this.prisma.providerProfile.findUnique({
      where: { id: providerProfileId },
      select: { userId: true },
    });
    if (!profile || profile.userId !== userId) {
      throw new NotFoundException('Provider profile not found');
    }

    return this.prisma.providerProfile.update({
      where: { id: providerProfileId },
      data: {
        ...(dto.businessName !== undefined && {
          businessName: dto.businessName,
        }),
        ...(dto.slug !== undefined && { slug: dto.slug }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.location !== undefined && { location: dto.location }),
        ...(dto.contactPhone !== undefined && {
          contactPhone: dto.contactPhone,
        }),
        ...(dto.contactEmail !== undefined && {
          contactEmail: dto.contactEmail,
        }),
        ...(dto.contactMethods !== undefined && {
          contactMethods: dto.contactMethods,
        }),
        ...(dto.profileImage !== undefined && {
          profileImage: dto.profileImage,
        }),
      },
    });
  }

  async setVerification(providerProfileId: string, isVerified: boolean) {
    const profile = await this.prisma.providerProfile.findUnique({
      where: { id: providerProfileId },
      select: { id: true },
    });
    if (!profile) {
      throw new NotFoundException('Provider profile not found');
    }
    return this.prisma.providerProfile.update({
      where: { id: providerProfileId },
      data: { isVerified },
    });
  }

  private withShareLink<T extends Record<string, unknown>>(
    provider: T,
  ): T & { shareLink: string } {
    const base = this.config.get<string>(
      'publicBaseUrl',
      'http://localhost:3001',
    );
    return {
      ...provider,
      shareLink: `${base}/${String(provider.slug)}`,
    };
  }
}
