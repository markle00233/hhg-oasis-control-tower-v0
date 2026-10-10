/** HHG Oasis Wellness & Spa — catalog for desk SPA zone (SAUNA). */

export type SpaMenuItem = {
  id: string;
  category: string;
  nameVi: string;
  nameEn?: string;
  durationMin?: number;
  /** Base price VND */
  priceVnd: number;
  /** Optional upper price for ranges */
  priceAltVnd?: number;
  note?: string;
};

export type SpaCategory = {
  id: string;
  nameVi: string;
  nameEn?: string;
};

export const SPA_CATEGORIES: SpaCategory[] = [
  { id: "gio-vang", nameVi: "Giờ vàng 199K", nameEn: "Golden Hour" },
  { id: "hydro", nameVi: "Hydrotherapy", nameEn: "Hydrotherapy" },
  { id: "goi-duong", nameVi: "Gội dưỡng", nameEn: "Hair wash" },
  { id: "duong-sinh", nameVi: "Dưỡng sinh", nameEn: "Wellness massage" },
  { id: "foot", nameVi: "Dưỡng chân", nameEn: "Foot care" },
  { id: "duong-da", nameVi: "Dưỡng da", nameEn: "Skin care" },
  { id: "uu-dai", nameVi: "Ưu đãi gói", nameEn: "Package deals" },
  { id: "the", nameVi: "Thẻ trả trước", nameEn: "Prepaid cards" },
];

const k = (n: number) => n * 1000;

