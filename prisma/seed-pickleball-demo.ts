/**
 * Demo: today 17:00–18:00 — COURTS 01/02/03 fully booked (red UI).
 * Usage: npx tsx prisma/seed-pickleball-demo.ts
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const service = await prisma.appService.findUnique({
    where: { serviceCode: "PICKLEBALL" },
  });
  if (!service) throw new Error("PICKLEBALL service missing — run seed-resources first");

  const courts = await prisma.appResource.findMany({
    where: { serviceId: service.id, type: "COURT", active: true },
    orderBy: { sortOrder: "asc" },
    take: 3,
  });
  if (courts.length < 3) throw new Error("Need at least 3 courts");

  const now = new Date();
  const start = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    17,
    0,
    0,
    0
  );
  const end = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    18,
    0,
    0,
    0
  );

  // Clear prior demo bookings for this slot
  await prisma.appBooking.deleteMany({
    where: {
      serviceId: service.id,
      startAt: start,
      endAt: end,
      notes: { contains: "DEMO_UI" },
    },
  });

  const created: { court: string; id: string }[] = [];
  for (const court of courts) {
    const b = await prisma.appBooking.create({
      data: {
        bookingCode: `DEMO-${court.code}-${Date.now().toString(36).toUpperCase()}`,
        customerNameSnapshot: `Demo ${court.name}`,
        phone: "0900000001",
        phoneNormalized: "0900000001",
        serviceId: service.id,
        resourceId: court.id,
        startAt: start,
        endAt: end,
        partySize: 4,
        status: "CONFIRMED",
        notes: "DEMO_UI 17:00-18:00 full",
        source: "ADMIN",
        createdByType: "SYSTEM",
      },
    });
    created.push({ court: court.name, id: b.id });

    // Always show red on board for this demo window (OCCUPIED + session)
    await prisma.appResourceSession.deleteMany({
      where: { resourceId: court.id, note: "DEMO_UI" },
    });
    await prisma.appResource.update({
      where: { id: court.id },
      data: { status: "OCCUPIED" },
    });
    await prisma.appResourceSession.create({
      data: {
        resourceId: court.id,
        bookingId: b.id,
        startAt: start,
        endAt: end,
        status: "OCCUPIED",
        note: "DEMO_UI",
      },
    });
  }

  console.log("[seed-pickleball-demo] ok", {
    slot: "17:00–18:00 today",
    courts: created,
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
