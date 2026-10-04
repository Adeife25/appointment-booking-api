import 'dotenv/config';
import * as bcrypt from 'bcrypt';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  ContactMethod,
  PrismaClient,
  PricingType,
  PricingUnit,
  Role,
} from '../src/generated/prisma/client';
import { generateSlug } from '../src/common/utils/slug.util';

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('DATABASE_URL is not set. Add it to .env first.');
  process.exit(1);
}

const KNOWN_INSECURE_PASSWORDS = [
  'AdminPass123!',
  'CustomerPass123!',
  'ProviderPass123!',
];

const adminEmail = process.env.SEED_ADMIN_EMAIL ?? 'admin@example.com';
const adminPassword = process.env.SEED_ADMIN_PASSWORD;
const adminName = process.env.SEED_ADMIN_NAME ?? 'Platform Admin';
const demoDataEnabled = process.env.SEED_DEMO_DATA === 'true';
const demoPassword = process.env.SEED_DEMO_PASSWORD;

if (!adminPassword) {
  console.error(
    'SEED_ADMIN_PASSWORD is not set. Generate one with `openssl rand -base64 24` ' +
      'and store it in your env file. The seeder refuses to use a built-in default.',
  );
  process.exit(1);
}

if (KNOWN_INSECURE_PASSWORDS.includes(adminPassword)) {
  console.error(
    'SEED_ADMIN_PASSWORD matches a password that is published in this repository. ' +
      'Generate a unique one with `openssl rand -base64 24`.',
  );
  process.exit(1);
}

if (demoDataEnabled && !demoPassword) {
  console.error('SEED_DEMO_DATA=true requires SEED_DEMO_PASSWORD to be set.');
  process.exit(1);
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: DATABASE_URL }),
});

async function upsertNotifPref(userId: string) {
  await prisma.notificationPreference.upsert({
    where: { userId },
    create: { userId },
    update: {},
  });
}

async function main() {
  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {
      name: adminName,
      role: Role.ADMIN,
      isActive: true,
      deletedAt: null,
    },
    create: {
      email: adminEmail,
      passwordHash: await bcrypt.hash(adminPassword!, 12),
      name: adminName,
      role: Role.ADMIN,
    },
  });
  await upsertNotifPref(admin.id);
  console.log(`Admin ready: ${admin.email}`);

  if (demoDataEnabled) {
    await seedDemoData(demoPassword as string);
  } else {
    console.log('Demo data skipped (set SEED_DEMO_DATA=true to create it).');
  }
}

async function seedDemoData(demoPassword: string) {
  const customer = await prisma.user.upsert({
    where: { email: 'customer@example.com' },
    update: { name: 'Demo Customer', isActive: true },
    create: {
      email: 'customer@example.com',
      passwordHash: await bcrypt.hash(demoPassword, 12),
      name: 'Demo Customer',
      role: Role.CUSTOMER,
    },
  });
  await upsertNotifPref(customer.id);
  console.log(`Customer ready: ${customer.email}`);

  const providerUser = await prisma.user.upsert({
    where: { email: 'provider@example.com' },
    update: { name: 'Sara Ade', isActive: true },
    create: {
      email: 'provider@example.com',
      passwordHash: await bcrypt.hash(demoPassword, 12),
      name: 'Sara Ade',
      role: Role.PROVIDER,
    },
  });

  const provider = await prisma.providerProfile.upsert({
    where: { userId: providerUser.id },
    update: {
      businessName: 'Sara Beauty Studio',
      description: 'Hair, nails and beauty services.',
      location: 'Victoria Island, Lagos',
      contactPhone: '+2348012345678',
      contactEmail: 'provider@example.com',
      contactMethods: [
        ContactMethod.EMAIL,
        ContactMethod.PHONE,
        ContactMethod.IN_APP,
      ],
      isVerified: true,
    },
    create: {
      userId: providerUser.id,
      businessName: 'Sara Beauty Studio',
      slug: generateSlug('Sara Beauty Studio'),
      description: 'Hair, nails and beauty services.',
      location: 'Victoria Island, Lagos',
      contactPhone: '+2348012345678',
      contactEmail: 'provider@example.com',
      contactMethods: [
        ContactMethod.EMAIL,
        ContactMethod.PHONE,
        ContactMethod.IN_APP,
      ],
      isVerified: true,
    },
  });
  await upsertNotifPref(providerUser.id);
  console.log(`Provider ready: ${provider.businessName} (${provider.id})`);

  const services = [
    {
      id: 'seed-service-haircut',
      name: 'Haircut & Styling',
      description: 'Professional haircut and styling',
      pricingType: PricingType.FIXED,
      pricingUnit: PricingUnit.PER_SERVICE,
      price: '10000',
      durationMinutes: 60,
    },
    {
      id: 'seed-service-nails',
      name: 'Manicure & Pedicure',
      description: 'Nail care and polish',
      pricingType: PricingType.FIXED,
      pricingUnit: PricingUnit.PER_SERVICE,
      price: '15000',
      durationMinutes: 90,
    },
  ];

  for (const svc of services) {
    await prisma.service.upsert({
      where: { id: svc.id },
      update: {
        name: svc.name,
        description: svc.description,
        pricingType: svc.pricingType,
        pricingUnit: svc.pricingUnit,
        price: svc.price,
        durationMinutes: svc.durationMinutes,
        isActive: true,
      },
      create: {
        id: svc.id,
        providerProfileId: provider.id,
        name: svc.name,
        slug: generateSlug(svc.name),
        description: svc.description,
        pricingType: svc.pricingType,
        pricingUnit: svc.pricingUnit,
        price: svc.price,
        durationMinutes: svc.durationMinutes,
      },
    });
  }
  console.log(`Services ready: ${services.map((s) => s.name).join(', ')}`);

  const availability = [
    { dayOfWeek: 1, startTime: '09:00', endTime: '17:00' },
    { dayOfWeek: 2, startTime: '09:00', endTime: '17:00' },
    { dayOfWeek: 3, startTime: '10:00', endTime: '16:00' },
    { dayOfWeek: 4, startTime: '09:00', endTime: '17:00' },
    { dayOfWeek: 5, startTime: '09:00', endTime: '17:00' },
  ];

  for (const slot of availability) {
    await prisma.availability.upsert({
      where: {
        providerProfileId_dayOfWeek_startTime_endTime: {
          providerProfileId: provider.id,
          dayOfWeek: slot.dayOfWeek,
          startTime: slot.startTime,
          endTime: slot.endTime,
        },
      },
      create: { providerProfileId: provider.id, ...slot },
      update: { isActive: true },
    });
  }
  console.log(
    `Availability ready: ${availability.length} weekly slots for ${provider.businessName}`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
