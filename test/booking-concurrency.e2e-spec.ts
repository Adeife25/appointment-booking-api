import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { randomUUID } from 'crypto';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { PricingType, PricingUnit, Role } from '../src/generated/prisma/client';

describe('Appointment booking concurrency (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const providerEmail = `provider-${randomUUID()}@example.com`;
  const customerEmails = [
    `customer-a-${randomUUID()}@example.com`,
    `customer-b-${randomUUID()}@example.com`,
  ];
  const seededProvider = {
    businessName: 'Concurrency Clinic',
    slug: `concurrency-clinic-${randomUUID().slice(0, 8)}`,
  };
  const seededService = {
    name: 'Concurrency Consult',
    slug: `concurrency-consult-${randomUUID().slice(0, 8)}`,
  };

  let providerProfileId: string;
  let serviceId: string;
  let startTime: Date;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1', { exclude: ['health', 'metrics'] });
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();

    prisma = app.get(PrismaService);

    const provider = await prisma.user.create({
      data: {
        email: providerEmail,
        passwordHash: 'unused-in-test',
        name: 'Concurrency Provider',
        role: Role.PROVIDER,
      },
      select: { id: true },
    });

    const profile = await prisma.providerProfile.create({
      data: {
        userId: provider.id,
        businessName: seededProvider.businessName,
        slug: seededProvider.slug,
      },
      select: { id: true },
    });
    providerProfileId = profile.id;

    const service = await prisma.service.create({
      data: {
        providerProfileId,
        name: seededService.name,
        slug: seededService.slug,
        pricingType: PricingType.FIXED,
        pricingUnit: PricingUnit.PER_SERVICE,
        price: '100.00',
        durationMinutes: 60,
        isActive: true,
      },
      select: { id: true },
    });
    serviceId = service.id;

    startTime = new Date();
    startTime.setUTCDate(startTime.getUTCDate() + 2);
    startTime.setUTCHours(14, 0, 0, 0);

    await prisma.availability.create({
      data: {
        providerProfileId,
        dayOfWeek: startTime.getUTCDay(),
        startTime: '09:00',
        endTime: '17:00',
        isActive: true,
      },
    });
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.appointment.deleteMany({
        where: { providerProfileId },
      });
      await prisma.availability.deleteMany({
        where: { providerProfileId },
      });
      await prisma.service.deleteMany({
        where: { providerProfileId },
      });
      await prisma.providerProfile.deleteMany({
        where: { id: providerProfileId },
      });
      await prisma.user.deleteMany({
        where: {
          OR: [{ email: providerEmail }, { email: { in: customerEmails } }],
        },
      });
    }
    await app?.close();
  });

  it('allows only one of two simultaneous bookings for the same slot', async () => {
    const tokens: string[] = [];
    for (const email of customerEmails) {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          email,
          password: 'StrongPass123!',
          name: 'Concurrency Customer',
        })
        .expect(201);
      tokens.push(res.body.data.accessToken);
    }

    const book = (token: string) =>
      request(app.getHttpServer())
        .post('/api/v1/appointments')
        .set('Authorization', `Bearer ${token}`)
        .send({
          providerProfileId,
          serviceId,
          startTime: startTime.toISOString(),
        });

    const results = await Promise.all([book(tokens[0]), book(tokens[1])]);
    const statuses = results.map((r) => r.status).sort();

    expect(statuses).toEqual([201, 409]);

    const winner = results.find((r) => r.status === 201);
    expect(winner).toBeDefined();
    expect(winner!.body.data.id).toBeDefined();
    expect(winner!.body.data.status).toBe('PENDING');

    const loser = results.find((r) => r.status === 409);
    expect(loser).toBeDefined();
    expect(loser!.body.message).toContain('already booked');
  });
});
