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

/** 2.700.000đ → 2tr700k. Under 1.000.000đ stays 700K. */
export function formatVndCompact(vnd: number) {
  const n = Math.max(0, Math.round(Number(vnd) || 0));
  if (n >= 1_000_000) {
    const tr = Math.floor(n / 1_000_000);
    const rest = Math.round((n % 1_000_000) / 1000);
    return rest > 0 ? `${tr}tr${rest}k` : `${tr}tr`;
  }
  return `${Math.round(n / 1000)}K`;
}

export function formatPkgPriceShort(p: {
  priceVnd: number;
  priceAltVnd?: number;
}) {
  if (p.priceVnd <= 0) return "Theo gói";
  if (p.priceAltVnd && p.priceVnd < 1_000_000 && p.priceAltVnd < 1_000_000) {
    return `${Math.round(p.priceVnd / 1000)}–${Math.round(p.priceAltVnd / 1000)}K`;
  }
  if (p.priceAltVnd) {
    return `${formatVndCompact(p.priceVnd)}–${formatVndCompact(p.priceAltVnd)}`;
  }
  return formatVndCompact(p.priceVnd);
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
    includes: [
      "01 gội đầu Spa 30'",
      "Giảm giá nước Mía Ơi 5% (trong hạn gói)",
    ],
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
      "Giảm giá nước Mía Ơi 5% (trong hạn gói)",
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
      "Giảm giá nước Mía Ơi 10% (trong hạn gói)",
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
      "Giảm giá nước Mía Ơi 10% (trong hạn gói)",
    ],
  },
];

/** Hồ VIP — vé lẻ + gói. Giá khớp menu quầy. */
export const OLYMPIC_VIP_TICKETS: ServicePackage[] = [
  {
    id: "vip-u13-day",
    category: "vip",
    nameVi: "Vé lẻ VIP — dưới 1,3m",
    priceVnd: 300_000,
    note: "Trẻ em · không giới hạn thời gian",
  },
  {
    id: "vip-o13-day",
    category: "vip",
    nameVi: "Vé lẻ VIP — từ 1,3m",
    priceVnd: 379_000,
    note: "Người lớn · không giới hạn thời gian",
  },
];

const VIP_TERM_NOTE = "Tổng phí cả kỳ hạn";

function vipPackage(
  months: 1 | 3 | 6 | 12,
  who: "child" | "adult",
  priceVnd: number
): ServicePackage {
  return {
    id: `vip-${months}m-${who}`,
    category: "vip",
    nameVi: `Gói VIP ${months} tháng — ${who === "child" ? "trẻ em" : "người lớn"}`,
    priceVnd,
    note: VIP_TERM_NOTE,
  };
}

