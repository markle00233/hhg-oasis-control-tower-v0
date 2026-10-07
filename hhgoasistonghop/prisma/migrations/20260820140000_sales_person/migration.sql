ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "salesPersonCode" TEXT;
ALTER TABLE "Membership" ADD COLUMN IF NOT EXISTS "salesPersonCode" TEXT;

CREATE INDEX IF NOT EXISTS "Customer_salesPersonCode_idx" ON "Customer"("salesPersonCode");
CREATE INDEX IF NOT EXISTS "Membership_salesPersonCode_idx" ON "Membership"("salesPersonCode");
