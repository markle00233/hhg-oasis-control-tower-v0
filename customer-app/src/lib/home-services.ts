/** Guest-facing service shortcuts + offers (Collect). */

import { HHG_OASIS_VOUCHERS } from "./hhg-vouchers";

export type HomeService = {
  code: string;
  name: string;
  href: string;
  bg: string;
  fg: string;
  mark: string;
};

export type HomeGroup = {
  id: "sport" | "wellness" | "fnb";
  title: string;
  subtitle: string;
  services: HomeService[];
};

export const HOME_GROUPS: HomeGroup[] = [
  {
    id: "sport",
    title: "Sport",
    subtitle: "Thể thao",
    services: [
      {
        code: "OLYMPIC_POOL",
        name: "Olympic",
        href: "/services/OLYMPIC_POOL",
        bg: "#dbeafe",
        fg: "#1e3a8a",
        mark: "OL",
      },
      {
        code: "PICKLEBALL",
        name: "Pickleball",
        href: "/book/pickleball",
        bg: "#ecfccb",
        fg: "#3f6212",
        mark: "PB",
      },
    ],
  },
  {
    id: "wellness",
    title: "Wellness",
    subtitle: "Chăm sóc",
    services: [
      {
        code: "SPA",
        name: "Spa",
        href: "/services/SPA",
        bg: "#ffe4e6",
        fg: "#9f1239",
        mark: "SPA",
      },
    ],
  },
  {
    id: "fnb",
    title: "F&B",
    subtitle: "Ẩm thực",
    services: [
      {
        code: "MIA_OI",
        name: "Mía Ơi",
        href: "/order/miaoi",
        bg: "#dcfce7",
        fg: "#14532d",
        mark: "MÍA",
      },
      {
        code: "LONG_NUONG",
        name: "Lòng Nướng Chí Phèo",
        href: "/book/long-nuong",
        bg: "#fed7aa",
        fg: "#9a3412",
        mark: "LN",
      },
    ],
  },
];

/** Flat list (compat). */
export const HOME_SERVICES = HOME_GROUPS.flatMap((g) => g.services);

export type HomeOffer = {
  id: string;
  title: string;
  subtitle: string;
  /** Zone this voucher applies to */
  zoneCode: string;
  zoneLabel: string;
  href: string;
  image: string;
  /** amount = trừ VND; percent = %; perk = quà / không trừ tiền */
  discountType: "amount" | "percent" | "perk";
  discountVnd?: number;
  discountPercent?: number;
  /** e.g. "Voucher từ HHG Oasis" */
  sourceLabel?: string;
};

const MARKETING_OFFERS: HomeOffer[] = [
  {
    id: "pb-afternoon",
    title: "Pickleball buổi chiều",
    subtitle: "Giảm 50K khi đặt sân · khu Pickleball",
    zoneCode: "PICKLEBALL",
    zoneLabel: "Pickleball",
    href: "/book/pickleball",
    image:
      "https://images.unsplash.com/photo-1554068865-24cecd4e343f?auto=format&fit=crop&w=1200&q=60",
    discountType: "amount",
    discountVnd: 50_000,
  },
  {
    id: "hhg-spa-review-10",
    title: "Review Google Maps — giảm 10% bill Spa",
    subtitle: "Review ngay · giảm trực tiếp 10% vào bill Spa",
    zoneCode: "SPA",
    zoneLabel: "Spa",
    href: "/services/SPA",
    image:
      "https://images.unsplash.com/photo-1544161515-4ab6ce6db874?auto=format&fit=crop&w=1200&q=60",
    discountType: "percent",
    discountPercent: 10,
    sourceLabel: "Ưu đãi HHG Oasis Spa",
  },
  {
    id: "spa-gio-vang",
    title: "Giờ Vàng Oasis — 199K",
    subtitle: "T2–T6 · 13:00–16:00 · Gội / Foot / Dưỡng sinh",
    zoneCode: "SPA",
    zoneLabel: "Spa",
    href: "/services/SPA",
    image:
      "https://images.unsplash.com/photo-1571902943202-507ec2618e8f?auto=format&fit=crop&w=1200&q=60",
    discountType: "perk",
  },
  {
    id: "olympic-combo",
    title: "Hồ Olympic",
    subtitle: "Giảm 20K vé hồ · khu Olympic",
    zoneCode: "OLYMPIC_POOL",
    zoneLabel: "Olympic",
    href: "/services/OLYMPIC_POOL",
    image:
      "https://images.unsplash.com/photo-1576013551627-0cc20b96c2a7?auto=format&fit=crop&w=1200&q=60",
    discountType: "amount",
    discountVnd: 20_000,
  },
];

