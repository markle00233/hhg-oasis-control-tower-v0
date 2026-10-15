/** Guest-facing catalogs — full Spa / VIP / Olympic from HHG Oasis posters. */

export type ServicePackage = {
  id: string;
  category: string;
  nameVi: string;
  nameEn?: string;
  durationMin?: number;
  priceVnd: number;
  priceAltVnd?: number;
  note?: string;
  includes?: string[];
  image?: string;
};

export type CatalogCategory = {
  id: string;
  nameVi: string;
};

const k = (n: number) => n * 1000;

export function formatPkgPriceShort(p: {
  priceVnd: number;
  priceAltVnd?: number;
}) {
  if (p.priceVnd <= 0) return "Theo gói";
  if (p.priceAltVnd) {
    return `${Math.round(p.priceVnd / 1000)}–${Math.round(p.priceAltVnd / 1000)}K`;
  }
  return `${Math.round(p.priceVnd / 1000)}K`;
}

/** Olympic — vé lẻ (PDF bảng giá) */
export const OLYMPIC_PACKAGES: ServicePackage[] = [
  {
    id: "pool-u13-90",
    category: "ve-le",
    nameVi: "Vé 90 phút — dưới 1,3m",
    durationMin: 90,
    priceVnd: k(40),
    note: "Trẻ em dưới 1,3m",
    image:
      "https://images.unsplash.com/photo-1576013551627-0cc20b96c2a7?auto=format&fit=crop&w=800&q=60",
  },
  {
    id: "pool-u13-unlimited",
    category: "ve-le",
    nameVi: "Vé không giới hạn — dưới 1,3m",
    priceVnd: k(50),
    note: "Trẻ em dưới 1,3m",
    image:
      "https://images.unsplash.com/photo-1519315901367-f34ff9154487?auto=format&fit=crop&w=800&q=60",
  },
  {
    id: "pool-o13-90",
    category: "ve-le",
    nameVi: "Vé 90 phút — từ 1,3m",
    durationMin: 90,
    priceVnd: k(60),
    note: "Từ 1,3m trở lên",
    image:
      "https://images.unsplash.com/photo-1530549387789-4c1017266635?auto=format&fit=crop&w=800&q=60",
  },
  {
    id: "pool-o13-unlimited",
    category: "ve-le",
    nameVi: "Vé không giới hạn — từ 1,3m",
    priceVnd: k(70),
    note: "Từ 1,3m trở lên",
    image:
      "https://images.unsplash.com/photo-1560090995-01632a28895b?auto=format&fit=crop&w=800&q=60",
  },
];

/** Olympic — gói tháng + quyền lợi đi kèm (PDF) */
export const OLYMPIC_MONTHLY: ServicePackage[] = [
  {
    id: "oly-1m",
    category: "goi-thang",
    nameVi: "Gói 1 tháng",
    priceVnd: k(700),
    note: "700K/tháng · Gội đầu Spa 30' · Mía Ơi −5%",
    includes: ["01 gội đầu Spa 30'", "Mía Ơi giảm 5%"],
  },
  {
    id: "oly-3m",
    category: "goi-thang",
    nameVi: "Gói 3 tháng",
    priceVnd: 1_900_000,
    note: "~630K/tháng · Tiết kiệm 200K · 01 massage + 01 voucher LN 100K · Mía Ơi −5%",
    includes: [
      "01 massage Spa 45'",
      "01 voucher Lòng Nướng 100K (HĐ từ 500K)",
      "Mía Ơi giảm 5%",
    ],
  },
  {
    id: "oly-6m",
    category: "goi-thang",
    nameVi: "Gói 6 tháng",
    priceVnd: 3_400_000,
    note: "~490K/tháng · Tiết kiệm 1,5tr · +1 tháng bơi · 03 massage + 03 voucher LN · Mía Ơi −10%",
    includes: [
      "03 massage Spa 45'",
      "03 voucher Lòng Nướng 100K (HĐ từ 500K)",
      "+01 tháng bơi",
      "Mía Ơi giảm 10%",
    ],
  },
  {
    id: "oly-12m",
    category: "goi-thang",
    nameVi: "Gói 12 tháng",
    priceVnd: 5_400_000,
    note: "~390K/tháng · Tiết kiệm 4,4tr · +2 tháng bơi · 08 massage + 08 voucher LN · Mía Ơi −10%",
    includes: [
      "08 massage Spa 45'",
      "08 voucher Lòng Nướng 100K (HĐ từ 500K)",
      "+02 tháng bơi",
      "Mía Ơi giảm 10%",
    ],
  },
];

