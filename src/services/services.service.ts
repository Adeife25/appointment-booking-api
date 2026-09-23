import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { PaginationQueryDto } from '../common/dto/pagination.dto';
import { generateSlug } from '../common/utils/slug.util';
import { CreateServiceDto } from './dto/create-service.dto';
import { UpdateServiceDto } from './dto/update-service.dto';
import { PricingType, PricingUnit, Prisma } from '../generated/prisma/client';

const PRICE_REQUIRED_TYPES: PricingType[] = [
  PricingType.FIXED,
  PricingType.PER_HOUR,
];
const NO_PRICE_TYPES: PricingType[] = [
  PricingType.ON_REQUEST,
  PricingType.FREE,
  PricingType.NOT_SHOWN,
];

type ServicePricingData = {
  pricingType: PricingType;
  pricingUnit: PricingUnit | null;
  price: string | null;
};

@Injectable()
export class ServicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async create(
    userId: string,
    providerProfileId: string | null,
    dto: CreateServiceDto,
  ) {
    await this.assertOwnerProfile(userId, providerProfileId);

    this.validateWorkingHours(dto.startTime, dto.endTime);
    const pricing = this.resolvePricing(
      dto.pricingType ?? PricingType.FIXED,
      dto.price,
      dto.pricingUnit,
    );

    return this.prisma.service.create({
      data: {
        providerProfileId: providerProfileId!,
        name: dto.name,
        slug: dto.slug ?? generateSlug(dto.name),
        description: dto.description,
        imageUrl: dto.imageUrl,
        pricingType: pricing.pricingType,
        pricingUnit: pricing.pricingUnit,
        price: pricing.price,
        durationMinutes: dto.durationMinutes ?? null,
        startTime: dto.startTime,
        endTime: dto.endTime,
      },
    });
  }

  async findAll(query: PaginationQueryDto, providerId?: string) {
    const where: Prisma.ServiceWhereInput = {
      isActive: true,
      ...(providerId ? { providerProfileId: providerId } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.service.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        include: {
          provider: {
            select: {
              id: true,
              businessName: true,
              slug: true,
              location: true,
            },
          },
        },
      }),
      this.prisma.service.count({ where }),
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
    const service = await this.prisma.service.findUnique({
      where: { id },
      include: {
        provider: {
          select: {
            id: true,
            businessName: true,
            slug: true,
            location: true,
          },
        },
      },
    });
    if (!service || !service.isActive)
      throw new NotFoundException('Service not found');
    return this.withShareLink(service);
  }

  async findByIdentifier(slugOrId: string) {
    const include = {
      provider: {
        select: {
          id: true,
          businessName: true,
          slug: true,
          location: true,
        },
      },
    };
    const service =
      (await this.prisma.service.findFirst({
        where: { slug: slugOrId, isActive: true },
        include,
      })) ??
      (await this.prisma.service.findFirst({
        where: { id: slugOrId, isActive: true },
        include,
      }));
    if (!service) throw new NotFoundException('Service not found');
    return this.withShareLink(service);
  }

  async update(userId: string, serviceId: string, dto: UpdateServiceDto) {
    await this.assertOwner(userId, serviceId);

    this.validateWorkingHours(dto.startTime, dto.endTime);

    const data: Prisma.ServiceUpdateInput = {};

    if (dto.name !== undefined) data.name = dto.name;
    if (dto.slug !== undefined) data.slug = dto.slug;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.imageUrl !== undefined) data.imageUrl = dto.imageUrl;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;

    if (dto.startTime !== undefined || dto.endTime !== undefined) {
      data.startTime = dto.startTime ?? null;
      data.endTime = dto.endTime ?? null;
    }

    if (dto.durationMinutes !== undefined) {
      data.durationMinutes = dto.durationMinutes ?? null;
    }

    if (
      dto.pricingType !== undefined ||
      dto.price !== undefined ||
      dto.pricingUnit !== undefined
    ) {
      const current = await this.prisma.service.findUnique({
        where: { id: serviceId },
        select: { pricingType: true, pricingUnit: true, price: true },
      });
      const type = dto.pricingType ?? current?.pricingType ?? PricingType.FIXED;
      const price =
        dto.price === undefined
          ? (current?.price?.toString() ?? null)
          : dto.price;
      const pricingUnit =
        dto.pricingUnit === undefined
          ? (current?.pricingUnit ?? null)
          : dto.pricingUnit;
      const pricing = this.resolvePricing(type, price, pricingUnit);
      data.pricingType = pricing.pricingType;
      data.pricingUnit = pricing.pricingUnit;
      data.price = pricing.price;
    }

    return this.prisma.service.update({ where: { id: serviceId }, data });
  }

  async remove(userId: string, serviceId: string) {
    await this.assertOwner(userId, serviceId);
    await this.prisma.service.update({
      where: { id: serviceId },
      data: { isActive: false },
    });
    return { message: 'Service removed' };
  }

  private resolvePricing(
    pricingType: PricingType,
    price: string | null | undefined,
    pricingUnit?: PricingUnit | null,
  ): ServicePricingData {
    if (pricingType === PricingType.FIXED) {
      if (!price) {
        throw new BadRequestException(
          'price is required when pricingType is FIXED',
        );
      }
      if (!pricingUnit) {
        throw new BadRequestException(
          'pricingUnit is required when pricingType is FIXED',
        );
      }
      return { pricingType, pricingUnit, price };
    }
    if (PRICE_REQUIRED_TYPES.includes(pricingType)) {
      if (!price) {
        throw new BadRequestException(
          `price is required when pricingType is ${pricingType}`,
        );
      }
      return { pricingType, pricingUnit: null, price };
    }
    if (NO_PRICE_TYPES.includes(pricingType)) {
      return { pricingType, pricingUnit: null, price: null };
    }
    return { pricingType, pricingUnit: null, price: price ?? null };
  }

  private validateWorkingHours(startTime?: string, endTime?: string): void {
    const hasStart = startTime !== undefined && startTime !== null;
    const hasEnd = endTime !== undefined && endTime !== null;
    if (hasStart !== hasEnd) {
      throw new BadRequestException(
        'startTime and endTime must be set together',
      );
    }
    if (hasStart && hasEnd && startTime >= endTime) {
      throw new BadRequestException('startTime must be earlier than endTime');
    }
  }

  private async assertOwnerProfile(
    userId: string,
    providerProfileId: string | null,
  ) {
    if (!providerProfileId) {
      throw new ForbiddenException('Provider profile not found');
    }
    const profile = await this.prisma.providerProfile.findUnique({
      where: { id: providerProfileId },
      select: { userId: true },
    });
    if (!profile || profile.userId !== userId) {
      throw new ForbiddenException('Provider profile not found');
    }
    return profile;
  }

  private async assertOwner(userId: string, serviceId: string) {
    const service = await this.prisma.service.findUnique({
      where: { id: serviceId },
      include: { provider: { select: { userId: true } } },
    });
    if (!service) throw new NotFoundException('Service not found');
    if (service.provider.userId !== userId) {
      throw new ForbiddenException('You do not own this service');
    }
  }

  private withShareLink<T extends Record<string, unknown>>(
    service: T,
  ): T & { shareLink: string } {
    const base = this.config.get<string>(
      'publicBaseUrl',
      'http://localhost:3001',
    );
    return {
      ...service,
      shareLink: `${base}/s/${String(service.slug)}`,
    };
  }
}
