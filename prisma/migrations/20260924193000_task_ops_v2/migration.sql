-- Phase 5–11 additive fields
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "currentStepIndex" INTEGER;
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "stepEstimates" JSONB;
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "pendingChangeRequest" JSONB;
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "collabIssues" JSONB;
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "acknowledgedByUserId" TEXT;
