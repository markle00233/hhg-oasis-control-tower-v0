import { prisma } from "./prisma";
import {
  qtyForOlympicVoucher,
  vouchersForOlympicPackage,
} from "./hhg-vouchers";

const PACKAGE_IDS = ["oly-12m", "oly-6m", "oly-3m", "oly-1m"] as const;
const LOOKBACK_MS = 30 * 24 * 60 * 60 * 1000;
/** Home polls /api/auth/me about every 12s. Skip repeat scans after a miss. */
const MISS_MS = 60_000;
const missUntil = new Map<string, number>();

const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

function monthsForPackage(packageId: string) {
  switch (packageId) {
    case "oly-1m":
      return 1;
    case "oly-3m":
      return 3;
    case "oly-6m":
      return 7;
    case "oly-12m":
      return 14;
    default:
      return 0;
  }
}

function labelForPackage(packageId: string) {
  switch (packageId) {
    case "oly-1m":
      return "Gói Olympic 1 tháng";
    case "oly-3m":
      return "Gói Olympic 3 tháng";
    case "oly-6m":
      return "Gói Olympic 6 tháng (tặng 1 tháng)";
    case "oly-12m":
      return "Gói Olympic 12 tháng (tặng 2 tháng)";
    default:
      return "Gói Olympic";
  }
}

function addMonthsVn(date: Date, months: number) {
  const vn = new Date(date.getTime() + VN_OFFSET_MS);
  const day = vn.getUTCDate();
  const hours = vn.getUTCHours();
  const minutes = vn.getUTCMinutes();
  const seconds = vn.getUTCSeconds();
  const ms = vn.getUTCMilliseconds();
  const shifted = new Date(
    Date.UTC(vn.getUTCFullYear(), vn.getUTCMonth() + months, 1)
  );
  const dim = new Date(
    Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, 0)
  ).getUTCDate();
  shifted.setUTCDate(Math.min(day, dim));
  shifted.setUTCHours(hours, minutes, seconds, ms);
  return new Date(shifted.getTime() - VN_OFFSET_MS);
}

function packageIdFromItems(items: unknown) {
  const ids = Array.isArray(items)
    ? items.map((row) =>
        row && typeof row === "object"
          ? String((row as { id?: string; itemId?: string }).id ||
              (row as { itemId?: string }).itemId ||
              "")
          : ""
      )
    : [];
  return PACKAGE_IDS.find((id) => ids.includes(id)) || null;
}

/**
 * Desk duyệt / lưu đơn used to leave the account as a normal customer.
 * If a paid gói is already on a cart or order, attach it on the next app read.
 */
export async function syncPaidOlympicMembership(customerId: string) {
  const now = Date.now();
  const cachedMiss = missUntil.get(customerId);
  if (cachedMiss && cachedMiss > now) return null;

  const since = new Date(now - LOOKBACK_MS);
  const [carts, order] = await Promise.all([
    prisma.appServiceCart.findMany({
      where: {
        customerId,
        status: { in: ["OPEN", "USED"] },
        createdAt: { gte: since },
      },
      orderBy: { createdAt: "desc" },
      take: 6,
      select: { items: true, createdAt: true },
    }),
    prisma.appOrder.findFirst({
      where: {
        customerId,
        status: { in: ["CONFIRMED", "ACCEPTED", "DONE"] },
        createdAt: { gte: since },
        items: { some: { itemId: { in: [...PACKAGE_IDS] } } },
      },
      orderBy: { createdAt: "desc" },
      select: {
        createdAt: true,
        items: {
          where: { itemId: { in: [...PACKAGE_IDS] } },
          select: { itemId: true },
        },
      },
    }),
  ]);

  let best: { packageId: string; at: Date } | null = null;
  for (const cart of carts) {
    const packageId = packageIdFromItems(cart.items);
    if (!packageId) continue;
    best = { packageId, at: cart.createdAt };
    break;
  }
  const orderPackageId = order
    ? PACKAGE_IDS.find((id) => order.items.some((item) => item.itemId === id))
    : null;
  if (
    order &&
    orderPackageId &&
    (!best || order.createdAt > best.at)
  ) {
    best = { packageId: orderPackageId, at: order.createdAt };
  }
  if (!best) {
    if (missUntil.size > 500) missUntil.clear();
    missUntil.set(customerId, now + MISS_MS);
    return null;
  }
  const picked = best;
  missUntil.delete(customerId);

  const vipPlanLabel = labelForPackage(picked.packageId);
  const vipExpiresAt = addMonthsVn(picked.at, monthsForPackage(picked.packageId));
  if (vipExpiresAt.getTime() <= Date.now()) {
    missUntil.set(customerId, now + MISS_MS);
    return null;
  }

  await prisma.appCustomer.update({
    where: { id: customerId },
    data: {
      segment: "VIP",
      vipPlanLabel,
      vipExpiresAt,
      vipStartedAt: picked.at,
    },
  });

  await Promise.all(
    vouchersForOlympicPackage(picked.packageId).map((voucher) => {
      const granted = qtyForOlympicVoucher(picked.packageId, voucher.id);
      const qtyData =
        granted == null
          ? { qtyTotal: null, qtyRemaining: null }
          : { qtyTotal: granted, qtyRemaining: granted };
      return prisma.appCollectedOffer.upsert({
        where: { customerId_offerId: { customerId, offerId: voucher.id } },
        create: {
          customerId,
          offerId: voucher.id,
          status: "COLLECTED",
          ...qtyData,
        },
        update: {
          status: "COLLECTED",
          collectedAt: new Date(),
          usedAt: null,
          ...qtyData,
        },
      });
    })
  );

  return { segment: "VIP" as const, vipPlanLabel, vipExpiresAt, vipStartedAt: picked.at };
}
