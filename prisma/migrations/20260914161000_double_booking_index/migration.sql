-- Prevent a provider from having two active appointments starting at the same time.
-- Enforces the double-booking rule at the database level, in addition to the
-- application-level transaction check.
CREATE UNIQUE INDEX "appointments_no_double_booking_idx"
  ON "appointments" ("providerProfileId", "startTime")
  WHERE "status" IN ('PENDING', 'CONFIRMED');