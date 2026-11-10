-- Signup is Tham gia until the athlete checks in.
-- The event day ending without check-in becomes Không đến.

ALTER TABLE "app_tournament_check_ins"
  ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "app_tournament_check_ins"
SET "createdAt" = "checkedInAt"
WHERE "checkedInAt" IS NOT NULL;

ALTER TABLE "app_tournament_check_ins"
  ALTER COLUMN "checkedInAt" DROP NOT NULL;

ALTER TABLE "app_tournament_check_ins"
  ALTER COLUMN "checkedInAt" DROP DEFAULT;

ALTER TABLE "app_tournament_check_ins"
  ALTER COLUMN "attendance" SET DEFAULT 'REGISTERED';
