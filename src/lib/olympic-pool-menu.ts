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
];

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
];

export function formatPoolPrice(item: PoolMenuItem) {
  if (item.priceVnd <= 0) return "—";
  return `${Math.round(item.priceVnd / 1000)}K`;
}

export function getPoolItem(id: string) {
  return POOL_MENU.find((i) => i.id === id) || null;
}
