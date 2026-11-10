-- Athlete attendance on a check-in. Voucher use is tracked separately.

ALTER TABLE "app_tournament_check_ins" ADD COLUMN IF NOT EXISTS "attendance" TEXT NOT NULL DEFAULT 'PRESENT';
