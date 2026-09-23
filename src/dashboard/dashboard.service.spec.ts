import { PrismaService } from '../prisma/prisma.service';
import { DashboardService } from './dashboard.service';

type PrismaMock = Record<string, any>;

describe('DashboardService', () => {
  let service: DashboardService;
  let prisma: PrismaMock;

  beforeEach(() => {
    prisma = {
      user: { count: jest.fn().mockResolvedValue(10) },
      providerProfile: {
        count: jest.fn().mockResolvedValue(3),
        findMany: jest.fn().mockResolvedValue([]),
      },
      service: { count: jest.fn().mockResolvedValue(5) },
      appointment: {
        count: jest.fn().mockResolvedValue(50),
        findMany: jest.fn().mockResolvedValue([]),
        groupBy: jest.fn().mockResolvedValue([]),
      },
      review: {
        aggregate: jest
          .fn()
          .mockResolvedValue({ _avg: { rating: 4.2 }, _count: 8 }),
      },
    };
    service = new DashboardService(prisma as unknown as PrismaService);
  });

  describe('adminOverview', () => {
    it('computes totals and revenue from completed appointments', async () => {
      prisma.appointment.findMany.mockResolvedValue([
        { priceAtBooking: 10 },
        { priceAtBooking: 20.5 },
      ]);
      const result = await service.adminOverview();
      expect(result.totalUsers).toBe(10);
      expect(result.totalServices).toBe(5);
      expect(result.revenue).toBe('30.50');
      expect(result.averageRating).toBe('4.20');
      expect(result.totalReviews).toBe(8);
    });
  });

  describe('adminAppointments', () => {
    it('returns zero-filled counts per status', async () => {
      prisma.appointment.groupBy.mockResolvedValue([
        { status: 'PENDING', _count: 3 },
        { status: 'CONFIRMED', _count: 7 },
      ]);
      const counts = await service.adminAppointments();
      expect(counts.PENDING).toBe(3);
      expect(counts.CONFIRMED).toBe(7);
      expect(counts.CANCELLED).toBe(0);
    });
  });

  describe('adminTrends', () => {
    it('returns one entry per day for the window', async () => {
      const rows = await service.adminTrends(5);
      expect(rows).toHaveLength(5);
      expect(rows[0]).toHaveProperty('date');
      expect(rows[0]).toHaveProperty('bookings');
      expect(rows[0]).toHaveProperty('revenue');
    });
  });

  describe('adminTopProviders', () => {
    it('sorts by completed appointments', async () => {
      prisma.providerProfile.findMany.mockResolvedValue([
        {
          id: 'p1',
          businessName: 'A',
          _count: { appointments: 1, reviews: 1 },
          reviews: [{ rating: 4 }],
        },
        {
          id: 'p2',
          businessName: 'B',
          _count: { appointments: 9, reviews: 1 },
          reviews: [],
        },
      ]);
      const result = await service.adminTopProviders();
      expect(result[0].businessName).toBe('B');
      expect(result[0].completedAppointments).toBe(9);
    });
  });

  describe('providerOverview', () => {
    it('computes monthly revenue from completed appointments', async () => {
      prisma.appointment.findMany.mockResolvedValue([
        { priceAtBooking: 100 },
        { priceAtBooking: 50 },
      ]);
      prisma.review.aggregate.mockResolvedValue({
        _avg: { rating: null },
      });
      const result = await service.providerOverview('pp-1');
      expect(result.revenueThisMonth).toBe('150.00');
      expect(result.todayAppointments).toBe(50);
    });
  });

  describe('customerOverview', () => {
    it('returns engagement counts', async () => {
      const result = await service.customerOverview('customer-1');
      expect(result).toEqual({
        upcomingAppointments: 50,
        completedAppointments: 50,
        cancelledAppointments: 50,
        pendingReviews: 50,
      });
    });
  });
});
