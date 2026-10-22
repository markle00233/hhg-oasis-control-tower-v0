import type { PrismaClient } from "@prisma/client";

/** Số tháng cộng vào hạn gói (gồm tháng tặng theo menu). */
export function monthsForOlympicPackage(packageId: string): number {
  switch (packageId) {
    case "oly-1m":
      return 1;
    case "oly-3m":
      return 3;
    case "oly-6m":
      return 7; // 6 + 1 tặng
    case "oly-12m":
      return 14; // 12 + 2 tặng
    default:
      return 0;
  }
}

export function labelForOlympicPackage(packageId: string): string {
  switch (packageId) {
    case "oly-1m":
      return "Gói Olympic 1 tháng";
    case "oly-3m":
      return "Gói Olympic 3 tháng";
    case "oly-6m":
      return "Gói Olympic 6 tháng";
    case "oly-12m":
      return "Gói Olympic 12 tháng";
    default:
      return "Gói Olympic";
  }
}

/** Voucher HHG kèm gói tháng (đồng bộ seed-vip-from-crm). */
export function vouchersForOlympicPackage(packageId: string): string[] {
  const map: Record<string, string[]> = {
    "oly-1m": ["hhg-oly-spa-goi", "hhg-oly-mia-5"],
    "oly-3m": ["hhg-oly-spa-massage", "hhg-oly-ln-100k", "hhg-oly-mia-5"],
    "oly-6m": ["hhg-oly-spa-massage", "hhg-oly-ln-100k", "hhg-oly-mia-10"],
    "oly-12m": ["hhg-oly-spa-massage", "hhg-oly-ln-100k", "hhg-oly-mia-10"],
  };
  return map[packageId] || [];
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

  const vipExpiresAt = new Date(from);
  vipExpiresAt.setMonth(vipExpiresAt.getMonth() + months);

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