export const OLYMPIC_CATEGORIES: CatalogCategory[] = [
  { id: "ve-le", nameVi: "Vé lẻ" },
  { id: "goi-thang", nameVi: "Gói tháng" },
  { id: "phu-kien", nameVi: "Phụ kiện" },
];

/** Olympic — phụ kiện bán kèm */
export const OLYMPIC_ACCESSORIES: ServicePackage[] = [
  {
    id: "acc-do-boi-nu",
    category: "phu-kien",
    nameVi: "Đồ bơi nữ",
    priceVnd: k(180),
    note: "1 bộ",
  },
  {
    id: "acc-quan-boi-nam",
    category: "phu-kien",
    nameVi: "Quần bơi nam",
    priceVnd: k(150),
    note: "1 quần",
  },
  {
    id: "acc-do-boi-be",
    category: "phu-kien",
    nameVi: "Đồ bơi bé trai / bé gái",
    priceVnd: k(170),
    priceAltVnd: k(230),
    note: "1 bộ · 170–230K tuỳ size",
  },
  {
    id: "acc-kinh-boi",
    category: "phu-kien",
    nameVi: "Kính bơi",
    priceVnd: k(120),
    note: "1 cái",
  },
  {
    id: "acc-kinh-mat",
    category: "phu-kien",
    nameVi: "Kính mát",
    priceVnd: k(150),
    note: "1 cái",
  },
  {
    id: "acc-dep-nam",
    category: "phu-kien",
    nameVi: "Dép nam",
    priceVnd: k(135),
    note: "1 đôi",
  },
  {
    id: "acc-dep-nu",
    category: "phu-kien",
    nameVi: "Dép nữ",
    priceVnd: k(120),
    note: "1 đôi",
  },
  {
    id: "acc-bikini",
    category: "phu-kien",
    nameVi: "Bikini",
    priceVnd: k(200),
    note: "1 bộ",
  },
  {
    id: "acc-do-boi-bien-nu",
    category: "phu-kien",
    nameVi: "Đồ bơi đi biển nữ",
    priceVnd: k(350),
    note: "1 bộ · Mua từ 02 món phụ kiện giảm 10% tổng HĐ phụ kiện",
  },
];

export const SPA_CATEGORIES: CatalogCategory[] = [
  { id: "hydro", nameVi: "6 gói Hydro" },
  { id: "gio-vang", nameVi: "Giờ vàng 199K" },
  { id: "goi-duong", nameVi: "Gội dưỡng" },
  { id: "duong-sinh", nameVi: "Dưỡng sinh" },
  { id: "foot", nameVi: "Dưỡng chân" },
  { id: "duong-da", nameVi: "Dưỡng da" },
  { id: "uu-dai", nameVi: "Quà / ưu đãi" },
  { id: "the", nameVi: "Thẻ trả trước" },
];

