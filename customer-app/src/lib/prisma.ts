import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { customerPrisma?: PrismaClient };

function createClient() {
  return new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
}

/** Reuse one client across warm serverless invocations. */
export const prisma = globalForPrisma.customerPrisma ?? createClient();
globalForPrisma.customerPrisma = prisma;
