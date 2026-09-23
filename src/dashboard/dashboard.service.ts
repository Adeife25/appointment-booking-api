import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

type AppStatus =
  'PENDING' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED' | 'REJECTED';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async adminOverview() {
    const [users, providers, services, appointments, revenueRows, ratings] =
      await Promise.all([
        this.prisma.user.count({ where: { deletedAt: null } }),
        this.prisma.providerProfile.count(),
        this.prisma.service.count({ where: { isActive: true } }),
        this.prisma.appointment.count(),
        this.prisma.appointment.findMany({
          where: { status: 'COMPLETED' },
          select: { priceAtBooking: true },
        }),
        this.prisma.review.aggregate({
          _avg: { rating: true },
          _count: true,
        }),
      ]);

    return {
      totalUsers: users,
      totalProviders: providers,
      totalServices: services,
      totalAppointments: appointments,
      revenue: this.sumPrices(revenueRows),
      averageRating: ratings._avg.rating?.toFixed(2) ?? null,
      totalReviews: ratings._count,
    };
  }

  async adminAppointments() {
    const grouped = await this.prisma.appointment.groupBy({
      by: ['status'],
      _count: true,
    });
    const counts: Record<AppStatus, number> = {
      PENDING: 0,
      CONFIRMED: 0,
      COMPLETED: 0,
      CANCELLED: 0,
      REJECTED: 0,
    };
    for (const row of grouped) {
      counts[row.status] = row._count;
    }
    return counts;
  }

  async adminTrends(days: number) {
    const clamped = this.validateDays(days);
    const start = new Date();
    start.setUTCHours(0, 0, 0, 0);
    start.setUTCDate(start.getUTCDate() - (clamped - 1));

    const appointments = await this.prisma.appointment.findMany({
      where: { startTime: { gte: start } },
      select: {
        startTime: true,
        status: true,
        priceAtBooking: true,
      },
    });

    const map = new Map<string, { bookings: number; revenueValue: number }>();
    for (let i = 0; i < clamped; i++) {
      const d = new Date(start);
      d.setUTCDate(d.getUTCDate() + i);
      map.set(d.toISOString().slice(0, 10), { bookings: 0, revenueValue: 0 });
    }

    for (const appt of appointments) {
      const key = appt.startTime.toISOString().slice(0, 10);
      const entry = map.get(key);
      if (!entry) continue;
      entry.bookings += 1;
      if (appt.status === 'COMPLETED') {
        entry.revenueValue += Number(appt.priceAtBooking) || 0;
      }
    }

    return Array.from(map.entries()).map(([date, value]) => ({
      date,
      bookings: value.bookings,
      revenue: value.revenueValue.toFixed(2),
    }));
  }

  async adminTopProviders() {
    const providers = await this.prisma.providerProfile.findMany({
      select: {
        id: true,
        businessName: true,
        _count: {
          select: {
            appointments: { where: { status: 'COMPLETED' } },
            reviews: true,
          },
        },
        reviews: { select: { rating: true } },
      },
    });

    return providers
      .map((p) => ({
        id: p.id,
        businessName: p.businessName,
        completedAppointments: p._count.appointments,
        totalReviews: p._count.reviews,
        averageRating:
          p.reviews.length > 0
            ? (
                p.reviews.reduce((sum, r) => sum + r.rating, 0) /
                p.reviews.length
              ).toFixed(2)
            : null,
      }))
      .sort((a, b) => b.completedAppointments - a.completedAppointments)
      .slice(0, 10);
  }

  async providerOverview(providerProfileId: string) {
    const now = new Date();
    const startOfDay = new Date(now);
    startOfDay.setUTCHours(0, 0, 0, 0);
    const startOfMonth = new Date(now);
    startOfMonth.setUTCDate(1);
    startOfMonth.setUTCHours(0, 0, 0, 0);
    const endOfDay = new Date(startOfDay);
    endOfDay.setUTCDate(endOfDay.getUTCDate() + 1);

    const base = { providerProfileId };
    const [today, upcoming, completed, revenueRows, ratings] =
      await Promise.all([
        this.prisma.appointment.count({
          where: {
            ...base,
            startTime: { gte: startOfDay, lt: endOfDay },
            status: { in: ['PENDING', 'CONFIRMED'] },
          },
        }),
        this.prisma.appointment.count({
          where: {
            ...base,
            startTime: { gte: now },
            status: { in: ['PENDING', 'CONFIRMED'] },
          },
        }),
        this.prisma.appointment.count({
          where: {
            ...base,
            status: 'COMPLETED',
            startTime: { gte: startOfMonth },
          },
        }),
        this.prisma.appointment.findMany({
          where: {
            ...base,
            status: 'COMPLETED',
            startTime: { gte: startOfMonth },
          },
          select: { priceAtBooking: true },
        }),
        this.prisma.review.aggregate({
          where: { providerProfileId },
          _avg: { rating: true },
        }),
      ]);

    return {
      todayAppointments: today,
      upcomingAppointments: upcoming,
      completedThisMonth: completed,
      revenueThisMonth: this.sumPrices(revenueRows),
      averageRating: ratings._avg.rating?.toFixed(2) ?? null,
    };
  }

  async providerSchedule(providerProfileId: string, date?: string) {
    const day = date ? this.parseDate(date) : new Date();
    const start = new Date(day);
    start.setUTCHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 1);

    const appointments = await this.prisma.appointment.findMany({
      where: {
        providerProfileId,
        startTime: { gte: start, lt: end },
      },
      orderBy: { startTime: 'asc' },
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        service: { select: { id: true, name: true, durationMinutes: true } },
      },
    });

    return { date: start.toISOString().slice(0, 10), appointments };
  }

  async customerOverview(userId: string) {
    const now = new Date();
    const [upcoming, past, cancelled, pendingReviews] = await Promise.all([
      this.prisma.appointment.count({
        where: {
          customerId: userId,
          startTime: { gte: now },
          status: { in: ['PENDING', 'CONFIRMED'] },
        },
      }),
      this.prisma.appointment.count({
        where: {
          customerId: userId,
          startTime: { lt: now },
          status: 'COMPLETED',
        },
      }),
      this.prisma.appointment.count({
        where: { customerId: userId, status: 'CANCELLED' },
      }),
      this.prisma.appointment.count({
        where: {
          customerId: userId,
          status: 'COMPLETED',
          review: null,
        },
      }),
    ]);

    return {
      upcomingAppointments: upcoming,
      completedAppointments: past,
      cancelledAppointments: cancelled,
      pendingReviews,
    };
  }

  private sumPrices(
    rows: Array<{ priceAtBooking: { toString(): string } | null }>,
  ): string {
    const total = rows.reduce(
      (sum, row) => sum + (row.priceAtBooking ? Number(row.priceAtBooking) : 0),
      0,
    );
    return total.toFixed(2);
  }

  private validateDays = (days: number) => {
    const clamped = Math.min(Math.max(Math.floor(days) || 30, 1), 365);
    if (Number.isNaN(clamped)) throw new BadRequestException('Invalid days');
    return clamped;
  };

  private parseDate(date: string): Date {
    const parsed = new Date(`${date}T00:00:00.000Z`);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException('date must be in YYYY-MM-DD format');
    }
    return parsed;
  }
}