export const OLYMPIC_VIP_PACKAGES: ServicePackage[] = [
  vipPackage(1, "child", 1_000_000),
  vipPackage(1, "adult", 1_300_000),
  vipPackage(3, "child", 2_700_000),
  vipPackage(3, "adult", 3_400_000),
  vipPackage(6, "child", 4_800_000),
  vipPackage(6, "adult", 6_000_000),
  vipPackage(12, "child", 7_700_000),
  vipPackage(12, "adult", 9_600_000),
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

export const OLYMPIC_ORDER_CATALOG = [
  ...OLYMPIC_PACKAGES,
  ...OLYMPIC_MONTHLY,
  ...OLYMPIC_VIP_TICKETS,
  ...OLYMPIC_VIP_PACKAGES,
  ...OLYMPIC_ACCESSORIES,
];

const olympicOrderById = new Map(
  OLYMPIC_ORDER_CATALOG.map((item) => [item.id, item])
);

/** Official menu row for a customer Olympic / VIP order line. */
export function officialOlympicOrderItem(id: string) {
  return olympicOrderById.get(id) || null;
}

/** Gói tháng Olympic và gói VIP: một gói mỗi dòng. */
export function olympicOrderQtyLocked(id: string) {
  return /^oly-\d+m$/i.test(id) || /^vip-\d+m-(child|adult)$/.test(id);
}

/** Spa — PDF menu + poster đang chạy (Giờ Vàng · Date · Family). Chỉ bán dịch vụ, không đặt giường. */
export const SPA_CATEGORIES: CatalogCategory[] = [
  { id: "gio-vang", nameVi: "00 · Giờ Vàng Oasis" },
  { id: "goi-nhom", nameVi: "00b · Gói nhóm" },
  { id: "goi-duong", nameVi: "01 · Oasis Gội dưỡng" },
  { id: "duong-sinh", nameVi: "02 · Oasis Dưỡng sinh" },
  { id: "foot", nameVi: "03 · Oasis Dưỡng chân" },
  { id: "dich-vu-them", nameVi: "04 · Dịch vụ thêm" },
];

export const SPA_MENU: ServicePackage[] = [
  // 00 GIỜ VÀNG — T2–T6 · 13:00–16:00 · 199K
  {
    id: "gv-goi-thu-gian",
    category: "gio-vang",
    nameVi: "Giờ Vàng · Oasis Gội thư giãn",
    nameEn: "60′ · 199K",
    durationMin: 60,
    priceVnd: k(199),
    note: "T2–T6 · 13:00–16:00",
    includes: [
      "Sạch da đầu · tóc khoẻ",
      "Thư giãn tinh thần",
      "Giảm căng thẳng hiệu quả",
    ],
    image:
      "https://images.unsplash.com/photo-1519823551278-64ac927cff56?auto=format&fit=crop&w=800&q=60",
  },
  {
    id: "gv-foot-phuc-hoi",
    category: "gio-vang",
    nameVi: "Giờ Vàng · Oasis Foot phục hồi",
    nameEn: "45′ · 199K",
    durationMin: 45,
    priceVnd: k(199),
    note: "T2–T6 · 13:00–16:00",
    includes: [
      "Phục hồi sau vận động",
      "Hỗ trợ tuần hoàn",
      "Giảm mỏi chân",
    ],
    image:
      "https://images.unsplash.com/photo-1519415387720-a4b0c40c63df?auto=format&fit=crop&w=800&q=60",
  },
  {
    id: "gv-duong-sinh",
    category: "gio-vang",
    nameVi: "Giờ Vàng · Oasis Dưỡng sinh",
    nameEn: "45′ · 199K",
    durationMin: 45,
    priceVnd: k(199),
    note: "T2–T6 · 13:00–16:00",
    includes: [
      "Giảm cứng cổ vai",
      "Thư giãn cơ thể",
      "Tái tạo năng lượng",
    ],
    image:
      "https://images.unsplash.com/photo-1540555700478-4be289fbecef?auto=format&fit=crop&w=800&q=60",
  },

  // 00b GÓI NHÓM
  {
    id: "pkg-date-for-two",
    category: "goi-nhom",
    nameVi: "Wellness Date For Two",
    nameEn: "2 người · 1.490K",
    priceVnd: k(1490),
    note: "Giá lẻ 1.798K · tiết kiệm 308K",
    includes: [
      "Hồ bơi ×2",
      "Xông hơi ×2",
      "Ngâm bồn & hồ muối ×2",
      "Massage chân ×2",
      "Gội đầu thư giãn ×2",
    ],
    image:
      "https://images.unsplash.com/photo-1571902943202-507ec2618e8f?auto=format&fit=crop&w=800&q=60",
  },
  {
    id: "pkg-family-retreat",
    category: "goi-nhom",
    nameVi: "Family Wellness Retreat",
    nameEn: "4 người · 2.990K",
    priceVnd: k(2990),
    note: "Giá lẻ 3.596K · tiết kiệm 606K",
    includes: [
      "Hồ bơi ×4",
      "Xông hơi ×4",
      "Ngâm bồn & hồ muối ×4",
      "Massage chân ×4",
      "Tặng 4 gội đầu thư giãn",
    ],
    image:
      "https://images.unsplash.com/photo-1576013551627-0cc20b96c2a7?auto=format&fit=crop&w=800&q=60",
  },

  // 01 OASIS GỘI DƯỠNG
  {
    id: "goi-sau-the-thao",
    category: "goi-duong",
    nameVi: "Oasis Gội sạch sau vận động thể thao",
    nameEn: "Sau bơi / Pickleball",
    durationMin: 30,
    priceVnd: k(89),
    note: "Gội sạch, xả dưỡng · loại clo · tẩy trang, rửa mặt, cấp ẩm",
    includes: ["Gội sạch sau thể thao", "Xả dưỡng tóc", "Tẩy trang · rửa mặt"],
    image:
      "https://images.unsplash.com/photo-1544161515-4ab6ce6db874?auto=format&fit=crop&w=800&q=60",
  },
  {
    id: "goi-thu-gian-duong-sinh",
    category: "goi-duong",
    nameVi: "Oasis Gội thư giãn dưỡng sinh",
    nameEn: "Thư giãn sâu · giảm căng thẳng",
    durationMin: 60,
    priceVnd: k(249),
    note: "Massage da đầu · cổ vai gáy · chăm sóc da mặt cơ bản",
    includes: ["Massage da đầu", "Cổ vai gáy", "Chăm sóc da mặt cơ bản"],
    image:
      "https://images.unsplash.com/photo-1519823551278-64ac927cff56?auto=format&fit=crop&w=800&q=60",
  },
  {
    id: "goi-toan-dien",
    category: "goi-duong",
    nameVi: "Oasis Gội chăm sóc toàn diện tóc và da mặt",
    nameEn: "Tóc + da mặt chuyên sâu",
    durationMin: 90,
    priceVnd: k(349),
    note: "Tẩy da chết mặt · ủ dưỡng tóc thảo dược · massage đầu",
    includes: [
      "Tẩy da chết mặt",
      "Ủ dưỡng tóc thảo dược",
      "Massage đầu · cổ vai gáy",
    ],
    image:
      "https://images.unsplash.com/photo-1600334129128-685c5582fd35?auto=format&fit=crop&w=800&q=60",
  },

  // 02 OASIS DƯỠNG SINH
  {
    id: "ds-dau-co-vai",
    category: "duong-sinh",
    nameVi: "Oasis Dưỡng sinh đầu cổ vai giảm căng thẳng",
    durationMin: 45,
    priceVnd: k(249),
    priceAltVnd: k(399),
    note: "45–60′ · Giải cảm +150K",
    image:
      "https://images.unsplash.com/photo-1540555700478-4be289fbecef?auto=format&fit=crop&w=800&q=60",
  },
  {
    id: "ds-toan-than",
    category: "duong-sinh",
    nameVi: "Oasis Dưỡng sinh toàn thân thư giãn sâu",
    durationMin: 60,
    priceVnd: k(349),
    priceAltVnd: k(449),
    note: "60′ · Trị liệu +100K",
    image:
      "https://images.unsplash.com/photo-1519823551278-64ac927cff56?auto=format&fit=crop&w=800&q=60",
  },
  {
    id: "ds-co-vai-gay-lung",
    category: "duong-sinh",
    nameVi: "Oasis Dưỡng sinh cổ vai gáy lưng giảm đau mỏi",
    durationMin: 90,
    priceVnd: k(449),
    priceAltVnd: k(549),
    note: "90′ · Trị liệu +100K",
    image:
      "https://images.unsplash.com/photo-1600334129128-685c5582fd35?auto=format&fit=crop&w=800&q=60",
  },
  {
    id: "ds-phuc-hoi-lieu-phap",
    category: "duong-sinh",
    nameVi: "Oasis Dưỡng sinh phục hồi toàn thân bằng liệu pháp",
    durationMin: 90,
    priceVnd: k(649),
    priceAltVnd: k(749),
    note: "90–120′",
    image:
      "https://images.unsplash.com/photo-1571902943202-507ec2618e8f?auto=format&fit=crop&w=800&q=60",
  },

  // 03 OASIS DƯỠNG CHÂN
  {
    id: "foot-tinh-dau",
    category: "foot",
    nameVi: "Oasis Foot thư giãn với tinh dầu",
    durationMin: 30,
    priceVnd: k(189),
    image:
      "https://images.unsplash.com/photo-1519415387720-a4b0c40c63df?auto=format&fit=crop&w=800&q=60",
  },
  {
    id: "foot-an-huyet",
    category: "foot",
    nameVi: "Oasis Foot phục hồi ấn huyệt bàn chân",
    durationMin: 45,
    priceVnd: k(249),
    image:
      "https://images.unsplash.com/photo-1519415387720-a4b0c40c63df?auto=format&fit=crop&w=800&q=60",
  },
  {
    id: "foot-chuyen-sau",
    category: "foot",
    nameVi: "Oasis Foot chuyên sâu ấn huyệt và tẩy tế bào chết",
    durationMin: 60,
    priceVnd: k(349),
    image:
      "https://images.unsplash.com/photo-1519415387720-a4b0c40c63df?auto=format&fit=crop&w=800&q=60",
  },

  // 04 DỊCH VỤ THÊM
  {
    id: "addon-toc-noi-dai",
    category: "dich-vu-them",
    nameVi: "Tóc nối / tóc dài dày qua thắt lưng eo",
    priceVnd: k(60),
  },
  {
    id: "addon-mat-na-b5",
    category: "dich-vu-them",
    nameVi: "Mặt nạ B5 phục hồi da",
    priceVnd: k(40),
  },
  {
    id: "addon-tay-te-bao-chet-da-dau",
    category: "dich-vu-them",
    nameVi: "Tẩy tế bào chết da đầu",
    priceVnd: k(40),
  },
  {
    id: "addon-cao-gio-dau-mat",
    category: "dich-vu-them",
    nameVi: "Cạo gió vùng đầu mặt",
    priceVnd: k(89),
  },
  {
    id: "addon-massage-mat-tinh-dau",
    category: "dich-vu-them",
    nameVi: "Massage mặt bằng tinh dầu (Hạt Nho / JoJoBa)",
    priceVnd: k(80),
  },
  {
    id: "addon-massage-kem-vitamin-e",
    category: "dich-vu-them",
    nameVi: "Massage kem Vitamin E",
    priceVnd: k(70),
  },
  {
    id: "addon-massage-mat-da-nong",
    category: "dich-vu-them",
    nameVi: "Massage mắt bằng đá nóng",
    priceVnd: k(60),
  },
  {
    id: "addon-giac-hoi-cao-gio",
    category: "dich-vu-them",
    nameVi: "Giác hơi / Cạo gió",
    priceVnd: k(99),
  },
];

/** @deprecated Hydro gói đã gỡ khỏi menu Spa mới — giữ export rỗng để không vỡ import. */
export const SPA_HYDRO_PACKAGES: ServicePackage[] = [];

/** VIP — amenities + prepaid / deals (không nằm trong PDF Spa menu). */
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

export const VIP_DEALS: ServicePackage[] = [
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
];

export const VIP_PREPAID: ServicePackage[] = [
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
