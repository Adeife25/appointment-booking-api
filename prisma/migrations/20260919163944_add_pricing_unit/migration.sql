-- CreateEnum
CREATE TYPE "PricingUnit" AS ENUM ('PER_HOUR', 'PER_SERVICE');

-- AlterTable
ALTER TABLE "services" ADD COLUMN     "pricingUnit" "PricingUnit";

-- Backfill existing FIXED services as flat-per-service (preserves prior behavior)
UPDATE "services" SET "pricingUnit" = 'PER_SERVICE' WHERE "pricingType" = 'FIXED';
