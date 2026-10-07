import { PrismaClient } from "@prisma/client";

/** Demo Postgres đã seed sẵn (user 1 / 123). Claim để giữ lâu dài. */
const DEMO_DATABASE_URL =
  "postgres://fc3e13ae4866abe68dfcee5c9633b2d8891a3475d31f275e1039b49b736c2e62:sk_WH68hkA-6qINchebn8SoI@db.prisma.io:5432/postgres?sslmode=require";

/**
 * Trên Vercel: luôn dùng DB demo nếu env thiếu / SQLite / URL hỏng.
 * Local: ưu tiên .env; nếu là file: sqlite thì cũng fallback sang demo Postgres.
 */
const raw = process.env.DATABASE_URL || "";
if (
  process.env.VERCEL ||
  !raw ||
  raw.startsWith("file:") ||
  raw.includes("localhost")
) {
  process.env.DATABASE_URL = DEMO_DATABASE_URL;
}

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    datasources: { db: { url: process.env.DATABASE_URL } },
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
