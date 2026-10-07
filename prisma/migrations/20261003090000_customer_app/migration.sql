-- Customer App tables (digital access pass). Independent from CRM crm_* tables.

CREATE TABLE IF NOT EXISTS "app_customers" (
    "id" TEXT NOT NULL,
    "customerCode" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "app_customers_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "app_customers_customerCode_key" ON "app_customers"("customerCode");
CREATE UNIQUE INDEX IF NOT EXISTS "app_customers_username_key" ON "app_customers"("username");
CREATE INDEX IF NOT EXISTS "app_customers_status_idx" ON "app_customers"("status");
CREATE INDEX IF NOT EXISTS "app_customers_createdAt_idx" ON "app_customers"("createdAt");

CREATE TABLE IF NOT EXISTS "app_customer_sessions" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "app_customer_sessions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "app_customer_sessions_sessionToken_key" ON "app_customer_sessions"("sessionToken");
CREATE INDEX IF NOT EXISTS "app_customer_sessions_customerId_idx" ON "app_customer_sessions"("customerId");
CREATE INDEX IF NOT EXISTS "app_customer_sessions_expiresAt_idx" ON "app_customer_sessions"("expiresAt");

CREATE TABLE IF NOT EXISTS "app_services" (
    "id" TEXT NOT NULL,
    "serviceCode" TEXT NOT NULL,
    "serviceName" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "app_services_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "app_services_serviceCode_key" ON "app_services"("serviceCode");
CREATE INDEX IF NOT EXISTS "app_services_status_idx" ON "app_services"("status");

CREATE TABLE IF NOT EXISTS "app_service_events" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL DEFAULT 'SERVICE_USE',
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "app_service_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "app_service_events_customerId_createdAt_idx" ON "app_service_events"("customerId", "createdAt");
CREATE INDEX IF NOT EXISTS "app_service_events_serviceId_createdAt_idx" ON "app_service_events"("serviceId", "createdAt");
CREATE INDEX IF NOT EXISTS "app_service_events_customerId_serviceId_createdAt_idx" ON "app_service_events"("customerId", "serviceId", "createdAt");

DO $$ BEGIN
  ALTER TABLE "app_customer_sessions" ADD CONSTRAINT "app_customer_sessions_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES "app_customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "app_service_events" ADD CONSTRAINT "app_service_events_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES "app_customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "app_service_events" ADD CONSTRAINT "app_service_events_serviceId_fkey"
    FOREIGN KEY ("serviceId") REFERENCES "app_services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
