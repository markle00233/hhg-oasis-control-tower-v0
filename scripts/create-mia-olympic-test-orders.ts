/**
 * One confirmed test order for each Mía Ơi · Olympic flow:
 * drinks (MIA_OI) and a pool ticket (OLYMPIC_POOL).
 * Safe to re-run: skips when that test order already exists today.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const TESTS = [
  {
    username: "test-mia-oi",
    customerCode: "TEST-MIAOI",
    fullName: "Test Mía Ơi",
    phone: "0901111001",
    serviceCode: "MIA_OI",
    eventType: "MIA_OI_ORDER",
    deskOrderZone: "MIA_OI",
    note: "Đơn test · Mía Ơi",
    items: [
      {
        itemId: "mia-la-dua",
        nameVi: "Mía Lá Dứa",
        nameEn: "Sugarcane, Fresh Pandan",
        unitPriceVnd: 50_000,
        qty: 2,
      },
    ],
  },
  {
    username: "test-olympic",
    customerCode: "TEST-OLYMPIC",
    fullName: "Test Olympic",
    phone: "0901111002",
    serviceCode: "OLYMPIC_POOL",
    eventType: "POOL_ORDER",
    deskOrderZone: "OLYMPIC_POOL",
    note: "Đơn test · Olympic",
    items: [
      {
        itemId: "pool-o13-90",
        nameVi: "Vé bơi 90 phút — từ 1,3m",
        nameEn: "90 min swim · 1.3m+",
        unitPriceVnd: 60_000,
        qty: 1,
      },
    ],
  },
] as const;

function vnDayStart() {
  const ymd = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  return new Date(`${ymd}T00:00:00+07:00`);
}

async function main() {
  const dayStart = vnDayStart();
  const created: { flow: string; customer: string; orderId: string; totalVnd: number }[] = [];

  for (const spec of TESTS) {
    const service = await prisma.appService.findUnique({
      where: { serviceCode: spec.serviceCode },
      select: { id: true, serviceCode: true, serviceName: true },
    });
    if (!service) {
      throw new Error(`Thiếu dịch vụ ${spec.serviceCode} trong app_services.`);
    }

    const customer = await prisma.appCustomer.upsert({
      where: { username: spec.username },
      update: { fullName: spec.fullName, status: "ACTIVE" },
      create: {
        username: spec.username,
        customerCode: spec.customerCode,
        passwordHash: "test-not-a-login",
        fullName: spec.fullName,
        phone: spec.phone,
        phoneNormalized: spec.phone,
        phoneLast4: spec.phone.slice(-4),
        shortId: spec.phone.slice(-4),
        segment: "WALK_IN",
        status: "ACTIVE",
      },
    });

    const already = await prisma.appOrder.findFirst({
      where: {
        customerId: customer.id,
        serviceId: service.id,
        note: spec.note,
        createdAt: { gte: dayStart },
        NOT: { status: "CANCELLED" },
      },
      select: { id: true, totalVnd: true },
    });
    if (already) {
      created.push({
        flow: spec.serviceCode,
        customer: spec.fullName,
        orderId: already.id,
        totalVnd: already.totalVnd,
      });
      continue;
    }

    const totalVnd = spec.items.reduce(
      (sum, item) => sum + item.unitPriceVnd * item.qty,
      0
    );
    const metaItems = spec.items.map((item) => ({
      name: item.nameVi,
      qty: item.qty,
      unitPriceVnd: item.unitPriceVnd,
      itemId: item.itemId,
      pointsDiscountVnd: 0,
      pointsRedeemTier: null,
    }));

    const order = await prisma.$transaction(async (tx) => {
      const row = await tx.appOrder.create({
        data: {
          customerId: customer.id,
          serviceId: service.id,
          status: "CONFIRMED",
          source: "ZONE_DESK",
          createdByType: "STAFF",
          totalVnd,
          note: spec.note,
          items: {
            create: spec.items.map((item) => ({
              itemId: item.itemId,
              nameVi: item.nameVi,
              nameEn: item.nameEn,
              unitPriceVnd: item.unitPriceVnd,
              qty: item.qty,
            })),
          },
        },
      });

      const metadata = {
        source: "test_order",
        ticketVerified: true,
        placedBy: "desk",
        deskOrderZone: spec.deskOrderZone,
        staffName: "Test desk",
        orderId: row.id,
        totalVnd,
        items: metaItems,
      };

      await tx.appServiceEvent.create({
        data: {
          customerId: customer.id,
          serviceId: service.id,
          eventType: "SERVICE_USE",
          operationalStatus: "ACKNOWLEDGED",
          metadata,
        },
      });
      await tx.appServiceEvent.create({
        data: {
          customerId: customer.id,
          serviceId: service.id,
          eventType: spec.eventType,
          operationalStatus: "ACKNOWLEDGED",
          metadata,
        },
      });
      return row;
    });

    created.push({
      flow: spec.serviceCode,
      customer: spec.fullName,
      orderId: order.id,
      totalVnd,
    });
  }

  console.log(JSON.stringify(created, null, 2));
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
