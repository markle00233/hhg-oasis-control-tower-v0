-- Phase 1–4: Task lifecycle + acknowledge + review (additive, backward compatible)

ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "acknowledgedAt" TIMESTAMP(3);
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "assignedByUserId" TEXT;
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "reviewerUserId" TEXT;
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "important" BOOLEAN;
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "urgent" BOOLEAN;
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "expectedResult" TEXT;
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "proofRequired" BOOLEAN;
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "proofDescription" TEXT;
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "estimatedDurationMinutes" INTEGER;
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "waitingFor" TEXT;
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "waitingReason" TEXT;
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "waitingExpectedDate" TEXT;
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "blockerTitle" TEXT;
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "blockerDescription" TEXT;
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "pauseReason" TEXT;
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "pausedBecauseProjectId" TEXT;
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "revisionNote" TEXT;

CREATE INDEX IF NOT EXISTS "Project_reviewerUserId_idx" ON "Project"("reviewerUserId");
CREATE INDEX IF NOT EXISTS "Project_assignedByUserId_idx" ON "Project"("assignedByUserId");
CREATE INDEX IF NOT EXISTS "Project_status_idx" ON "Project"("status");

DO $$ BEGIN
  ALTER TABLE "Project" ADD CONSTRAINT "Project_assignedByUserId_fkey"
    FOREIGN KEY ("assignedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "Project" ADD CONSTRAINT "Project_reviewerUserId_fkey"
    FOREIGN KEY ("reviewerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
