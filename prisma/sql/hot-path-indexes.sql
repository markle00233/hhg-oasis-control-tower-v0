-- Optional, after the Prisma indexes in schema.prisma are applied.
-- Speeds up partial name search (ILIKE '%...%'). Phone lookup uses startsWith and does not need this.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS app_customers_fullname_trgm
  ON app_customers USING gin ("fullName" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS crm_customers_fullname_trgm
  ON crm_customers USING gin ("fullName" gin_trgm_ops);
