-- One voucher amount for every sector. Older per-place columns stay unused.

ALTER TABLE "app_tournaments" ADD COLUMN IF NOT EXISTS "discountVnd" INTEGER NOT NULL DEFAULT 50000;
