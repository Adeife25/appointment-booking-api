-- CreateEnum
CREATE TYPE "ContactMethod" AS ENUM ('EMAIL', 'PHONE', 'WHATSAPP', 'IN_APP');

-- CreateEnum
CREATE TYPE "PricingType" AS ENUM ('FIXED', 'PER_HOUR', 'ON_REQUEST', 'FREE', 'NOT_SHOWN');

-- AlterTable
ALTER TABLE "provider_profiles" ADD COLUMN "slug" TEXT;
ALTER TABLE "provider_profiles" ADD COLUMN "contactMethods" "ContactMethod"[] NOT NULL DEFAULT ARRAY[]::"ContactMethod"[];
ALTER TABLE "provider_profiles" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;

-- Backfill slugs for any existing rows (slugify businessName + random suffix to guarantee uniqueness)
UPDATE "provider_profiles"
SET "slug" = lower(regexp_replace(coalesce(nullif("businessName", ''), 'provider'), '[^a-z0-9]+', '-', 'g'))
             || '-' || substr(md5(random()::text), 1, 4)
WHERE "slug" IS NULL;

ALTER TABLE "provider_profiles" ALTER COLUMN "slug" SET NOT NULL;

-- AlterTable
ALTER TABLE "services" ADD COLUMN "slug" TEXT;
ALTER TABLE "services" ADD COLUMN "imageUrl" TEXT;
ALTER TABLE "services" ADD COLUMN "pricingType" "PricingType" NOT NULL DEFAULT 'FIXED';
ALTER TABLE "services" ALTER COLUMN "price" DROP NOT NULL;
ALTER TABLE "services" ALTER COLUMN "durationMinutes" DROP NOT NULL;
ALTER TABLE "services" ADD COLUMN "startTime" VARCHAR(5);
ALTER TABLE "services" ADD COLUMN "endTime" VARCHAR(5);

-- Backfill slugs for any existing rows (slugify name + random suffix to guarantee uniqueness)
UPDATE "services"
SET "slug" = lower(regexp_replace(coalesce(nullif("name", ''), 'service'), '[^a-z0-9]+', '-', 'g'))
             || '-' || substr(md5(random()::text), 1, 4)
WHERE "slug" IS NULL;

ALTER TABLE "services" ALTER COLUMN "slug" SET NOT NULL;

-- AlterTable
ALTER TABLE "appointments" ADD COLUMN "priceAtBooking" DECIMAL(10,2);
ALTER TABLE "appointments" ADD COLUMN "reminderAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "appointment_reminders" (
    "id" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "reminderAt" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "appointment_reminders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "provider_profiles_slug_key" ON "provider_profiles"("slug");

-- CreateIndex
CREATE INDEX "provider_profiles_isActive_idx" ON "provider_profiles"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "services_slug_key" ON "services"("slug");

-- CreateIndex
CREATE INDEX "appointment_reminders_appointmentId_idx" ON "appointment_reminders"("appointmentId");

-- CreateIndex
CREATE INDEX "appointment_reminders_reminderAt_sentAt_idx" ON "appointment_reminders"("reminderAt", "sentAt");

-- AddForeignKey
ALTER TABLE "appointment_reminders" ADD CONSTRAINT "appointment_reminders_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "appointments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment_reminders" ADD CONSTRAINT "appointment_reminders_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;