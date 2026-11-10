-- Athlete tournaments. Independent of membership vouchers.
-- One check-in and one voucher per customer per event.
-- One results image and one external gallery link per event.

CREATE TABLE IF NOT EXISTS "app_tournaments" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'UPCOMING',
    "checkInToken" TEXT NOT NULL,
    "summary" TEXT,
    "miaOiDiscountVnd" INTEGER NOT NULL DEFAULT 50000,
    "longNuongDiscountVnd" INTEGER NOT NULL DEFAULT 30000,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "app_tournaments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "app_tournaments_checkInToken_key" ON "app_tournaments"("checkInToken");
CREATE INDEX IF NOT EXISTS "app_tournaments_status_startsAt_idx" ON "app_tournaments"("status", "startsAt");
CREATE INDEX IF NOT EXISTS "app_tournaments_startsAt_idx" ON "app_tournaments"("startsAt");

CREATE TABLE IF NOT EXISTS "app_tournament_check_ins" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'QR',
    "checkedInAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "checkedByName" TEXT,
    CONSTRAINT "app_tournament_check_ins_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "app_tournament_check_ins_tournamentId_customerId_key" ON "app_tournament_check_ins"("tournamentId", "customerId");
CREATE INDEX IF NOT EXISTS "app_tournament_check_ins_customerId_checkedInAt_idx" ON "app_tournament_check_ins"("customerId", "checkedInAt");

CREATE TABLE IF NOT EXISTS "app_tournament_vouchers" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ISSUED',
    "passToken" TEXT,
    "passExpiresAt" TIMESTAMP(3),
    "redeemedZone" TEXT,
    "redeemedVnd" INTEGER,
    "redeemedAt" TIMESTAMP(3),
    "scannedByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "app_tournament_vouchers_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "app_tournament_vouchers_tournamentId_customerId_key" ON "app_tournament_vouchers"("tournamentId", "customerId");
CREATE UNIQUE INDEX IF NOT EXISTS "app_tournament_vouchers_passToken_key" ON "app_tournament_vouchers"("passToken");
CREATE INDEX IF NOT EXISTS "app_tournament_vouchers_customerId_status_idx" ON "app_tournament_vouchers"("customerId", "status");
CREATE INDEX IF NOT EXISTS "app_tournament_vouchers_tournamentId_status_idx" ON "app_tournament_vouchers"("tournamentId", "status");

CREATE TABLE IF NOT EXISTS "app_tournament_assets" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "label" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "app_tournament_assets_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "app_tournament_assets_tournamentId_kind_key" ON "app_tournament_assets"("tournamentId", "kind");

DO $$ BEGIN
  ALTER TABLE "app_tournament_check_ins" ADD CONSTRAINT "app_tournament_check_ins_tournamentId_fkey"
    FOREIGN KEY ("tournamentId") REFERENCES "app_tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "app_tournament_check_ins" ADD CONSTRAINT "app_tournament_check_ins_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES "app_customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "app_tournament_vouchers" ADD CONSTRAINT "app_tournament_vouchers_tournamentId_fkey"
    FOREIGN KEY ("tournamentId") REFERENCES "app_tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "app_tournament_vouchers" ADD CONSTRAINT "app_tournament_vouchers_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES "app_customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "app_tournament_assets" ADD CONSTRAINT "app_tournament_assets_tournamentId_fkey"
    FOREIGN KEY ("tournamentId") REFERENCES "app_tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
