/**
 * Voucher đến từ HHG Oasis — áp dụng phân khu khác
 * (vd. mua gói tháng Olympic → voucher Lòng Nướng / Mía Ơi / Spa).
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
  /** Which Olympic monthly package grants this (for seeding) */
  fromPackage?: string[];
};

export const HHG_OASIS_VOUCHERS: HhgVoucher[] = [
  {
    id: "hhg-oly-ln-100k",
    title: "Voucher Lòng Nướng 100K",
    subtitle: "HHG Oasis · Giảm 100K khi hoá đơn từ 500K · khu Lòng Nướng",
    sourceLabel: "Voucher từ HHG Oasis",
    zoneCode: "LONG_NUONG",
    zoneLabel: "Lòng Nướng",
    href: "/book/long-nuong",
    image:
      "https://images.unsplash.com/photo-1555939594-58d7cb561ad1?auto=format&fit=crop&w=1200&q=60",
    discountType: "amount",
    discountVnd: 100_000,
    fromPackage: ["oly-3m", "oly-6m", "oly-12m"],
  },
  {
    id: "hhg-oly-mia-5",
    title: "Mía Ơi −5%",
    subtitle: "HHG Oasis · Giảm 5% đồ uống Mía Ơi",
    sourceLabel: "Voucher từ HHG Oasis",
    zoneCode: "MIA_OI",
    zoneLabel: "Mía Ơi",
    href: "/order/miaoi",
    image:
      "https://images.unsplash.com/photo-1622597467836-f3285f2131b8?auto=format&fit=crop&w=1200&q=60",
    discountType: "percent",
    discountPercent: 5,
    fromPackage: ["oly-1m", "oly-3m"],
  },
  {
    id: "hhg-oly-mia-10",
    title: "Mía Ơi −10%",
    subtitle: "HHG Oasis · Giảm 10% đồ uống Mía Ơi",
    sourceLabel: "Voucher từ HHG Oasis",
    zoneCode: "MIA_OI",
    zoneLabel: "Mía Ơi",
    href: "/order/miaoi",
    image:
      "https://images.unsplash.com/photo-1622597467836-f3285f2131b8?auto=format&fit=crop&w=1200&q=60",
    discountType: "percent",
    discountPercent: 10,
    fromPackage: ["oly-6m", "oly-12m"],
  },
  {
    id: "hhg-oly-spa-goi",
    title: "Gội đầu Spa 30'",
    subtitle: "HHG Oasis · Quà kèm gói tháng Olympic · khu Spa",
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
    subtitle: "HHG Oasis · Quà kèm gói tháng Olympic · khu Spa",
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