export const SPA_MENU: SpaMenuItem[] = [
  // Giờ vàng — T2–T6 · 13:00–16:00 · đồng giá 199K
  {
    id: "gv-goi-thu-gian",
    category: "gio-vang",
    nameVi: "Oasis Gội thư giãn (Giờ vàng)",
    nameEn: "Relaxing shampoo · Golden Hour",
    durationMin: 60,
    priceVnd: k(199),
    note: "T2–T6 · 13:00–16:00",
  },
  {
    id: "gv-foot-phuc-hoi",
    category: "gio-vang",
    nameVi: "Oasis Foot phục hồi (Giờ vàng)",
    nameEn: "Foot recovery · Golden Hour",
    durationMin: 45,
    priceVnd: k(199),
    note: "T2–T6 · 13:00–16:00",
  },
  {
    id: "gv-duong-sinh",
    category: "gio-vang",
    nameVi: "Oasis Dưỡng sinh (Giờ vàng)",
    nameEn: "Vitality therapy · Golden Hour",
    durationMin: 45,
    priceVnd: k(199),
    note: "T2–T6 · 13:00–16:00",
  },

  // Hydrotherapy
  {
    id: "hydro-relax",
    category: "hydro",
    nameVi: "Hydro Relax",
    nameEn: "Relax & regenerate",
    durationMin: 30,
    priceVnd: k(199),
    note: "Jacuzzi + xông hơi + ngâm chân",
  },
  {
    id: "hydro-head-spa",
    category: "hydro",
    nameVi: "Hydro & Head Spa",
    nameEn: "Head–neck–shoulder",
    durationMin: 90,
    priceVnd: k(399),
    note: "Hydro + Oasis Gội 60'",
  },
  {
    id: "hydro-sport",
    category: "hydro",
    nameVi: "Hydro Sport Recovery",
    nameEn: "Post-exercise recovery",
    durationMin: 105,
    priceVnd: k(499),
    note: "Hydro + Foot 45' + cổ vai gáy 15'",
  },
  {
    id: "hydro-body",
    category: "hydro",
    nameVi: "Hydro & Body Recovery",
    nameEn: "Full body regeneration",
    durationMin: 120,
    priceVnd: k(599),
    note: "Hydro + Dưỡng sinh đá nóng 75'",
  },
  {
    id: "hydro-retreat-1",
    category: "hydro",
    nameVi: "Oasis Hydro Retreat 1",
    nameEn: "Complete relaxation",
    durationMin: 240,
    priceVnd: k(899),
    note: "4h · tặng Mía Ơi + bữa dưỡng sinh",
  },
  {
    id: "hydro-retreat-2",
    category: "hydro",
    nameVi: "Oasis Hydro Retreat 2",
    nameEn: "Full body retreat",
    durationMin: 300,
    priceVnd: k(999),
    note: "5h · DDS & hồng ngoại · tặng Mía Ơi + bữa",
  },

  // Gội dưỡng
  {
    id: "goi-sau-the-thao",
    category: "goi-duong",
    nameVi: "Oasis Gội sạch sau vận động",
    durationMin: 30,
    priceVnd: k(89),
    note: "Sau bơi / Pickleball",
  },
  {
    id: "goi-thu-gian-duong-sinh",
    category: "goi-duong",
    nameVi: "Oasis Gội thư giãn dưỡng sinh",
    durationMin: 60,
    priceVnd: k(249),
  },
  {
    id: "goi-toan-dien",
    category: "goi-duong",
    nameVi: "Oasis Gội chăm sóc toàn diện tóc & da mặt",
    durationMin: 90,
    priceVnd: k(349),
  },

  // Dưỡng sinh
  {
    id: "ds-dau-co-vai",
    category: "duong-sinh",
    nameVi: "Oasis Dưỡng sinh đầu cổ vai",
    durationMin: 45,
    priceVnd: k(249),
  },
  {
    id: "ds-toan-than",
    category: "duong-sinh",
    nameVi: "Oasis Dưỡng sinh toàn thân thư giãn sâu",
    durationMin: 60,
    priceVnd: k(349),
    priceAltVnd: k(449),
    note: "60–75 phút",
  },
  {
    id: "ds-co-vai-gay-lung",
    category: "duong-sinh",
    nameVi: "Oasis Dưỡng sinh cổ vai gáy lưng",
    durationMin: 75,
    priceVnd: k(449),
    priceAltVnd: k(549),
    note: "75–90 phút",
  },
  {
    id: "ds-phuc-hoi-lieu-phap",
    category: "duong-sinh",
    nameVi: "Oasis Dưỡng sinh phục hồi toàn thân",
    durationMin: 90,
    priceVnd: k(649),
    priceAltVnd: k(749),
    note: "90–120 phút",
  },
  {
    id: "ngam-chan-thao-moc",
    category: "duong-sinh",
    nameVi: "Ngâm chân thảo mộc",
    priceVnd: 0,
    note: "Addon / theo liệu trình",
  },

  // Foot
  {
    id: "foot-tinh-dau",
    category: "foot",
    nameVi: "Oasis Foot thư giãn với tinh dầu",
    durationMin: 30,
    priceVnd: k(189),
  },
  {
    id: "foot-an-huyet",
    category: "foot",
    nameVi: "Oasis Foot phục hồi ấn huyệt",
    durationMin: 45,
    priceVnd: k(249),
  },
  {
    id: "foot-chuyen-sau",
    category: "foot",
    nameVi: "Oasis Foot chuyên sâu ấn huyệt & tẩy tế bào chết",
    durationMin: 60,
    priceVnd: k(349),
  },

  // Dưỡng da
  {
    id: "da-thuong-kho",
    category: "duong-da",
    nameVi: "Chăm sóc da thường / khô — cấp ẩm",
    priceVnd: k(390),
  },
  {
    id: "da-dau-hon-hop",
    category: "duong-da",
    nameVi: "Chăm sóc da dầu / hỗn hợp — kiểm soát dầu",
    priceVnd: k(390),
  },
  {
    id: "da-lao-hoa",
    category: "duong-da",
    nameVi: "Chăm sóc da lão hóa — nâng cơ phục hồi",
    priceVnd: k(550),
  },

  // Ưu đãi gói
  {
    id: "deal-mua5-tang1",
    category: "uu-dai",
    nameVi: "Mua 5 tặng 1 (+ 1 vé Hồ VIP)",
    priceVnd: 0,
    note: "Tặng 01 dịch vụ bất kỳ + 01 vé VIP",
  },
  {
    id: "deal-mua10-tang3",
    category: "uu-dai",
    nameVi: "Mua 10 tặng 3 (+ 2 vé Hồ VIP)",
    priceVnd: 0,
    note: "Tặng 03 dịch vụ bất kỳ + 02 vé VIP",
  },
  {
    id: "deal-review-10",
    category: "uu-dai",
    nameVi: "Review Google Maps — giảm 10% bill",
    priceVnd: 0,
    note: "Hotline 0919 430 553",
  },

  // Thẻ trả trước
  {
    id: "the-goi-1",
    category: "the",
    nameVi: "Thẻ gói 1 — Khởi đầu thư giãn",
    priceVnd: k(3000),
    note: "Tặng 500K",
  },
  {
    id: "the-goi-2",
    category: "the",
    nameVi: "Thẻ gói 2 — Trải nghiệm nhiều hơn",
    priceVnd: k(5000),
    note: "Tặng 1.000K + 01 vé VIP",
  },
  {
    id: "the-goi-3",
    category: "the",
    nameVi: "Thẻ gói 3 — Tận hưởng đặc quyền",
    priceVnd: k(10000),
    note: "Tặng 3.000K + 03 vé VIP · ưu tiên đặt lịch",
  },
  {
    id: "the-goi-4",
    category: "the",
    nameVi: "Thẻ gói 4 — Sống khỏe dài lâu",
    priceVnd: k(20000),
    note: "Tặng 8.000K + 05 vé VIP",
  },
  {
    id: "the-goi-5",
    category: "the",
    nameVi: "Thẻ gói 5 — Đẳng cấp trải nghiệm",
    priceVnd: k(30000),
    note: "Tặng 15.000K + 05 vé VIP",
  },
];

export function formatVnd(n: number) {
  if (n <= 0) return "—";
  return new Intl.NumberFormat("vi-VN").format(n) + "đ";
}

export function formatSpaPrice(item: SpaMenuItem) {
  if (item.priceVnd <= 0) return "Theo gói";
  const base = Math.round(item.priceVnd / 1000);
  if (item.priceAltVnd) {
    return `${base}–${Math.round(item.priceAltVnd / 1000)}K`;
  }
  return `${base}K`;
}

export function getSpaItem(id: string) {
  return SPA_MENU.find((i) => i.id === id) || null;
}
