-- Athlete voucher cuts for Olympic and Spa, plus one redemption per place.

ALTER TABLE "app_tournaments" ADD COLUMN IF NOT EXISTS "olympicDiscountVnd" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "app_tournaments" ADD COLUMN IF NOT EXISTS "spaDiscountVnd" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS "app_tournament_voucher_uses" (
    "id" TEXT NOT NULL,
    "voucherId" TEXT NOT NULL,
    "zoneCode" TEXT NOT NULL,
    "amountVnd" INTEGER NOT NULL,
    "redeemedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "scannedByName" TEXT,
    CONSTRAINT "app_tournament_voucher_uses_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "app_tournament_voucher_uses_voucherId_zoneCode_key" ON "app_tournament_voucher_uses"("voucherId", "zoneCode");
CREATE INDEX IF NOT EXISTS "app_tournament_voucher_uses_zoneCode_redeemedAt_idx" ON "app_tournament_voucher_uses"("zoneCode", "redeemedAt");

DO $$ BEGIN
  ALTER TABLE "app_tournament_voucher_uses" ADD CONSTRAINT "app_tournament_voucher_uses_voucherId_fkey"
    FOREIGN KEY ("voucherId") REFERENCES "app_tournament_vouchers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
