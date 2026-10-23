import { prisma } from "@/lib/prisma";

const TABLE_COUNT = 30;

/** Upsert Lòng Nướng service + 30 tables so booking works without a manual seed. */
export async function ensureLongNuongService() {
  const service = await prisma.appService.upsert({
    where: { serviceCode: "LONG_NUONG" },
    create: {
      serviceCode: "LONG_NUONG",
      serviceName: "Lòng Nướng",
      slug: "long-nuong",
      qrToken: "LONG_NUONG",
      status: "ACTIVE",
      sortOrder: 10,
    },
    update: { serviceName: "Lòng Nướng", status: "ACTIVE" },
  });

  const existing = await prisma.appResource.count({
    where: { serviceId: service.id, type: "TABLE" },
  });
  if (existing === 0) {
    await prisma.appResource.createMany({
      data: Array.from({ length: TABLE_COUNT }, (_, i) => {
        const n = String(i + 1).padStart(2, "0");
        return {
          serviceId: service.id,
          type: "TABLE",
          code: `TABLE_${n}`,
          name: `Bàn ${n}`,
          capacity: 1,
          status: "AVAILABLE",
          sortOrder: i + 1,
          active: true,
        };
      }),
    });
  }

  return service;
}
