-- User department (2 bên vận hành)
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "department" TEXT NOT NULL DEFAULT 'ADMIN';

-- Membership contract + renewal
ALTER TABLE "Membership" ADD COLUMN IF NOT EXISTS "contractCode" TEXT;
ALTER TABLE "Membership" ADD COLUMN IF NOT EXISTS "renewedFromId" TEXT;

UPDATE "Membership" m
SET "contractCode" = 'HD-' || LPAD(sub.rn::text, 6, '0')
FROM (
  SELECT id, ROW_NUMBER() OVER (ORDER BY "createdAt" ASC) AS rn
  FROM "Membership"
) sub
WHERE m.id = sub.id AND (m."contractCode" IS NULL OR m."contractCode" = '');

ALTER TABLE "Membership" ALTER COLUMN "contractCode" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "Membership_contractCode_key" ON "Membership"("contractCode");
CREATE INDEX IF NOT EXISTS "Membership_contractCode_idx" ON "Membership"("contractCode");

DO $$
BEGIN
  ALTER TABLE "Membership"
    ADD CONSTRAINT "Membership_renewedFromId_fkey"
    FOREIGN KEY ("renewedFromId") REFERENCES "Membership"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Phone may be shared inside a family group
ALTER TABLE "Customer" DROP CONSTRAINT IF EXISTS "Customer_phoneNormalized_key";
CREATE INDEX IF NOT EXISTS "Customer_phoneNormalized_idx" ON "Customer"("phoneNormalized");

-- Family group
CREATE TABLE IF NOT EXISTS "FamilyGroup" (
    "id" TEXT NOT NULL,
    "groupCode" TEXT NOT NULL,
    "name" TEXT,
    "phone" TEXT NOT NULL,
    "phoneNormalized" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "FamilyGroup_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "FamilyGroup_groupCode_key" ON "FamilyGroup"("groupCode");
CREATE UNIQUE INDEX IF NOT EXISTS "FamilyGroup_phoneNormalized_key" ON "FamilyGroup"("phoneNormalized");
CREATE UNIQUE INDEX IF NOT EXISTS "FamilyGroup_ownerId_key" ON "FamilyGroup"("ownerId");
CREATE INDEX IF NOT EXISTS "FamilyGroup_phoneNormalized_idx" ON "FamilyGroup"("phoneNormalized");

ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "familyGroupId" TEXT;
CREATE INDEX IF NOT EXISTS "Customer_familyGroupId_idx" ON "Customer"("familyGroupId");

DO $$
BEGIN
  ALTER TABLE "FamilyGroup"
    ADD CONSTRAINT "FamilyGroup_ownerId_fkey"
    FOREIGN KEY ("ownerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "Customer"
    ADD CONSTRAINT "Customer_familyGroupId_fkey"
    FOREIGN KEY ("familyGroupId") REFERENCES "FamilyGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Promotion / Voucher
CREATE TABLE IF NOT EXISTS "Promotion" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT,
    "serviceId" TEXT,
    "validFrom" TIMESTAMP(3),
    "validTo" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Promotion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Promotion_code_key" ON "Promotion"("code");

CREATE TABLE IF NOT EXISTS "CustomerPromotion" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "promotionId" TEXT NOT NULL,
    "note" TEXT,
    "assignedById" TEXT,
    "usedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CustomerPromotion_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "CustomerPromotion_customerId_idx" ON "CustomerPromotion"("customerId");
CREATE INDEX IF NOT EXISTS "CustomerPromotion_promotionId_idx" ON "CustomerPromotion"("promotionId");

DO $$
BEGIN
  ALTER TABLE "Promotion"
    ADD CONSTRAINT "Promotion_serviceId_fkey"
    FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "Promotion"
    ADD CONSTRAINT "Promotion_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "CustomerPromotion"
    ADD CONSTRAINT "CustomerPromotion_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "CustomerPromotion"
    ADD CONSTRAINT "CustomerPromotion_promotionId_fkey"
    FOREIGN KEY ("promotionId") REFERENCES "Promotion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "CustomerPromotion"
    ADD CONSTRAINT "CustomerPromotion_assignedById_fkey"
    FOREIGN KEY ("assignedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
