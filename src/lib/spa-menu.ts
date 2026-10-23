/** HHG Oasis Spa — menu quầy (PDF + poster gói đang chạy). */

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
  { id: "gio-vang", nameVi: "00 · Giờ Vàng Oasis", nameEn: "Golden hour" },
  { id: "goi-nhom", nameVi: "00b · Gói nhóm", nameEn: "Group packages" },
  { id: "goi-duong", nameVi: "01 · Oasis Gội dưỡng", nameEn: "Hair wash" },
  { id: "duong-sinh", nameVi: "02 · Oasis Dưỡng sinh", nameEn: "Wellness" },
  { id: "foot", nameVi: "03 · Oasis Dưỡng chân", nameEn: "Foot care" },
  { id: "dich-vu-them", nameVi: "04 · Dịch vụ thêm", nameEn: "Add-ons" },
];

const k = (n: number) => n * 1000;

export const SPA_GOI_BONUS_ID = "goi-30";

export const SPA_MENU: SpaMenuItem[] = [
  // 00 GIỜ VÀNG — T2–T6 · 13:00–16:00 · 199K / suất
  {
    id: "gv-goi-thu-gian",
    category: "gio-vang",
    nameVi: "Giờ Vàng · Oasis Gội thư giãn",
    nameEn: "Golden hour · Relaxing hair wash",
    durationMin: 60,
    priceVnd: k(199),
    note: "T2–T6 · 13:00–16:00 · Sạch da đầu · thư giãn tinh thần · giảm căng thẳng",
  },
  {
    id: "gv-foot-phuc-hoi",
    category: "gio-vang",
    nameVi: "Giờ Vàng · Oasis Foot phục hồi",
    nameEn: "Golden hour · Recovery foot",
    durationMin: 45,
    priceVnd: k(199),
    note: "T2–T6 · 13:00–16:00 · Ấn huyệt · tuần hoàn · giảm mỏi chân",
  },
  {
    id: "gv-duong-sinh",
    category: "gio-vang",
    nameVi: "Giờ Vàng · Oasis Dưỡng sinh",
    nameEn: "Golden hour · Vitality massage",
    durationMin: 45,
    priceVnd: k(199),
    note: "T2–T6 · 13:00–16:00 · Giảm cứng cổ vai · thư giãn · tái tạo năng lượng",
  },

  // 00b GÓI NHÓM (poster đang chạy)
  {
    id: "pkg-date-for-two",
    category: "goi-nhom",
    nameVi: "Wellness Date For Two",
    nameEn: "Couple package · 2 người",
    priceVnd: k(1490),
    note: "Giá lẻ 1.798K → gói 1.490K · Hồ bơi ×2 · Xông hơi ×2 · Ngâm bồn & hồ muối ×2 · Massage chân ×2 · Gội thư giãn ×2",
  },
  {
    id: "pkg-family-retreat",
    category: "goi-nhom",
    nameVi: "Family Wellness Retreat",
    nameEn: "Family package · 4 người",
    priceVnd: k(2990),
    note: "Giá lẻ 3.596K → gói 2.990K · Hồ bơi ×4 · Xông hơi ×4 · Ngâm bồn & hồ muối ×4 · Massage chân ×4 · Tặng 4 gội thư giãn",
  },

  // 01 OASIS GỘI DƯỠNG
  {
    id: SPA_GOI_BONUS_ID,
    category: "goi-duong",
    nameVi: "Gội 30'",
    nameEn: "Complimentary 30' wash",
    durationMin: 30,
    priceVnd: 0,
    note: "1 lượt tự chọn của học viên",
  },
  {
    id: "goi-sau-the-thao",
    category: "goi-duong",
    nameVi: "Oasis Gội sạch sau vận động thể thao",
    nameEn: "Clean wash after sport",
    durationMin: 30,
    priceVnd: k(89),
    note: "Gội sạch, xả dưỡng · loại clo · tẩy trang, rửa mặt, cấp ẩm",
  },
  {
    id: "goi-thu-gian-duong-sinh",
    category: "goi-duong",
    nameVi: "Oasis Gội thư giãn dưỡng sinh",
    nameEn: "Relaxing wellness shampoo",
    durationMin: 60,
    priceVnd: k(249),
    note: "Massage da đầu · cổ vai gáy · chăm sóc da mặt cơ bản",
  },
  {
    id: "goi-toan-dien",
    category: "goi-duong",
    nameVi: "Oasis Gội chăm sóc toàn diện tóc và da mặt",
    nameEn: "Full hair & face care",
    durationMin: 90,
    priceVnd: k(349),
    note: "Tẩy da chết mặt · ủ dưỡng tóc thảo dược · massage đầu",
  },

  // 02 OASIS DƯỠNG SINH
  {
    id: "ds-dau-co-vai",
    category: "duong-sinh",
    nameVi: "Oasis Dưỡng sinh đầu cổ vai giảm căng thẳng",
    nameEn: "Head–neck–shoulder release",
    durationMin: 45,
    priceVnd: k(249),
    priceAltVnd: k(399),
    note: "45–60′ · Giải cảm +150K",
  },
  {
    id: "ds-toan-than",
    category: "duong-sinh",
    nameVi: "Oasis Dưỡng sinh toàn thân thư giãn sâu",
    nameEn: "Full-body deep relax",
    durationMin: 60,
    priceVnd: k(349),
    priceAltVnd: k(449),
    note: "60′ · Trị liệu +100K",
  },
  {
    id: "ds-co-vai-gay-lung",
    category: "duong-sinh",
    nameVi: "Oasis Dưỡng sinh cổ vai gáy lưng giảm đau mỏi",
    nameEn: "Neck–shoulder–back relief",
    durationMin: 90,
    priceVnd: k(449),
    priceAltVnd: k(549),
    note: "90′ · Trị liệu +100K",
  },
  {
    id: "ds-phuc-hoi-lieu-phap",
    category: "duong-sinh",
    nameVi: "Oasis Dưỡng sinh phục hồi toàn thân bằng liệu pháp",
    nameEn: "Full-body recovery therapy",
    durationMin: 90,
    priceVnd: k(649),
    priceAltVnd: k(749),
    note: "90–120′",
  },

  // 03 OASIS DƯỠNG CHÂN
  {
    id: "foot-tinh-dau",
    category: "foot",
    nameVi: "Oasis Foot thư giãn với tinh dầu",
    nameEn: "Foot relax with essential oil",
    durationMin: 30,
    priceVnd: k(189),
  },
  {
    id: "foot-an-huyet",
    category: "foot",
    nameVi: "Oasis Foot phục hồi ấn huyệt bàn chân",
    nameEn: "Foot reflexology recovery",
    durationMin: 45,
    priceVnd: k(249),
  },
  {
    id: "foot-chuyen-sau",
    category: "foot",
    nameVi: "Oasis Foot chuyên sâu ấn huyệt và tẩy tế bào chết",
    nameEn: "Deep foot reflexology + scrub",
    durationMin: 60,
    priceVnd: k(349),
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

export function formatVnd(n: number) {
  if (n <= 0) return "—";
  return new Intl.NumberFormat("vi-VN").format(n) + "đ";
}

export function formatSpaPrice(item: SpaMenuItem) {
  if (item.id === SPA_GOI_BONUS_ID) return "0đ";
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
