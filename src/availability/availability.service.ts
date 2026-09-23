import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateAvailabilityDto,
  UpdateAvailabilityDto,
} from './dto/availability.dto';

@Injectable()
export class AvailabilityService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    userId: string,
    providerProfileId: string | null,
    dto: CreateAvailabilityDto,
  ) {
    if (!providerProfileId) {
      throw new ForbiddenException('Provider profile not found');
    }
    await this.assertOwner(userId, providerProfileId);
    this.assertValidRange(dto.startTime, dto.endTime);

    try {
      return await this.prisma.availability.create({
        data: { ...dto, providerProfileId },
      });
    } catch (error) {
      if (
        typeof error === 'object' &&
        error &&
        'code' in error &&
        (error as { code: string }).code === 'P2002'
      ) {
        throw new BadRequestException('This availability slot already exists');
      }
      throw error;
    }
  }

  async findAllForProvider(providerProfileId: string) {
    return this.prisma.availability.findMany({
      where: { providerProfileId, isActive: true },
      orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
    });
  }

  async findSlotsForRange(providerProfileId: string, from: string, to: string) {
    const provider = await this.prisma.providerProfile.findUnique({
      where: { id: providerProfileId },
      select: { id: true },
    });
    if (!provider) throw new NotFoundException('Provider not found');

    const fromDate = parseUtcDate(from);
    const toDate = parseUtcDate(to);
    const rangeDays = Math.round(
      (toDate.getTime() - fromDate.getTime()) / 86_400_000,
    );
    if (rangeDays < 0) {
      throw new BadRequestException('from must be before or equal to to');
    }
    if (rangeDays > 31) {
      throw new BadRequestException('The date range cannot exceed 31 days');
    }

    const [availabilities, appointments] = await Promise.all([
      this.prisma.availability.findMany({
        where: { providerProfileId, isActive: true },
        orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
      }),
      this.prisma.appointment.findMany({
        where: {
          providerProfileId,
          status: { in: ['PENDING', 'CONFIRMED'] },
          startTime: { lt: toAfter(fromDate, rangeDays) },
          endTime: { gt: fromDate },
        },
        orderBy: { startTime: 'asc' },
        select: { startTime: true, endTime: true },
      }),
    ]);

    const days: Array<{
      date: string;
      dayOfWeek: number;
      open: Array<{ start: string; end: string }>;
      booked: Array<{ start: string; end: string }>;
    }> = [];
    for (let day = 0; day <= rangeDays; day++) {
      const date = fromAfter(fromDate, day);
      const dayOfWeek = date.getUTCDay();
      const dayStart = date;
      const dayEnd = fromAfter(date, 1);
      days.push({
        date: date.toISOString().slice(0, 10),
        dayOfWeek,
        open: availabilities
          .filter((slot) => slot.dayOfWeek === dayOfWeek)
          .map((slot) => ({
            start: slot.startTime,
            end: slot.endTime,
          })),
        booked: appointments
          .filter(
            (appointment) =>
              appointment.startTime < dayEnd && appointment.endTime > dayStart,
          )
          .map((appointment) => ({
            start: appointment.startTime.toISOString(),
            end: appointment.endTime.toISOString(),
          })),
      });
    }

    return {
      providerId: providerProfileId,
      from: fromDate.toISOString().slice(0, 10),
      to: toDate.toISOString().slice(0, 10),
      days,
    };
  }

  async update(
    userId: string,
    availabilityId: string,
    dto: UpdateAvailabilityDto,
  ) {
    const slot = await this.prisma.availability.findUnique({
      where: { id: availabilityId },
    });
    if (!slot) throw new NotFoundException('Availability slot not found');
    const provider = await this.prisma.providerProfile.findUnique({
      where: { id: slot.providerProfileId },
      select: { userId: true },
    });
    if (!provider || provider.userId !== userId) {
      throw new ForbiddenException('You do not own this availability slot');
    }
    if (dto.startTime !== undefined && dto.endTime !== undefined) {
      this.assertValidRange(dto.startTime, dto.endTime);
    }

    return this.prisma.availability.update({
      where: { id: availabilityId },
      data: {
        ...(dto.dayOfWeek !== undefined && { dayOfWeek: dto.dayOfWeek }),
        ...(dto.startTime !== undefined && { startTime: dto.startTime }),
        ...(dto.endTime !== undefined && { endTime: dto.endTime }),
      },
    });
  }

  async remove(userId: string, availabilityId: string) {
    const slot = await this.prisma.availability.findUnique({
      where: { id: availabilityId },
    });
    if (!slot) throw new NotFoundException('Availability slot not found');
    const provider = await this.prisma.providerProfile.findUnique({
      where: { id: slot.providerProfileId },
      select: { userId: true },
    });
    if (!provider || provider.userId !== userId) {
      throw new ForbiddenException('You do not own this availability slot');
    }
    await this.prisma.availability.update({
      where: { id: availabilityId },
      data: { isActive: false },
    });
    return { message: 'Availability slot removed' };
  }

  private assertValidRange(startTime: string, endTime: string) {
    if (startTime >= endTime) {
      throw new BadRequestException('startTime must be before endTime');
    }
  }

  private async assertOwner(userId: string, providerProfileId: string) {
    const profile = await this.prisma.providerProfile.findUnique({
      where: { id: providerProfileId },
      select: { userId: true },
    });
    if (!profile || profile.userId !== userId) {
      throw new ForbiddenException('Provider profile not found');
    }
  }
}

function parseUtcDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function fromAfter(base: Date, days: number): Date {
  return new Date(base.getTime() + days * 86_400_000);
}

function toAfter(base: Date, days: number): Date {
  return fromAfter(base, days + 1);
}