/** Full Spa menu from posters (Hydro + Giờ vàng + à la carte + deals + prepaid). */
export const SPA_MENU: ServicePackage[] = [
  // —— 6 gói Hydro (hình giá) ——
  {
    id: "hydro-relax",
    category: "hydro",
    nameVi: "01 · Hydro Relax",
    nameEn: "Thư giãn & tái tạo",
    durationMin: 30,
    priceVnd: k(199),
    includes: ["Jacuzzi nóng lạnh", "Xông hơi ướt/khô", "Ngâm chân thảo dược"],
    image:
      "https://images.unsplash.com/photo-1540555700478-4be289fbecef?auto=format&fit=crop&w=800&q=60",
  },
  {
    id: "hydro-head-spa",
    category: "hydro",
    nameVi: "02 · Hydro & Head Spa",
    nameEn: "Đầu – cổ – vai gáy",
    durationMin: 90,
    priceVnd: k(399),
    includes: [
      "Jacuzzi 15'",
      "Xông hơi 15'",
      "Ngâm chân 10'",
      "Gội & massage đầu 60'",
    ],
    image:
      "https://images.unsplash.com/photo-1544161515-4ab6ce6db874?auto=format&fit=crop&w=800&q=60",
  },
  {
    id: "hydro-sport",
    category: "hydro",
    nameVi: "03 · Hydro Sport Recovery",
    nameEn: "Phục hồi sau vận động",
    durationMin: 105,
    priceVnd: k(499),
    includes: [
      "Jacuzzi 20'",
      "Xông hơi 15'",
      "Ngâm chân 10'",
      "Foot phục hồi 45'",
      "Massage cổ vai gáy 15'",
    ],
    image:
      "https://images.unsplash.com/photo-1519823551278-64ac927cff56?auto=format&fit=crop&w=800&q=60",
  },
  {
    id: "hydro-body",
    category: "hydro",
    nameVi: "04 · Hydro & Body Recovery",
    nameEn: "Thư giãn toàn thân",
    durationMin: 120,
    priceVnd: k(599),
    includes: [
      "Jacuzzi 20'",
      "Xông hơi 15'",
      "Ngâm chân 10'",
      "Dưỡng sinh đá nóng 75'",
    ],
    image:
      "https://images.unsplash.com/photo-1600334129128-685c5582fd35?auto=format&fit=crop&w=800&q=60",
  },
  {
    id: "hydro-retreat-1",
    category: "hydro",
    nameVi: "05 · Oasis Hydro Retreat 1",
    nameEn: "Trọn vẹn · 4 giờ",
    durationMin: 240,
    priceVnd: k(899),
    includes: [
      "Hồ muối khoáng",
      "Jacuzzi + sauna + ngâm chân",
      "Gội dưỡng sinh 90'",
      "Foot phục hồi 45'",
      "Tặng Mía Ơi + bữa dưỡng sinh",
    ],
    image:
      "https://images.unsplash.com/photo-1571902943202-507ec2618e8f?auto=format&fit=crop&w=800&q=60",
  },
  {
    id: "hydro-retreat-2",
    category: "hydro",
    nameVi: "06 · Oasis Hydro Retreat 2",
    nameEn: "Phục hồi toàn thân · 5 giờ",
    durationMin: 300,
    priceVnd: k(999),
    includes: [
      "Hồ muối khoáng",
      "Jacuzzi + sauna + ngâm chân",
      "Body phục hồi 120' + DDS / hồng ngoại",
      "Tặng Mía Ơi + bữa dưỡng sinh",
    ],
    image:
      "https://images.unsplash.com/photo-1540555700478-4be289fbecef?auto=format&fit=crop&w=800&q=60",
  },

  // —— Giờ vàng Oasis ——
  {
    id: "gv-goi-thu-gian",
    category: "gio-vang",
    nameVi: "Oasis Gội thư giãn (Giờ vàng)",
    durationMin: 60,
    priceVnd: k(199),
    note: "T2–T6 · 13:00–16:00 · đồng giá 199K",
  },
  {
    id: "gv-foot-phuc-hoi",
    category: "gio-vang",
    nameVi: "Oasis Foot phục hồi (Giờ vàng)",
    durationMin: 45,
    priceVnd: k(199),
    note: "T2–T6 · 13:00–16:00 · đồng giá 199K",
  },
  {
    id: "gv-duong-sinh",
    category: "gio-vang",
    nameVi: "Oasis Dưỡng sinh (Giờ vàng)",
    durationMin: 45,
    priceVnd: k(199),
    note: "T2–T6 · 13:00–16:00 · đồng giá 199K",
  },

  // —— Gội dưỡng ——
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

  // —— Dưỡng sinh ——
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

  // —— Foot ——
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

  // —— Dưỡng da ——
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

  // —— Quà / ưu đãi ——
  {
    id: "deal-mua5-tang1",
    category: "uu-dai",
    nameVi: "Mua 5 tặng 1",
    priceVnd: 0,
    note: "Tặng 01 lần dịch vụ bất kỳ + 01 vé Hồ VIP HHG Oasis",
    includes: ["Tặng 1 dịch vụ bất kỳ", "+ 1 vé khu VIP"],
  },
  {
    id: "deal-mua10-tang3",
    category: "uu-dai",
    nameVi: "Mua 10 tặng 3",
    priceVnd: 0,
    note: "Tặng 03 lần dịch vụ bất kỳ + 02 vé Hồ VIP",
    includes: ["Tặng 3 dịch vụ bất kỳ", "+ 2 vé khu VIP"],
  },
  {
    id: "deal-review-10",
    category: "uu-dai",
    nameVi: "Review Google Maps — giảm 10% bill",
    priceVnd: 0,
    note: "Review ngay nhận quà · Hotline 0919 430 553",
  },

  // —— Thẻ trả trước (VIP privileges) ——
  {
    id: "the-goi-1",
    category: "the",
    nameVi: "Thẻ gói 1 — Khởi đầu thư giãn",
    priceVnd: k(3000),
    note: "Nạp 3.000.000đ · tặng 500.000đ",
    includes: ["Tặng +500K vào thẻ"],
  },
  {
    id: "the-goi-2",
    category: "the",
    nameVi: "Thẻ gói 2 — Trải nghiệm nhiều hơn",
    priceVnd: k(5000),
    note: "Nạp 5.000.000đ · tặng 1.000.000đ",
    includes: ["Tặng +1.000K", "+ 01 vé khu VIP Oasis"],
  },
  {
    id: "the-goi-3",
    category: "the",
    nameVi: "Thẻ gói 3 — Tận hưởng đặc quyền",
    priceVnd: k(10000),
    note: "Nạp 10.000.000đ · tặng 3.000.000đ",
    includes: [
      "Tặng +3.000K",
      "+ 03 vé VIP",
      "Ưu tiên đặt lịch",
      "Bữa ăn dưỡng sinh",
    ],
  },
  {
    id: "the-goi-4",
    category: "the",
    nameVi: "Thẻ gói 4 — Sống khỏe dài lâu",
    priceVnd: k(20000),
    note: "Nạp 20.000.000đ · tặng 8.000.000đ",
    includes: [
      "Tặng +8.000K",
      "+ 05 vé VIP",
      "Ưu tiên đặt lịch",
      "Bữa ăn dưỡng sinh",
    ],
  },
  {
    id: "the-goi-5",
    category: "the",
    nameVi: "Thẻ gói 5 — Đẳng cấp trải nghiệm",
    priceVnd: k(30000),
    note: "Nạp 30.000.000đ · tặng 15.000.000đ",
    includes: [
      "Tặng +15.000K",
      "+ 05 vé VIP",
      "Ưu tiên đặt lịch",
      "Bữa ăn dưỡng sinh",
    ],
  },
];

