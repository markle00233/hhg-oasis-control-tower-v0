-- Ensure shared family phones are allowed on Customer (unique only on FamilyGroup)
ALTER TABLE "Customer" DROP CONSTRAINT IF EXISTS "Customer_phoneNormalized_key";
DROP INDEX IF EXISTS "Customer_phoneNormalized_key";
CREATE INDEX IF NOT EXISTS "Customer_phoneNormalized_idx" ON "Customer"("phoneNormalized");
