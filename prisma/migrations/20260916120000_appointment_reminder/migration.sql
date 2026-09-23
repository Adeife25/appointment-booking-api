-- AlterTable
ALTER TABLE "appointments" ADD COLUMN "reminderSentAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "appointments_startTime_reminderSentAt_idx" ON "appointments"("startTime", "reminderSentAt");