import type { PrismaClient } from "@prisma/client";
import {
  packageIdFromVipPlanLabel,
  qtyForOlympicVoucher,
} from "@/lib/hhg-vouchers";

/**
 * Hạn gói trên lịch VN.
 * 6 tháng được cộng thêm 1 tháng bơi (7). 12 tháng được cộng thêm 2 tháng (14).
 */
export function monthsForOlympicPackage(packageId: string): number {
  switch (packageId) {
    case "oly-1m":
      return 1;
    case "oly-3m":
      return 3;
    case "oly-6m":
      return 6 + 1;
    case "oly-12m":
      return 12 + 2;
    default:
      return 0;
  }
}

const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

/** Add calendar months on the Vietnam wall clock. Same result on UTC hosts and local. */
function addMonthsVn(date: Date, months: number): Date {
  const vn = new Date(date.getTime() + VN_OFFSET_MS);
  const day = vn.getUTCDate();
  const hours = vn.getUTCHours();
  const minutes = vn.getUTCMinutes();
  const seconds = vn.getUTCSeconds();
  const ms = vn.getUTCMilliseconds();
  const shifted = new Date(Date.UTC(vn.getUTCFullYear(), vn.getUTCMonth() + months, 1));
  const dim = new Date(
    Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, 0)
  ).getUTCDate();
  shifted.setUTCDate(Math.min(day, dim));
  shifted.setUTCHours(hours, minutes, seconds, ms);
  return new Date(shifted.getTime() - VN_OFFSET_MS);
}

function bonusMonthsForPackage(packageId: string) {
  if (packageId === "oly-6m") return 1;
  if (packageId === "oly-12m") return 2;
  return 0;
}

/**
 * Membership start implied by an expiry saved before vipStartedAt existed.
 * A label without "tặng" is the paid term only, so the gift month is not
 * subtracted away before it can be added back.
 */
export function vipStartedAtFromExpiry(
  expiresAt: Date,
  planLabel: string | null | undefined
): Date | null {
  const packageId = packageIdFromVipPlanLabel(planLabel) || "";
  const full = monthsForOlympicPackage(packageId);
  if (full <= 0) return null;
  const bonus = bonusMonthsForPackage(packageId);
  const includesGift = bonus > 0 && /tặng/i.test(String(planLabel || ""));
  const span = includesGift ? full : full - bonus;
  if (span <= 0) return null;
  return addMonthsVn(expiresAt, -span);
}

