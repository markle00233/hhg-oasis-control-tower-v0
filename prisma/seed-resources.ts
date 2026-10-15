/**
 * Seed zone resources: Pickleball 6 courts, Spa 6 beds, Lòng Nướng 30 tables, VIP area.
 * Also ensures LONG_NUONG AppService exists.
 *
 * Usage: npx tsx prisma/seed-resources.ts
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function ensureService(code: string, name: string, sortOrder: number) {
  return prisma.appService.upsert({
    where: { serviceCode: code },
    create: {
      serviceCode: code,
      serviceName: name,
      slug: code.toLowerCase().replace(/_/g, "-"),
      qrToken: code,
      status: "ACTIVE",
      sortOrder,
    },
    update: { serviceName: name, status: "ACTIVE" },
  });
}

async function upsertResources(
  serviceId: string,
  type: string,
  rows: { code: string; name: string; capacity?: number }[]
) {
  let n = 0;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    await prisma.appResource.upsert({
      where: { serviceId_code: { serviceId, code: r.code } },
      create: {
        serviceId,
        type,
        code: r.code,
        name: r.name,
        capacity: r.capacity ?? 1,
        status: "AVAILABLE",
        sortOrder: i + 1,
        active: true,
      },
      update: {
        name: r.name,
        type,
        capacity: r.capacity ?? 1,
        sortOrder: i + 1,
        active: true,
      },
    });
    n++;
  }
  return n;
}

async function main() {
  const pickle = await ensureService("PICKLEBALL", "Pickleball", 8);
  const spa = await ensureService("SAUNA", "Sauna", 5);
  const vip = await ensureService("VIP_RESORT", "VIP Resort", 4);
  const long = await ensureService("LONG_NUONG", "Lòng Nướng", 10);

  const courts = Array.from({ length: 6 }, (_, i) => {
    const n = String(i + 1).padStart(2, "0");
    return { code: `COURT_${n}`, name: `Sân ${n}` };
  });
  const beds = Array.from({ length: 6 }, (_, i) => {
    const n = String(i + 1).padStart(2, "0");
    return { code: `BED_${n}`, name: `Giường ${n}` };
  });
  const tables = Array.from({ length: 30 }, (_, i) => {
    const n = String(i + 1).padStart(2, "0");
    return { code: `TABLE_${n}`, name: `Bàn ${n}` };
  });

  const a = await upsertResources(pickle.id, "COURT", courts);
  const b = await upsertResources(spa.id, "SPA_BED", beds);
  const c = await upsertResources(long.id, "TABLE", tables);
  const d = await upsertResources(vip.id, "VIP_AREA", [
    { code: "VIP_MAIN", name: "VIP Resort", capacity: 50 },
  ]);

  console.log("[seed-resources] ok", {
    pickleballCourts: a,
    spaBeds: b,
    longNuongTables: c,
    vipAreas: d,
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
