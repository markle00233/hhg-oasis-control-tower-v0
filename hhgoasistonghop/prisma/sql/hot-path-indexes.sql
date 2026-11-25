-- Optional. Run once on the employee database after `prisma db push`.
-- Name search still uses contains; this index lets Postgres answer that without a full scan.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS customers_fullname_trgm
  ON "Customer" USING gin ("fullName" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS customers_phone_trgm
  ON "Customer" USING gin ("phoneNormalized" gin_trgm_ops);
