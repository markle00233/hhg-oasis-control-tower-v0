import { CART_STATUS, isPastVnCutOff } from "@/lib/cart-status";
import {
  isOlympicPackageId,
  OLYMPIC_PACKAGE_IDS,
  vipStartedAtFromExpiry,
} from "@/lib/olympic-membership";
import { prisma } from "@/lib/prisma";
import { formatVnDateTime } from "@/lib/revise-booking";

const runningZones = new Set<string>();

/**
 * No-show, Lòng Nướng cart repair, and VIP start dates.
 * Kept off the desk poll so a screen refresh only reads.
 * One run per zone, so two counters do not block each other.
 */
export async function runDeskMaintenance(opts: {
  zone: string;
  aliases: string[];
  since: Date;
  cartSince: Date;
}) {
  if (runningZones.has(opts.zone)) return;
  runningZones.add(opts.zone);
  try {
    await markExpiredCartsNoShow(opts);
    if (opts.zone === "LONG_NUONG") {
      await backfillLongNuongCarts(opts.since);
    }
    await backfillMissingVipStarts(opts);
  } finally {
    runningZones.delete(opts.zone);
  }
}

async function markExpiredCartsNoShow(opts: {
  zone: string;
  aliases: string[];
  since: Date;
  cartSince: Date;
}) {
  const now = new Date();
  const poolLike =
    opts.zone === "OLYMPIC_POOL" ||
    opts.zone === "RESORT_POOL" ||
    opts.aliases.includes("OLYMPIC_POOL");
  const pastCutOff = poolLike && isPastVnCutOff(now);
  await prisma.appServiceCart.updateMany({
    where: {
      zoneCode: { in: opts.aliases },
      status: { in: [CART_STATUS.PENDING, CART_STATUS.OPEN] },
      createdAt: { gte: pastCutOff ? opts.since : opts.cartSince },
      ...(pastCutOff ? {} : { expiresAt: { lt: now } }),
    },
    data: { status: CART_STATUS.NO_SHOW },
  });
}

async function backfillLongNuongCarts(since: Date) {
  const { createServiceCart } = await import("@/lib/service-cart");
  const orphanBookings = await prisma.appBooking.findMany({
    where: {
      createdAt: { gte: since },
      status: {
        in: ["PENDING", "CONFIRMED", "ARRIVED", "CHECKED_IN"],
      },
      customerId: { not: null },
      service: { serviceCode: "LONG_NUONG" },
    },
    take: 40,
    orderBy: { createdAt: "desc" },
    include: {
      resource: { select: { id: true, code: true, name: true } },
      customer: { select: { id: true } },
    },
  });
  const pending = orphanBookings.filter((b) => b.customerId && b.resource);
  const carts = pending.length
    ? await prisma.appServiceCart.findMany({
        where: {
          customerId: {
            in: [...new Set(pending.map((b) => b.customerId as string))],
          },
          zoneCode: "LONG_NUONG",
          createdAt: { gte: since },
        },
        select: { customerId: true, items: true },
      })
    : [];
  const notesByCustomer = new Map<string, string>();
  for (const cart of carts) {
    const items = Array.isArray(cart.items) ? cart.items : [];
    const notes = items
      .map((it) =>
        it && typeof it === "object"
          ? String((it as { note?: string }).note || "")
          : ""
      )
      .join("\n");
    notesByCustomer.set(
      cart.customerId,
      `${notesByCustomer.get(cart.customerId) || ""}\n${notes}`
    );
  }
  await Promise.all(
    pending.map(async (b) => {
      const tag = `bookingId:${b.id}`;
      if ((notesByCustomer.get(b.customerId as string) || "").includes(tag)) {
        return;
      }
      const arriveLabel = formatVnDateTime(b.startAt);
      await createServiceCart({
        customerId: b.customerId as string,
        zoneCode: "LONG_NUONG",
        zoneName: "Lòng Nướng Chí Phèo",
        items: [
          {
            id: `table-${b.resource!.code}`,
            nameVi: `${b.resource!.name} · ${arriveLabel}`,
            qty: 1,
            priceVnd: 0,
            note: `resourceId:${b.resource!.id}|bookingId:${b.id}|code:${b.bookingCode}`,
          },
        ],
        ttlHours: 48,
      });
    })
  );
}

async function backfillMissingVipStarts(opts: {
  aliases: string[];
  since: Date;
  cartSince: Date;
}) {
  const customers = await prisma.appCustomer.findMany({
    where: {
      vipStartedAt: null,
      segment: "VIP",
      OR: [
        {
          serviceCarts: {
            some: {
              createdAt: { gte: opts.cartSince },
              zoneCode: { in: opts.aliases },
            },
          },
        },
        {
          events: {
            some: {
              createdAt: { gte: opts.since },
              service: { serviceCode: { in: opts.aliases } },
            },
          },
        },
      ],
    },
    select: {
      id: true,
      vipExpiresAt: true,
      vipPlanLabel: true,
    },
    take: 40,
  });
  if (!customers.length) return;

  const packageStart = new Map<string, Date>();
  const orders = await prisma.appOrder.findMany({
    where: {
      customerId: { in: customers.map((c) => c.id) },
      status: { not: "CANCELLED" },
      items: { some: { itemId: { in: [...OLYMPIC_PACKAGE_IDS] } } },
    },
    select: { customerId: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
  for (const order of orders) {
    if (!packageStart.has(order.customerId)) {
      packageStart.set(order.customerId, order.createdAt);
    }
  }
  const missingAfterOrders = customers
    .map((c) => c.id)
    .filter((id) => !packageStart.has(id));
  if (missingAfterOrders.length) {
    const carts = await prisma.appServiceCart.findMany({
      where: {
        customerId: { in: missingAfterOrders },
        status: { notIn: ["CANCELLED", "REJECTED"] },
      },
      select: { customerId: true, createdAt: true, items: true },
      orderBy: { createdAt: "desc" },
    });
    for (const cart of carts) {
      if (packageStart.has(cart.customerId)) continue;
      const items = Array.isArray(cart.items) ? cart.items : [];
      const bought = items.some((row) => {
        if (!row || typeof row !== "object") return false;
        return isOlympicPackageId(String((row as { id?: string }).id || ""));
      });
      if (bought) packageStart.set(cart.customerId, cart.createdAt);
    }
  }
  const missingAfterCarts = customers
    .map((c) => c.id)
    .filter((id) => !packageStart.has(id));
  if (missingAfterCarts.length) {
    const offers = await prisma.appCollectedOffer.findMany({
      where: {
        customerId: { in: missingAfterCarts },
        offerId: { startsWith: "hhg-oly-" },
      },
      select: { customerId: true, collectedAt: true },
      orderBy: { collectedAt: "desc" },
    });
    for (const offer of offers) {
      if (!packageStart.has(offer.customerId)) {
        packageStart.set(offer.customerId, offer.collectedAt);
      }
    }
  }
  await Promise.all(
    customers.map(async (c) => {
      const start =
        packageStart.get(c.id) ||
        (c.vipExpiresAt
          ? vipStartedAtFromExpiry(c.vipExpiresAt, c.vipPlanLabel)
          : null);
      if (!start) return;
      await prisma.appCustomer
        .updateMany({
          where: { id: c.id, vipStartedAt: null },
          data: { vipStartedAt: start },
        })
        .catch((err) => {
          console.error("[desk] vip start backfill", err);
        });
    })
  );
}
