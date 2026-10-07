ALTER TABLE "Visit" ADD COLUMN IF NOT EXISTS "membershipId" TEXT;

CREATE INDEX IF NOT EXISTS "Visit_membershipId_idx" ON "Visit"("membershipId");

DO $$
BEGIN
  ALTER TABLE "Visit"
    ADD CONSTRAINT "Visit_membershipId_fkey"
    FOREIGN KEY ("membershipId") REFERENCES "Membership"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

UPDATE "Visit" v
SET "membershipId" = m.id
FROM "Membership" m
WHERE v."membershipId" IS NULL
  AND v.note IS NOT NULL
  AND v.note = 'Check-in gói ' || m."membershipCode";
