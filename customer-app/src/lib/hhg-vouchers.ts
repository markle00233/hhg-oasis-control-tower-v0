/**
 * Voucher HHG Oasis — hiển thị trên Home để khách Collect.
 * (Trước đây seed khi mua gói Olympic; nay tự claim trên Home.)
 */

export type HhgVoucher = {
  id: string;
  title: string;
  subtitle: string;
  /** Brand line shown on wallet card */
  sourceLabel: string;
  zoneCode: string;
  zoneLabel: string;
  href: string;
  image: string;
  discountType: "amount" | "percent" | "perk";
  discountVnd?: number;
  discountPercent?: number;
  /** Hoá đơn phải đạt mức này thì mới trừ tiền. */
  minBillVnd?: number;
  /** Which Olympic monthly package grants this (for seeding) */
  fromPackage?: string[];
};

export const HHG_OASIS_VOUCHERS: HhgVoucher[] = [
  {
    id: "hhg-oly-ln-100k",
    title: "Voucher Lòng Nướng 100K",
    subtitle:
      "HHG Oasis · Giảm 100K (HĐ từ 500K) · trong hạn gói (đếm số lần theo gói)",
    sourceLabel: "Voucher từ HHG Oasis",
    zoneCode: "LONG_NUONG",
    zoneLabel: "Lòng Nướng",
    href: "/book/long-nuong",
    image:
      "https://images.unsplash.com/photo-1555939594-58d7cb561ad1?auto=format&fit=crop&w=1200&q=60",
    discountType: "amount",
    discountVnd: 100_000,
    minBillVnd: 500_000,
    fromPackage: ["oly-3m", "oly-6m", "oly-12m"],
  },
  // Mía Ơi −5%/−10%: giảm theo gói VIP trong hạn (không còn voucher rời).
  {
    id: "hhg-oly-spa-goi",
    title: "Gội đầu Spa 30'",
    subtitle:
      "HHG Oasis · Quà gói Olympic · Spa · trong hạn gói (đếm số lần)",
    sourceLabel: "Voucher từ HHG Oasis",
    zoneCode: "SPA",
    zoneLabel: "Spa",
    href: "/services/SPA",
    image:
      "https://images.unsplash.com/photo-1544161515-4ab6ce6db874?auto=format&fit=crop&w=1200&q=60",
    discountType: "perk",
    fromPackage: ["oly-1m"],
  },
  {
    id: "hhg-oly-spa-massage",
    title: "Massage Spa 45'",
    subtitle:
      "HHG Oasis · Quà gói Olympic · Spa · trong hạn gói (đếm số lần)",
    sourceLabel: "Voucher từ HHG Oasis",
    zoneCode: "SPA",
    zoneLabel: "Spa",
    href: "/services/SPA",
    image:
      "https://images.unsplash.com/photo-1544161515-4ab6ce6db874?auto=format&fit=crop&w=1200&q=60",
    discountType: "perk",
    fromPackage: ["oly-3m", "oly-6m", "oly-12m"],
  },
];

export function getHhgVoucherById(id: string) {
  return HHG_OASIS_VOUCHERS.find((v) => v.id === id) || null;
}

export function vouchersForOlympicPackage(packageId: string) {
  return HHG_OASIS_VOUCHERS.filter((v) =>
    (v.fromPackage || []).includes(packageId)
  );
}

/** Voucher hội viên — dùng trong suốt hạn gói, không đốt 1 lần. */
export function isDurationMembershipVoucher(offerId: string) {
  return String(offerId || "").startsWith("hhg-oly-");
}

/**
 * Số lần kèm theo từng gói tháng.
 * `null` = không giới hạn số lần trong hạn gói.
 */
export function qtyForOlympicVoucher(
  packageId: string,
  offerId: string
): number | null {
  const map: Record<string, Record<string, number | null>> = {
    "oly-1m": {
      "hhg-oly-spa-goi": 1,
    },
    "oly-3m": {
      "hhg-oly-spa-massage": 1,
      "hhg-oly-ln-100k": 1,
    },
    "oly-6m": {
      "hhg-oly-spa-massage": 3,
      "hhg-oly-ln-100k": 3,
    },
    "oly-12m": {
      "hhg-oly-spa-massage": 8,
      "hhg-oly-ln-100k": 8,
    },
  };
  const row = map[packageId];
  if (!row || !(offerId in row)) return null;
  return row[offerId] ?? null;
}

export function packageIdFromVipPlanLabel(
  label: string | null | undefined
): string | null {
  const s = String(label || "");
  if (/12\s*tháng/i.test(s)) return "oly-12m";
  if (/6\s*tháng/i.test(s)) return "oly-6m";
  if (/3\s*tháng/i.test(s)) return "oly-3m";
  if (/1\s*tháng/i.test(s)) return "oly-1m";
  return null;
}

/** Có giới hạn số lần (massage / LN voucher / gội đầu). */
export function isLimitedMembershipVoucher(offerId: string) {
  return (
    offerId === "hhg-oly-spa-goi" ||
    offerId === "hhg-oly-spa-massage" ||
    offerId === "hhg-oly-ln-100k"
  );
}

export function isMiaOiMembershipVoucher(offerId: string) {
  return offerId === "hhg-oly-mia-5" || offerId === "hhg-oly-mia-10";
}

/** Hết lượt thì gỡ khỏi ví. (Mía % không còn là voucher.) */
export function voucherLeavesWalletWhenSpent(_offerId: string) {
  return false;
}
