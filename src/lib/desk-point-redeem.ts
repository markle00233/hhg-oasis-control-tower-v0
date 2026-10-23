import { getMiaOiItem } from "@/lib/miaoi-menu";
import { getPoolItem } from "@/lib/olympic-pool-menu";

/** Mía Ơi: mỗi đồ uống = 50 điểm, kể cả món rẻ hơn. */
export const DESK_REDEEM_DRINK_STEP = 50;
/** Hồ Olympic: mỗi vé bơi = 100 điểm. */
export const DESK_REDEEM_SWIM_STEP = 100;

export type DeskRedeemKind = "drink" | "ticket";

export type RedeemableLine = {
  itemId: string;
  qty: number;
  unitPriceVnd: number;
  nameVi?: string;
  nameEn?: string | null;
  pointsDiscountVnd?: number;
  pointsRedeemTier?: number | null;
};

export function deskRedeemStep(kind: DeskRedeemKind) {
  return kind === "ticket" ? DESK_REDEEM_SWIM_STEP : DESK_REDEEM_DRINK_STEP;
}

export function isDeskRedeemDrink(itemId: string) {
  const item = getMiaOiItem(itemId);
  return !!item && item.category !== "topping";
}

export function isDeskRedeemTicket(itemId: string) {
  const item = getPoolItem(itemId);
  return !!item && (item.category === "tre-em" || item.category === "nguoi-lon");
}

export function isDeskRedeemEligible(itemId: string, kind: DeskRedeemKind) {
  return kind === "ticket"
    ? isDeskRedeemTicket(itemId)
    : isDeskRedeemDrink(itemId);
}

export function eligibleDeskRedeemQty(
  items: { itemId: string; qty: number }[],
  kind: DeskRedeemKind
) {
  return items.reduce((n, i) => {
    if (!isDeskRedeemEligible(i.itemId, kind)) return n;
    return n + Math.max(0, Math.round(Number(i.qty) || 0));
  }, 0);
}

/** Gán N suất đổi điểm vào món đắt nhất trước. Mỗi suất = 1 đồ uống / 1 vé. */
export function applyDeskRedeemUnits<T extends RedeemableLine>(
  items: T[],
  units: number,
  kind: DeskRedeemKind
): {
  items: T[];
  unitsApplied: number;
  cost: number;
  discountVnd: number;
} {
  const step = deskRedeemStep(kind);
  const want = Math.max(0, Math.round(Number(units) || 0));
  const next = items.map((i) => ({
    ...i,
    pointsDiscountVnd: Math.max(
      0,
      Math.round(Number(i.pointsDiscountVnd) || 0)
    ),
  }));
  let left = want;
  const ranked = next
    .map((it, index) => ({ it, index }))
    .filter(
      ({ it }) =>
        isDeskRedeemEligible(it.itemId, kind) &&
        it.unitPriceVnd > 0 &&
        it.qty > 0
    )
    .sort((a, b) => b.it.unitPriceVnd - a.it.unitPriceVnd);

  let used = 0;
  for (const { it } of ranked) {
    if (left <= 0) break;
    const coveredQty = Math.min(
      it.qty,
      Math.round(it.pointsDiscountVnd / it.unitPriceVnd)
    );
    const freeQty = Math.max(0, it.qty - coveredQty);
    const take = Math.min(freeQty, left);
    if (take <= 0) continue;
    it.pointsDiscountVnd += take * it.unitPriceVnd;
    it.pointsRedeemTier = step;
    left -= take;
    used += take;
  }

  const discount = next.reduce(
    (s, i) => s + Math.min(i.unitPriceVnd * i.qty, i.pointsDiscountVnd || 0),
    0
  );

  return {
    items: next,
    unitsApplied: used,
    cost: used * step,
    discountVnd: discount,
  };
}

/** Tiền còn lại sau đổi điểm — chỉ phần này được cộng điểm. */
export function earnableVnd(items: RedeemableLine[]) {
  return items.reduce((sum, i) => {
    const gross =
      Math.max(0, Math.round(Number(i.unitPriceVnd) || 0)) *
      Math.max(0, Math.round(Number(i.qty) || 0));
    const disc = Math.min(
      gross,
      Math.max(0, Math.round(Number(i.pointsDiscountVnd) || 0))
    );
    return sum + (gross - disc);
  }, 0);
}

/**
 * Gán đổi điểm từ giỏ QR (pointsRedeemQty / dòng points-redeem-*) lên món.
 * Idempotent — không đè phần đã cover. Dùng trước khi cộng điểm mua hàng.
 */
export function coverDrinkCartPoints<T extends RedeemableLine>(
  orderItems: T[],
  cartItems: unknown,
  kind: DeskRedeemKind = "drink"
): T[] {
  if (!Array.isArray(cartItems) || !orderItems.length) return orderItems;

  const step = deskRedeemStep(kind);
  const legacyPrefix =
    kind === "ticket" ? "points-redeem-100" : "points-redeem-50";
  const byId = new Map<string, number>();
  let explicit = 0;
  let legacyUnits = 0;

  for (const row of cartItems) {
    if (!row || typeof row !== "object") continue;
    const rec = row as {
      id?: string;
      qty?: number;
      pointsRedeemQty?: number;
    };
    const id = String(rec.id || "");
    if (id.startsWith(legacyPrefix)) {
      legacyUnits = Math.max(legacyUnits, Math.round(Number(rec.qty) || 1));
      continue;
    }
    if (
      id.startsWith("points-redeem-") ||
      id.startsWith("voucher-") ||
      id.startsWith("disc-")
    ) {
      continue;
    }
    const qty = Math.max(0, Math.round(Number(rec.qty) || 0));
    const redeemed = Math.min(
      qty,
      Math.max(0, Math.round(Number(rec.pointsRedeemQty) || 0))
    );
    if (redeemed > 0 && isDeskRedeemEligible(id, kind)) {
      byId.set(id, (byId.get(id) || 0) + redeemed);
      explicit += redeemed;
    }
  }

  const next = orderItems.map((line) => ({ ...line }));
  const lineOk = (line: RedeemableLine) =>
    line.unitPriceVnd > 0 &&
    isDeskRedeemEligible(line.itemId, kind) &&
    (kind !== "drink" || line.unitPriceVnd <= 50_000);

  if (explicit > 0) {
    for (const line of next) {
      const want = byId.get(line.itemId) || 0;
      if (want <= 0 || !lineOk(line)) continue;
      const already = Math.min(
        line.qty,
        Math.round((line.pointsDiscountVnd || 0) / line.unitPriceVnd)
      );
      const take = Math.min(line.qty - already, want);
      if (take <= 0) continue;
      line.pointsDiscountVnd =
        (line.pointsDiscountVnd || 0) + take * line.unitPriceVnd;
      line.pointsRedeemTier = step;
      byId.set(line.itemId, want - take);
    }
    return next;
  }

  let left = legacyUnits;
  for (const line of next) {
    if (left <= 0) break;
    if (!lineOk(line)) continue;
    const already = Math.min(
      line.qty,
      Math.round((line.pointsDiscountVnd || 0) / line.unitPriceVnd)
    );
    const take = Math.min(line.qty - already, left);
    if (take <= 0) continue;
    line.pointsDiscountVnd =
      (line.pointsDiscountVnd || 0) + take * line.unitPriceVnd;
    line.pointsRedeemTier = step;
    left -= take;
  }
  return next;
}
