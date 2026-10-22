/**
 * Catalog voucher HHG (desk claim) — đồng bộ id với customer-app/hhg-vouchers.
 */

export type DeskHhgVoucher = {
  id: string;
  title: string;
  subtitle: string;
  zoneCode: string;
  zoneLabel: string;
  discountType: "amount" | "percent" | "perk";
  discountVnd?: number;
  discountPercent?: number;
};

export const DESK_HHG_VOUCHERS: DeskHhgVoucher[] = [
  {
    id: "hhg-oly-ln-100k",
    title: "Voucher Lòng Nướng 100K",
    subtitle: "Giảm 100K khi hoá đơn từ 500K · Lòng Nướng",
    zoneCode: "LONG_NUONG",
    zoneLabel: "Lòng Nướng",
    discountType: "amount",
    discountVnd: 100_000,
  },
  {
    id: "hhg-oly-mia-5",
    title: "Mía Ơi −5%",
    subtitle: "Giảm 5% nước Mía Ơi · trong hạn gói hội viên",
    zoneCode: "MIA_OI",
    zoneLabel: "Mía Ơi",
    discountType: "percent",
    discountPercent: 5,
  },
  {
    id: "hhg-oly-mia-10",
    title: "Mía Ơi −10%",
    subtitle: "Giảm 10% nước Mía Ơi · trong hạn gói hội viên",
    zoneCode: "MIA_OI",
    zoneLabel: "Mía Ơi",
    discountType: "percent",
    discountPercent: 10,
  },
  {
    id: "hhg-oly-spa-goi",
    title: "Gội đầu Spa 30'",
    subtitle: "Quà kèm gói tháng Olympic · Spa",
    zoneCode: "SPA",
    zoneLabel: "Spa",
    discountType: "perk",
  },
  {
    id: "hhg-oly-spa-massage",
    title: "Massage Spa",
    subtitle: "Quà kèm gói tháng Olympic · Spa",
    zoneCode: "SPA",
    zoneLabel: "Spa",
    discountType: "perk",
  },
  {
    id: "hhg-spa-review-10",
    title: "Review Google Maps −10%",
    subtitle: "Review ngay · giảm trực tiếp 10% vào bill Spa",
    zoneCode: "SPA",
    zoneLabel: "Spa",
    discountType: "percent",
    discountPercent: 10,
  },
];

export function getDeskHhgVoucher(offerId: string) {
  return DESK_HHG_VOUCHERS.find((v) => v.id === offerId) || null;
}

/** Voucher claim được tại quầy Spa / Lòng Nướng. */
export function vouchersClaimableAtZone(deskZone: string): DeskHhgVoucher[] {
  const z = deskZone.toUpperCase();
  if (z === "SAUNA" || z === "SPA") {
    return DESK_HHG_VOUCHERS.filter((v) => v.zoneCode === "SPA");
  }
  if (z === "LONG_NUONG") {
    return DESK_HHG_VOUCHERS.filter((v) => v.zoneCode === "LONG_NUONG");
  }
  return [];
}

/** Voucher áp vào bill tại quầy (Mía % / Spa / LN). */
export function vouchersUsableAtZone(deskZone: string): DeskHhgVoucher[] {
  const z = deskZone.toUpperCase();
  if (z === "MIA_OI") {
    return DESK_HHG_VOUCHERS.filter((v) => v.zoneCode === "MIA_OI");
  }
  if (z === "OLYMPIC_POOL" || z === "OLYMPIC") {
    return DESK_HHG_VOUCHERS.filter((v) => v.zoneCode === "OLYMPIC_POOL");
  }
  return vouchersClaimableAtZone(z);
}

export function offerMatchesDeskZone(offerId: string, deskZone: string) {
  const v = getDeskHhgVoucher(offerId);
  if (!v) return false;
  const z = deskZone.toUpperCase();
  if (z === "SAUNA" || z === "SPA") return v.zoneCode === "SPA";
  if (z === "LONG_NUONG") return v.zoneCode === "LONG_NUONG";
  if (z === "MIA_OI") return v.zoneCode === "MIA_OI";
  if (z === "OLYMPIC_POOL" || z === "OLYMPIC") {
    return v.zoneCode === "OLYMPIC_POOL";
  }
  return false;
}

export function deskVoucherCut(
  baseVnd: number,
  v: {
    discountType?: string;
    discountVnd?: number;
    discountPercent?: number;
  } | null
) {
  const base = Math.max(0, Math.round(Number(baseVnd) || 0));
  if (!v || base <= 0) return 0;
  if (v.discountType === "amount") {
    return Math.min(base, Math.max(0, Math.round(Number(v.discountVnd) || 0)));
  }
  if (v.discountType === "percent") {
    const p = Math.min(100, Math.max(0, Number(v.discountPercent) || 0));
    return Math.round((base * p) / 100);
  }
  return 0;
}

/**
 * Số lần kèm theo từng gói tháng.
 * `null` = không giới hạn trong hạn gói (vd Mía %).
 */
export function qtyForOlympicVoucher(
  packageId: string,
  offerId: string
): number | null {
  const map: Record<string, Record<string, number | null>> = {
    "oly-1m": {
      "hhg-oly-spa-goi": 1,
      "hhg-oly-mia-5": null,
    },
    "oly-3m": {
      "hhg-oly-spa-massage": 1,
      "hhg-oly-ln-100k": 1,
      "hhg-oly-mia-5": null,
    },
    "oly-6m": {
      "hhg-oly-spa-massage": 3,
      "hhg-oly-ln-100k": 3,
      "hhg-oly-mia-10": null,
    },
    "oly-12m": {
      "hhg-oly-spa-massage": 8,
      "hhg-oly-ln-100k": 8,
      "hhg-oly-mia-10": null,
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

export function isDurationMembershipVoucher(offerId: string) {
  return String(offerId || "").startsWith("hhg-oly-");
}

export function isLimitedMembershipVoucher(offerId: string) {
  return (
    offerId === "hhg-oly-spa-goi" ||
    offerId === "hhg-oly-spa-massage" ||
    offerId === "hhg-oly-ln-100k"
  );
}
