import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateReviewDto, UpdateReviewDto } from './dto/review.dto';

@Injectable()
export class ReviewsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, dto: CreateReviewDto) {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id: dto.appointmentId },
      select: {
        id: true,
        customerId: true,
        status: true,
        providerProfileId: true,
      },
    });

    if (!appointment) throw new NotFoundException('Appointment not found');
    if (appointment.customerId !== userId) {
      throw new ForbiddenException('You can only review your own appointments');
    }
    if (appointment.status !== 'COMPLETED') {
      throw new BadRequestException(
        'You can only review completed appointments',
      );
    }

    const existing = await this.prisma.review.findUnique({
      where: { appointmentId: appointment.id },
      select: { id: true },
    });
    if (existing) {
      throw new BadRequestException(
        'This appointment has already been reviewed',
      );
    }

    return this.prisma.review.create({
      data: {
        customerId: userId,
        providerProfileId: appointment.providerProfileId,
        appointmentId: appointment.id,
        rating: dto.rating,
        comment: dto.comment,
      },
    });
  }

  async findAllForProvider(providerProfileId: string, page = 1, limit = 20) {
    const where = { providerProfileId };
    const [items, total] = await Promise.all([
      this.prisma.review.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          customer: { select: { id: true, name: true, avatarUrl: true } },
        },
      }),
      this.prisma.review.count({ where }),
    ]);
    return {
      items,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async update(userId: string, reviewId: string, dto: UpdateReviewDto) {
    const review = await this.prisma.review.findUnique({
      where: { id: reviewId },
    });
    if (!review) throw new NotFoundException('Review not found');
    if (review.customerId !== userId) {
      throw new ForbiddenException('You can only edit your own reviews');
    }
    return this.prisma.review.update({
      where: { id: reviewId },
      data: {
        ...(dto.rating !== undefined && { rating: dto.rating }),
        ...(dto.comment !== undefined && { comment: dto.comment }),
      },
    });
  }

  async remove(userId: string, reviewId: string) {
    const review = await this.prisma.review.findUnique({
      where: { id: reviewId },
    });
    if (!review) throw new NotFoundException('Review not found');
    if (review.customerId !== userId) {
      throw new ForbiddenException('You can only delete your own reviews');
    }
    await this.prisma.review.delete({ where: { id: reviewId } });
    return { message: 'Review deleted' };
  }
}
