-- Keep the first announced day and clock so a later delay can say "dời về …".
ALTER TABLE "app_tournaments" ADD COLUMN IF NOT EXISTS "originalStartsAt" TIMESTAMP(3);
ALTER TABLE "app_tournaments" ADD COLUMN IF NOT EXISTS "originalEventTime" TEXT;

UPDATE "app_tournaments"
SET "originalStartsAt" = "startsAt"
WHERE "originalStartsAt" IS NULL;

UPDATE "app_tournaments"
SET "originalEventTime" = "eventTime"
WHERE "originalEventTime" IS NULL
  AND "eventTime" IS NOT NULL;
