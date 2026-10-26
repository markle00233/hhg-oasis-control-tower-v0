/** Hồ Olympic — vé bơi cho desk zone OLYMPIC_POOL. */

export type PoolMenuItem = {
  id: string;
  category: string;
  nameVi: string;
  nameEn?: string;
  durationMin?: number;
  priceVnd: number;
  priceAltVnd?: number;
  note?: string;
};

export type PoolCategory = {
  id: string;
  nameVi: string;
  nameEn?: string;
};

export const POOL_CATEGORIES: PoolCategory[] = [
  { id: "tre-em", nameVi: "Dưới 1,3m", nameEn: "Under 1.3m" },
  { id: "nguoi-lon", nameVi: "Từ 1,3m", nameEn: "1.3m+" },
  { id: "tu-chon", nameVi: "Lượt tự chọn", nameEn: "Self-choice swim" },
  { id: "goi-thang", nameVi: "Gói tháng", nameEn: "Monthly" },
  { id: "phu-kien", nameVi: "Phụ kiện", nameEn: "Accessories" },
];

/** Bơi tự do trừ 1 lượt tự chọn trên gói bơi học viên. */
export const POOL_SWIM_BONUS_ID = "pool-boi-tu-do";

const k = (n: number) => n * 1000;

export const POOL_MENU: PoolMenuItem[] = [
  {
    id: "pool-u13-90",
    category: "tre-em",
    nameVi: "Vé bơi 90 phút — dưới 1,3m",
    nameEn: "90 min swim · under 1.3m",
    durationMin: 90,
    priceVnd: k(40),
    note: "Trẻ em dưới 1,3m",
  },
  {
    id: "pool-u13-unlimited",
    category: "tre-em",
    nameVi: "Vé bơi không giới hạn — dưới 1,3m",
    nameEn: "Unlimited swim · under 1.3m",
    priceVnd: k(50),
    note: "Trẻ em dưới 1,3m",
  },
  {
    id: "pool-o13-90",
    category: "nguoi-lon",
    nameVi: "Vé bơi 90 phút — từ 1,3m",
    nameEn: "90 min swim · 1.3m+",
    durationMin: 90,
    priceVnd: k(60),
    note: "Từ 1,3m trở lên",
  },
  {
    id: "pool-o13-unlimited",
    category: "nguoi-lon",
    nameVi: "Vé bơi không giới hạn — từ 1,3m",
    nameEn: "Unlimited swim · 1.3m+",
    priceVnd: k(70),
    note: "Từ 1,3m trở lên",
  },
  {
    id: POOL_SWIM_BONUS_ID,
    category: "tu-chon",
    nameVi: "Bơi tự do",
    nameEn: "Self-choice swim",
    priceVnd: 0,
    note: "1 lượt tự chọn của gói bơi",
  },
  {
    id: "oly-1m",
    category: "goi-thang",
    nameVi: "Gói 1 tháng",
    priceVnd: k(700),
    note: "Gội đầu Spa · Mía Ơi −5%",
  },
  {
    id: "oly-3m",
    category: "goi-thang",
    nameVi: "Gói 3 tháng",
    priceVnd: 1_900_000,
    note: "01 massage · 01 voucher LN 100K · Mía Ơi −5%",
  },
  {
    id: "oly-6m",
    category: "goi-thang",
    nameVi: "Gói 6 tháng",
    priceVnd: 3_400_000,
    note: "+1 tháng · 03 massage · 03 voucher LN · Mía Ơi −10%",
  },
  {
    id: "oly-12m",
    category: "goi-thang",
    nameVi: "Gói 12 tháng",
    priceVnd: 5_400_000,
    note: "+2 tháng · 08 massage · 08 voucher LN · Mía Ơi −10%",
  },
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
    note: "1 bộ · 170–230K",
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
    note: "1 bộ",
  },
];

export function formatPoolPrice(item: PoolMenuItem) {
  if (item.priceVnd <= 0) return "0đ";
  if (item.priceAltVnd) {
    return `${Math.round(item.priceVnd / 1000)}–${Math.round(item.priceAltVnd / 1000)}K`;
  }
  return `${Math.round(item.priceVnd / 1000)}K`;
}

export function getPoolItem(id: string) {
  return POOL_MENU.find((i) => i.id === id) || null;
}
