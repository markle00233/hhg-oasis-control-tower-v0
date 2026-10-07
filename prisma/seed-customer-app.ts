/**
 * Seed Customer App services + demo account CUS-DEMO01 / Demo123!
 * Usage: npx tsx prisma/seed-customer-app.ts
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const SERVICES = [
  { serviceCode: "ENTRANCE", serviceName: "Entrance", sortOrder: 1 },
  { serviceCode: "OLYMPIC_POOL", serviceName: "Olympic Pool", sortOrder: 2 },
  { serviceCode: "RESORT_POOL", serviceName: "Resort Pool", sortOrder: 3 },
  { serviceCode: "VIP_RESORT", serviceName: "VIP Resort", sortOrder: 4 },
  { serviceCode: "SAUNA", serviceName: "Sauna", sortOrder: 5 },
  { serviceCode: "JACUZZI", serviceName: "Jacuzzi", sortOrder: 6 },
  { serviceCode: "MIA_OI", serviceName: "Mía Ơi", sortOrder: 7 },
  { serviceCode: "PICKLEBALL", serviceName: "Pickleball", sortOrder: 8 },
  { serviceCode: "EXIT", serviceName: "Exit", sortOrder: 9 },
] as const;

async function main() {
  for (const s of SERVICES) {
    await prisma.appService.upsert({
      where: { serviceCode: s.serviceCode },
      create: { ...s, status: "ACTIVE" },
      update: { serviceName: s.serviceName, sortOrder: s.sortOrder, status: "ACTIVE" },
    });
  }

  const passwordHash = await bcrypt.hash("Demo123!", 12);
  const demo = await prisma.appCustomer.upsert({
    where: { customerCode: "CUS-DEMO01" },
    create: {
      customerCode: "CUS-DEMO01",
      username: "CUS-DEMO01",
      passwordHash,
      status: "ACTIVE",
    },
    update: {
      passwordHash,
      status: "ACTIVE",
    },
  });

  const existing = await prisma.appServiceEvent.count({
    where: { customerId: demo.id },
  });

  if (existing === 0) {
    const byCode = Object.fromEntries(
      (
        await prisma.appService.findMany({
          where: { serviceCode: { in: ["OLYMPIC_POOL", "MIA_OI", "VIP_RESORT", "SAUNA"] } },
        })
      ).map((s) => [s.serviceCode, s.id])
    );

    const hoursAgo = (h: number) => new Date(Date.now() - h * 3600_000);
    const seeds: Array<{ code: string; at: Date }> = [
      { code: "OLYMPIC_POOL", at: hoursAgo(2) },
      { code: "OLYMPIC_POOL", at: hoursAgo(26) },
      { code: "OLYMPIC_POOL", at: hoursAgo(50) },
      { code: "OLYMPIC_POOL", at: hoursAgo(74) },
      { code: "MIA_OI", at: hoursAgo(3) },
      { code: "MIA_OI", at: hoursAgo(30) },
      { code: "VIP_RESORT", at: hoursAgo(5) },
      { code: "SAUNA", at: hoursAgo(28) },
    ];

    for (const row of seeds) {
      const serviceId = byCode[row.code];
      if (!serviceId) continue;
      await prisma.appServiceEvent.create({
        data: {
          customerId: demo.id,
          serviceId,
          eventType: "SERVICE_USE",
          createdAt: row.at,
        },
      });
    }
  }

  console.log("[seed-customer-app] services upserted:", SERVICES.length);
  console.log("[seed-customer-app] demo account: CUS-DEMO01 / Demo123!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
