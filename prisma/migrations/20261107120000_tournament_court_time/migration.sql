-- Court and clock time for an event. The voucher window stays the whole Vietnam day.

ALTER TABLE "app_tournaments" ADD COLUMN IF NOT EXISTS "court" TEXT;
ALTER TABLE "app_tournaments" ADD COLUMN IF NOT EXISTS "eventTime" TEXT;
