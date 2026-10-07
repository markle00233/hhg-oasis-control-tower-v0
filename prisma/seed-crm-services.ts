/**
 * Idempotent seed: crm_services (+ a few membership plans) from AppService zones.
 * Usage: npx tsx prisma/seed-crm-services.ts
 *
 * Does NOT create customers/memberships/visits — only catalog so CRM Tổng quan
 * can show Khu vực after DB wipe.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const FALLBACK_SERVICES = [
  { code: "ENTRANCE", name: "Entrance", sortOrder: 1 },
  { code: "OLYMPIC_POOL", name: "Olympic Pool", sortOrder: 2 },
  { code: "RESORT_POOL", name: "Resort Pool", sortOrder: 3 },
  { code: "VIP_RESORT", name: "VIP Resort", sortOrder: 4 },
  { code: "SAUNA", name: "Sauna", sortOrder: 5 },
  { code: "JACUZZI", name: "Jacuzzi", sortOrder: 6 },
  { code: "MIA_OI", name: "Mía Ơi", sortOrder: 7 },
  { code: "PICKLEBALL", name: "Pickleball", sortOrder: 8 },
  { code: "EXIT", name: "Exit", sortOrder: 9 },
] as const;

const PLANS: Array<{
  planCode: string;
  name: string;
  durationDays: number;
  description: string;
  serviceCodes: string[];
}> = [
  {
    planCode: "DAY_PASS",
    name: "Day Pass",
    durationDays: 1,
    description: "Vé ngày — hồ + sauna cơ bản",
    serviceCodes: ["ENTRANCE", "OLYMPIC_POOL", "RESORT_POOL", "SAUNA", "EXIT"],
  },
  {
    planCode: "MONTH_BASIC",
    name: "Membership tháng",
    durationDays: 30,
    description: "Gói tháng — đầy đủ khu vực (trừ VIP)",
    serviceCodes: [
      "ENTRANCE",
      "OLYMPIC_POOL",
      "RESORT_POOL",
      "SAUNA",
      "JACUZZI",
      "MIA_OI",
      "PICKLEBALL",
      "EXIT",
    ],
  },
  {
    planCode: "VIP_MONTH",
    name: "VIP tháng",
    durationDays: 30,
    description: "Gói VIP — gồm VIP Resort",
    serviceCodes: [
      "ENTRANCE",
      "OLYMPIC_POOL",
      "RESORT_POOL",
      "VIP_RESORT",
      "SAUNA",
      "JACUZZI",
      "MIA_OI",
      "PICKLEBALL",
      "EXIT",
    ],
  },
];

async function main() {
  const appServices = await prisma.appService.findMany({
    where: { status: "ACTIVE" },
    orderBy: { sortOrder: "asc" },
  });

  const services =
    appServices.length > 0
      ? appServices.map((s) => ({
          code: s.serviceCode,
          name: s.serviceName,
          sortOrder: s.sortOrder,
        }))
      : [...FALLBACK_SERVICES];

  for (const s of services) {
    await prisma.crmService.upsert({
      where: { code: s.code },
      create: {
        code: s.code,
        name: s.name,
        status: "ACTIVE",
        sortOrder: s.sortOrder,
      },
      update: {
        name: s.name,
        status: "ACTIVE",
        sortOrder: s.sortOrder,
      },
    });
  }

  const byCode = Object.fromEntries(
    (await prisma.crmService.findMany()).map((s) => [s.code, s.id])
  );

  for (const plan of PLANS) {
    const row = await prisma.crmMembershipPlan.upsert({
      where: { planCode: plan.planCode },
      create: {
        planCode: plan.planCode,
        name: plan.name,
        durationDays: plan.durationDays,
        description: plan.description,
        status: "ACTIVE",
      },
      update: {
        name: plan.name,
        durationDays: plan.durationDays,
        description: plan.description,
        status: "ACTIVE",
      },
    });

    for (const code of plan.serviceCodes) {
      const serviceId = byCode[code];
      if (!serviceId) continue;
      await prisma.crmMembershipPlanService.upsert({
        where: {
          planId_serviceId: { planId: row.id, serviceId },
        },
        create: { planId: row.id, serviceId },
        update: {},
      });
    }
  }

  const counts = {
    services: await prisma.crmService.count(),
    plans: await prisma.crmMembershipPlan.count(),
    links: await prisma.crmMembershipPlanService.count(),
  };
  console.log("[seed-crm-services] ok", counts);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
