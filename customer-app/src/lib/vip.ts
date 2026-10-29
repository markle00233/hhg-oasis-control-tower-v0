import { prisma } from "@/lib/prisma";

/** VIP / membership helpers for My Oasis account + QR. */

function unexpired(expiresAt: Date | string | null | undefined, now: Date) {
  if (!expiresAt) return true;
  const exp = new Date(expiresAt);
  return !Number.isNaN(exp.getTime()) && exp.getTime() > now.getTime();
}

export function isVipActive(opts: {
  segment?: string | null;
  vipExpiresAt?: Date | string | null;
  now?: Date;
}) {
  if (String(opts.segment || "").toUpperCase() !== "VIP") return false;
  return unexpired(opts.vipExpiresAt, opts.now || new Date());
}

const VIP_PACKAGE_IDS = [
  "vip-1m-child",
  "vip-1m-adult",
  "vip-3m-child",
  "vip-3m-adult",
  "vip-6m-child",
  "vip-6m-adult",
  "vip-12m-child",
  "vip-12m-adult",
] as const;

const LIVE_ORDER = ["CONFIRMED", "ACCEPTED", "COMPLETED", "USED", "OPEN"];

function addCalendarMonths(from: Date, months: number) {
  const day = from.getDate();
  const next = new Date(from.getTime());
  next.setDate(1);
  next.setMonth(next.getMonth() + months);
  const dim = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
  next.setDate(Math.min(day, dim));
  return next;
}

/** Member package still on the account. Olympic plans are stored as VIP. */
export function isMemberSubscriptionActive(opts: {
  segment?: string | null;
  vipExpiresAt?: Date | string | null;
  now?: Date;
}) {
  if (String(opts.segment || "").toUpperCase() !== "MEMBER") return false;
  return unexpired(opts.vipExpiresAt, opts.now || new Date());
}

function vipPackageMonths(itemId: string) {
  const match = /^vip-(1|3|6|12)m-(?:child|adult)$/.exec(itemId);
  return match ? Number(match[1]) : null;
}

/** Latest Gói VIP still inside its term. Skipped when the account is already Member or VIP. */
export async function findActiveVipPackageLabel(customerId: string, now = new Date()) {
  const orders = await prisma.appOrder.findMany({
    where: {
      customerId,
      createdAt: { gte: addCalendarMonths(now, -12) },
      status: { in: [...LIVE_ORDER] },
      items: { some: { itemId: { in: [...VIP_PACKAGE_IDS] } } },
    },
    select: {
      createdAt: true,
      items: {
        where: { itemId: { in: [...VIP_PACKAGE_IDS] } },
        select: { itemId: true, nameVi: true },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 8,
  });
  return activeVipPackageLabel(orders, now);
}

function activeVipPackageLabel(
  orders: { createdAt: Date; items: { itemId: string; nameVi: string }[] }[],
  now = new Date()
) {
  let best: { exp: number; label: string } | null = null;
  for (const order of orders) {
    for (const item of order.items) {
      const months = vipPackageMonths(item.itemId);
      if (!months) continue;
      const exp = addCalendarMonths(order.createdAt, months).getTime();
      if (exp <= now.getTime()) continue;
      if (!best || exp > best.exp) {
        best = {
          exp,
          label: item.nameVi.trim() || `Gói VIP ${months} tháng`,
        };
      }
    }
  }
  return best?.label || null;
}

export function vipExpiryLabel(vipExpiresAt?: Date | string | null) {
  if (!vipExpiresAt) return null;
  const d = new Date(vipExpiresAt);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}
