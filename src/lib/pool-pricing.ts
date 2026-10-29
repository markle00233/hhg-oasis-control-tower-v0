import {
  getPoolItem,
  isVipPoolPackage,
  type PoolMenuItem,
} from "@/lib/olympic-pool-menu";
import { sameDayMembershipDiscountVnd } from "@/lib/same-day-membership";

export type PoolCartLine = { itemId: string; qty: number };

export type PoolPricedLine = {
  itemId: string;
  nameVi: string;
  nameEn: string | null;
  category: string;
  unitPriceVnd: number;
  qty: number;
  lineSubtotalVnd: number;
};

export type PoolPricingResult = {
  lines: PoolPricedLine[];
  subtotalVnd: number;
  accessorySubtotalVnd: number;
  accessoryQty: number;
  /** −10% phần phụ kiện khi ≥2 món phụ kiện */
  accessoryDiscountVnd: number;
  membershipSubtotalVnd: number;
  /** −10% gói tháng khi đã có đơn vé bơi cùng ngày */
  membershipDiscountVnd: number;
  /** Giảm tay (staff), ≥0 */
  manualDiscountVnd: number;
  totalVnd: number;
};

/** Mua ≥2 phụ kiện (category phu-kien) → −10% phần phụ kiện. */
export function computePoolPricing(
  rawLines: PoolCartLine[],
  opts?: { manualDiscountVnd?: number; sameDayMembership?: boolean }
): PoolPricingResult {
  const lines: PoolPricedLine[] = [];
  let accessorySubtotalVnd = 0;
  let accessoryQty = 0;
  let membershipSubtotalVnd = 0;
  let subtotalVnd = 0;

  for (const line of rawLines) {
    const qty = Math.min(Math.max(Number(line.qty) || 0, 0), 99);
    if (qty < 1) continue;
    const item = getPoolItem(String(line.itemId || "")) as PoolMenuItem | null;
    if (!item) continue;
    const lineSubtotalVnd = item.priceVnd * qty;
    subtotalVnd += lineSubtotalVnd;
    if (item.category === "phu-kien") {
      accessorySubtotalVnd += lineSubtotalVnd;
      accessoryQty += qty;
    }
    if (item.category === "goi-thang" && !isVipPoolPackage(item.id)) {
      membershipSubtotalVnd += lineSubtotalVnd;
    }
    lines.push({
      itemId: item.id,
      nameVi: item.nameVi,
      nameEn: item.nameEn || null,
      category: item.category,
      unitPriceVnd: item.priceVnd,
      qty,
      lineSubtotalVnd,
    });
  }

  const accessoryDiscountVnd =
    accessoryQty >= 2 ? Math.round(accessorySubtotalVnd * 0.1) : 0;
  const membershipDiscountVnd = opts?.sameDayMembership
    ? sameDayMembershipDiscountVnd(membershipSubtotalVnd)
    : 0;
  const afterPromo = Math.max(
    0,
    subtotalVnd - accessoryDiscountVnd - membershipDiscountVnd
  );
  const manualRaw = Math.max(0, Math.round(Number(opts?.manualDiscountVnd) || 0));
  const manualDiscountVnd = Math.min(manualRaw, afterPromo);
  const totalVnd = Math.max(0, afterPromo - manualDiscountVnd);

  return {
    lines,
    subtotalVnd,
    accessorySubtotalVnd,
    accessoryQty,
    accessoryDiscountVnd,
    membershipSubtotalVnd,
    membershipDiscountVnd,
    manualDiscountVnd,
    totalVnd,
  };
}