/** Alias — 6 hydro only (home poster). */
export const SPA_HYDRO_PACKAGES = SPA_MENU.filter((p) => p.category === "hydro");

/** VIP — amenities + prepaid highlighted */
export const VIP_AMENITIES: {
  id: string;
  nameVi: string;
  blurb: string;
  mark: string;
  bg: string;
  fg: string;
}[] = [
  {
    id: "sauna",
    nameVi: "Sauna / Xông hơi",
    blurb: "Xông hơi ướt · khô trong khu VIP Oasis",
    mark: "SA",
    bg: "#ffedd5",
    fg: "#9a3412",
  },
  {
    id: "jacuzzi",
    nameVi: "Jacuzzi nóng lạnh",
    blurb: "Bồn sục nóng lạnh · hydrotherapy",
    mark: "JC",
    bg: "#ede9fe",
    fg: "#5b21b6",
  },
  {
    id: "mineral-pool",
    nameVi: "Hồ muối khoáng",
    blurb: "Mineral salt pool trong khu VIP",
    mark: "HO",
    bg: "#ccfbf1",
    fg: "#115e59",
  },
  {
    id: "foot-soak",
    nameVi: "Ngâm chân thảo dược",
    blurb: "Herbal foot soak",
    mark: "NC",
    bg: "#dcfce7",
    fg: "#14532d",
  },
];

export const VIP_PREPAID = SPA_MENU.filter((p) => p.category === "the");
export const VIP_DEALS = SPA_MENU.filter((p) => p.category === "uu-dai");