/** Marketing + voucher HHG Oasis liên khu (từ gói tháng Olympic…). */
export const HOME_OFFERS: HomeOffer[] = [
  ...HHG_OASIS_VOUCHERS.map((v) => ({
    id: v.id,
    title: v.title,
    subtitle: v.subtitle,
    zoneCode: v.zoneCode,
    zoneLabel: v.zoneLabel,
    href: v.href,
    image: v.image,
    discountType: v.discountType,
    discountVnd: v.discountVnd,
    discountPercent: v.discountPercent,
    sourceLabel: v.sourceLabel,
  })),
  ...MARKETING_OFFERS,
];

/** @deprecated use HOME_OFFERS */
export const HOME_POSTERS = HOME_OFFERS;

export function getOfferById(id: string) {
  return HOME_OFFERS.find((o) => o.id === id) || null;
}

export function offersForZone(zoneCode: string) {
  const z = zoneCode.toUpperCase();
  const aliases =
    z === "SAUNA" ? ["SPA", "SAUNA"] : z === "SPA" ? ["SPA", "SAUNA"] : [z];
  return HOME_OFFERS.filter((o) => aliases.includes(o.zoneCode.toUpperCase()));
}

export function applyOfferDiscount(
  subtotalVnd: number,
  offer: HomeOffer | null | undefined
) {
  return applyOffersDiscount(subtotalVnd, offer ? [offer] : []);
}

/** Cộng dồn nhiều voucher: amount rồi percent trên phần còn lại; perk = 0đ. */
export function applyOffersDiscount(
  subtotalVnd: number,
  offers: HomeOffer[] | null | undefined
) {
  const list = Array.isArray(offers) ? offers.filter(Boolean) : [];
  if (!list.length || subtotalVnd <= 0) {
    return {
      totalVnd: Math.max(0, subtotalVnd),
      discountVnd: 0,
      lines: [] as { offer: HomeOffer; discountVnd: number }[],
    };
  }
  const ordered = [
    ...list.filter((o) => o.discountType === "amount"),
    ...list.filter((o) => o.discountType === "percent"),
    ...list.filter(
      (o) => o.discountType !== "amount" && o.discountType !== "percent"
    ),
  ];
  let remaining = subtotalVnd;
  const lines: { offer: HomeOffer; discountVnd: number }[] = [];
  for (const offer of ordered) {
    if (remaining <= 0) {
      lines.push({ offer, discountVnd: 0 });
      continue;
    }
    let cut = 0;
    if (offer.discountType === "amount") {
      cut = Math.min(remaining, offer.discountVnd || 0);
    } else if (offer.discountType === "percent") {
      const p = Math.min(100, Math.max(0, offer.discountPercent || 0));
      cut = Math.round((remaining * p) / 100);
    }
    remaining -= cut;
    lines.push({ offer, discountVnd: cut });
  }
  const discountVnd = Math.max(0, subtotalVnd - remaining);
  return { totalVnd: Math.max(0, remaining), discountVnd, lines };
}

export function appliedVouchersLabel(offers: HomeOffer[]) {
  if (!offers.length) return null;
  if (offers.length === 1) return offers[0].title;
  return `${offers.length} voucher · ${offers[0].title}`;
}
