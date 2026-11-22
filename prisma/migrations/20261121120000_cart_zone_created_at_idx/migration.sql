-- Desk lists today's carts by zone and created time.
CREATE INDEX IF NOT EXISTS "app_service_carts_zoneCode_createdAt_idx"
  ON "app_service_carts"("zoneCode", "createdAt");