export function labelForOlympicPackage(packageId: string): string {
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

/** Voucher HHG kèm gói tháng (đồng bộ seed-vip-from-crm).
 * Mía Ơi −5%/−10% không còn là voucher — giảm tự động trong hạn gói. */
export function vouchersForOlympicPackage(packageId: string): string[] {
  const map: Record<string, string[]> = {
    "oly-1m": ["hhg-oly-spa-goi"],
    "oly-3m": ["hhg-oly-spa-massage", "hhg-oly-ln-100k"],
    "oly-6m": ["hhg-oly-spa-massage", "hhg-oly-ln-100k"],
    "oly-12m": ["hhg-oly-spa-massage", "hhg-oly-ln-100k"],
  };
  return map[packageId] || [];
}

/**
 * Giảm Mía Ơi theo gói (trong suốt hạn VIP, không phải voucher rời).
 * 1 & 3 tháng → 5% · 6 & 12 tháng → 10%.
 */
export function miaOiDiscountPercentForPackage(
  packageId: string | null | undefined
): number {
  switch (String(packageId || "").trim()) {
    case "oly-1m":
    case "oly-3m":
      return 5;
    case "oly-6m":
    case "oly-12m":
      return 10;
    default:
      return 0;
  }
}

export function miaOiDiscountPercentForPlanLabel(
  label: string | null | undefined
): number {
  return miaOiDiscountPercentForPackage(packageIdFromVipPlanLabel(label));
}

export function miaOiMembershipDiscountVnd(
  baseVnd: number,
  percent: number
): number {
  const base = Math.max(0, Math.round(Number(baseVnd) || 0));
  const p = Math.min(100, Math.max(0, Math.round(Number(percent) || 0)));
  if (base <= 0 || p <= 0) return 0;
  return Math.round((base * p) / 100);
}

/** Cart line id prefix for the auto membership Mía discount. */
export const MIA_MEMBERSHIP_DISC_PREFIX = "disc-mia-membership";

export function cartHasMiaMembershipDiscount(items: unknown): boolean {
  if (!Array.isArray(items)) return false;
  return items.some((row) => {
    if (!row || typeof row !== "object") return false;
    return String((row as { id?: string }).id || "").startsWith(
      MIA_MEMBERSHIP_DISC_PREFIX
    );
  });
}

/** One-shot quote for VIP Mía Ơi % on a payable base. */
export function quoteMiaOiVipDiscount(opts: {
  segment?: string | null;
  vipExpiresAt?: Date | string | null;
  vipPlanLabel?: string | null;
  baseVnd: number;
  /** e.g. "gọi thêm" */
  noteSuffix?: string;
}): { percent: number; discountVnd: number; note: string } {
  if (
    !isOlympicMembershipActive({
      segment: opts.segment,
      vipExpiresAt: opts.vipExpiresAt,
    })
  ) {
    return { percent: 0, discountVnd: 0, note: "" };
  }
  const percent = miaOiDiscountPercentForPlanLabel(opts.vipPlanLabel);
  const discountVnd = miaOiMembershipDiscountVnd(opts.baseVnd, percent);
  if (discountVnd <= 0) {
    return { percent, discountVnd: 0, note: "" };
  }
  const suffix = opts.noteSuffix ? ` ${opts.noteSuffix}` : "";
  return {
    percent,
    discountVnd,
    note: `Hội viên −${percent}%${suffix} (−${discountVnd.toLocaleString("vi-VN")}đ)`,
  };
}

export function pickPrimaryOlympicPackage(
  itemIds: string[]
): string | null {
  const order = ["oly-12m", "oly-6m", "oly-3m", "oly-1m"];
  for (const id of order) {
    if (itemIds.includes(id)) return id;
  }
  return null;
}

/** Đang còn hạn gói hội viên (không cho upgrade / downgrade / mua thêm). */
export function isOlympicMembershipActive(opts: {
  segment?: string | null;
  vipExpiresAt?: Date | string | null;
  now?: Date;
}) {
  const now = opts.now || new Date();
  if (String(opts.segment || "").toUpperCase() !== "VIP") return false;
  if (!opts.vipExpiresAt) return true;
  const exp = new Date(opts.vipExpiresAt);
  return !Number.isNaN(exp.getTime()) && exp.getTime() > now.getTime();
}

export function cartItemsIncludeMembership(items: unknown): boolean {
  if (!Array.isArray(items)) return false;
  return items.some((row) => {
    if (!row || typeof row !== "object") return false;
    const id = String((row as { id?: string }).id || "").toLowerCase();
    const name = String(
      (row as { nameVi?: string; name?: string }).nameVi ||
        (row as { name?: string }).name ||
        ""
    ).toLowerCase();
    return /^oly-\d+m$/.test(id) || name.includes("nâng cấp");
  });
}

/**
 * Gắn gói Olympic lên account (VIP / hạn).
 * Mỗi tài khoản chỉ 1 gói tại một thời điểm — còn hạn thì từ chối (không cộng tháng / đổi gói).
 * Voucher hội viên → seed COLLECTED, dùng theo thời hạn gói.
 */
export const OLYMPIC_PACKAGE_IDS = ["oly-1m", "oly-3m", "oly-6m", "oly-12m"] as const;

export function isOlympicPackageId(id: string) {
  return (OLYMPIC_PACKAGE_IDS as readonly string[]).includes(id);
}

/**
 * Account is VIP now, but an order placed before this package started
 * still shows as Khách lẻ.
 */
export function segmentAtTime(opts: {
  segment?: string | null;
  segmentLabel?: string | null;
  vipStartedAt?: Date | string | null;
  at?: Date | string | null;
}): { segment: string; segmentLabel: string } {
  const segment = String(opts.segment || "WALK_IN").toUpperCase();
  const label =
    opts.segmentLabel ||
    (segment === "VIP" ? "VIP" : segment === "MEMBER" ? "Member" : "Khách lẻ");
  if (segment !== "VIP") return { segment, segmentLabel: label };
  if (!opts.vipStartedAt || !opts.at) {
    return { segment: "VIP", segmentLabel: "VIP" };
  }
  const start = new Date(opts.vipStartedAt).getTime();
  const when = new Date(opts.at).getTime();
  if (Number.isNaN(start) || Number.isNaN(when) || when >= start) {
    return { segment: "VIP", segmentLabel: "VIP" };
  }
  return { segment: "WALK_IN", segmentLabel: "Khách lẻ" };
}

export async function applyOlympicMembership(
  prisma: PrismaClient,
  opts: {
    customerId: string;
    packageId: string;
    from?: Date;
  }
): Promise<{
  vipPlanLabel: string;
  vipExpiresAt: Date;
  offerIds: string[];
  alreadyActive?: boolean;
} | null> {
  const months = monthsForOlympicPackage(opts.packageId);
  if (months <= 0) return null;

  const from = opts.from || new Date();
  const vipPlanLabel = labelForOlympicPackage(opts.packageId);
  const customer = await prisma.appCustomer.findUnique({
    where: { id: opts.customerId },
    select: { vipExpiresAt: true, vipPlanLabel: true, segment: true },
  });
  if (!customer) return null;

  if (
    isOlympicMembershipActive({
      segment: customer.segment,
      vipExpiresAt: customer.vipExpiresAt,
      now: from,
    })
  ) {
    return {
      alreadyActive: true,
      vipPlanLabel: customer.vipPlanLabel || vipPlanLabel,
      vipExpiresAt: customer.vipExpiresAt || from,
      offerIds: [],
    };
  }

  const vipExpiresAt = addMonthsVn(from, months);

  await prisma.appCustomer.update({
    where: { id: opts.customerId },
    data: {
      segment: "VIP",
      vipPlanLabel,
      vipExpiresAt,
      vipStartedAt: from,
    },
  });

  const { qtyForOlympicVoucher } = await import("@/lib/hhg-vouchers");
  const offerIds = vouchersForOlympicPackage(opts.packageId);
  for (const offerId of offerIds) {
    const granted = qtyForOlympicVoucher(opts.packageId, offerId);
    const qtyData =
      granted == null
        ? { qtyTotal: null as number | null, qtyRemaining: null as number | null }
        : { qtyTotal: granted, qtyRemaining: granted };

    const existing = await prisma.appCollectedOffer.findUnique({
      where: {
        customerId_offerId: {
          customerId: opts.customerId,
          offerId,
        },
      },
    });
    if (existing) {
      // Gói mới (sau hết hạn) → reset số lần; không cộng dồn khi còn hạn (đã chặn upstream)
      await prisma.appCollectedOffer.update({
        where: { id: existing.id },
        data: {
          status: "COLLECTED",
          collectedAt: new Date(),
          usedAt: null,
          ...qtyData,
        },
      });
    } else {
      await prisma.appCollectedOffer.create({
        data: {
          customerId: opts.customerId,
          offerId,
          status: "COLLECTED",
          ...qtyData,
        },
      });
    }
  }

  return {
    vipPlanLabel,
    vipExpiresAt,
    offerIds,
  };
}

function sameInstant(a: Date, b: Date) {
  return Math.abs(a.getTime() - b.getTime()) < 36 * 60 * 60 * 1000;
}

/**
 * Existing 6- and 12-month VIP rows keep the name and term from the day they
 * were sold. Rewrite the label, add the gift months when the saved end date
 * is only the paid term, and raise voucher counts without wiping uses.
 */
export async function reconcileOlympicMembership(
  prisma: PrismaClient,
  customer: {
    id: string;
    vipPlanLabel: string | null;
    vipStartedAt: Date | null;
    vipExpiresAt: Date | null;
  }
): Promise<{
  vipPlanLabel: string | null;
  vipStartedAt: Date | null;
  vipExpiresAt: Date | null;
}> {
  const packageId = packageIdFromVipPlanLabel(customer.vipPlanLabel);
  if (packageId !== "oly-6m" && packageId !== "oly-12m") return customer;

  const months = monthsForOlympicPackage(packageId);
  const bonus = bonusMonthsForPackage(packageId);
  const label = labelForOlympicPackage(packageId);
  let expiresAt = customer.vipExpiresAt;

  if (customer.vipStartedAt && expiresAt) {
    const paidEnd = addMonthsVn(customer.vipStartedAt, months - bonus);
    const fullEnd = addMonthsVn(customer.vipStartedAt, months);
    if (sameInstant(expiresAt, paidEnd) && !sameInstant(expiresAt, fullEnd)) {
      expiresAt = fullEnd;
    }
  }

  if (label !== customer.vipPlanLabel || expiresAt !== customer.vipExpiresAt) {
    await prisma.appCustomer.update({
      where: { id: customer.id },
      data: {
        vipPlanLabel: label,
        ...(expiresAt && expiresAt !== customer.vipExpiresAt
          ? { vipExpiresAt: expiresAt }
          : {}),
      },
    });
  }

  const offerIds = vouchersForOlympicPackage(packageId);
  const existingOffers = offerIds.length
    ? await prisma.appCollectedOffer.findMany({
        where: { customerId: customer.id, offerId: { in: offerIds } },
      })
    : [];
  const offerById = new Map(existingOffers.map((row) => [row.offerId, row]));

  for (const offerId of offerIds) {
    const granted = qtyForOlympicVoucher(packageId, offerId);
    if (granted == null) continue;
    const row = offerById.get(offerId);
    if (!row) {
      await prisma.appCollectedOffer.create({
        data: {
          customerId: customer.id,
          offerId,
          status: "COLLECTED",
          qtyTotal: granted,
          qtyRemaining: granted,
        },
      });
      continue;
    }
    const used =
      row.qtyTotal == null
        ? row.status === "USED"
          ? 1
          : 0
        : Math.max(0, row.qtyTotal - (row.qtyRemaining ?? 0));
    if (row.qtyTotal != null && row.qtyTotal >= granted && row.qtyRemaining != null) {
      continue;
    }
    const qtyRemaining = Math.max(0, granted - used);
    await prisma.appCollectedOffer.update({
      where: { id: row.id },
      data: {
        status: "COLLECTED",
        qtyTotal: granted,
        qtyRemaining,
        usedAt: qtyRemaining > 0 ? null : row.usedAt,
      },
    });
  }

  return {
    vipPlanLabel: label,
    vipStartedAt: customer.vipStartedAt,
    vipExpiresAt: expiresAt,
  };
}
