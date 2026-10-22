/** Client-safe rules đổi điểm (không import Prisma). */

export const REDEEM_TIER_DRINK = 50;
export const REDEEM_TIER_SWIM = 100;
export const REDEEM_DRINK_MAX_VND = 50_000;

const SWIM_TICKET_IDS = new Set([
  "pool-u13-90",
  "pool-u13-unlimited",
  "pool-o13-90",
  "pool-o13-unlimited",
]);

export function isSwimTicketId(id: string) {
  return SWIM_TICKET_IDS.has(id);
}

export type GuestRedeemItem = {
  id: string;
  priceVnd: number;
  qty: number;
  /** Số ly của dòng này trả bằng điểm. Bỏ trống thì dùng `units`. */
  redeemQty?: number;
};

export type GuestRedeemAllocation = {
  index: number;
  id: string;
  redeemQty: number;
  discountVnd: number;
};

function redeemFail(error: string): {
  ok: false;
  cost: number;
  discountVnd: number;
  units: number;
  allocations: GuestRedeemAllocation[];
  error: string;
} {
  return {
    ok: false,
    cost: 0,
    discountVnd: 0,
    units: 0,
    allocations: [],
    error,
  };
}

function drinkEligible(item: { priceVnd: number; qty: number }) {
  return item.qty > 0 && item.priceVnd > 0 && item.priceVnd <= REDEEM_DRINK_MAX_VND;
}

export function computeGuestPointsRedeem(opts: {
  zoneCode: string;
  tier: number;
  items: GuestRedeemItem[];
  /** Số ly đổi khi từng dòng không gửi redeemQty. Mặc định 1. */
  units?: number;
}): {
  ok: boolean;
  cost: number;
  discountVnd: number;
  units: number;
  itemId?: string;
  allocations: GuestRedeemAllocation[];
  error?: string;
} {
  const zone = String(opts.zoneCode || "").toUpperCase();
  const tier = Math.round(Number(opts.tier) || 0);
  const items = opts.items.map((i) => ({
    id: String(i.id || ""),
    priceVnd: Math.max(0, Math.round(Number(i.priceVnd) || 0)),
    qty: Math.min(20, Math.max(0, Math.round(Number(i.qty) || 0))),
    redeemQty: Math.max(0, Math.round(Number(i.redeemQty) || 0)),
  }));

  if (tier === REDEEM_TIER_DRINK) {
    const explicit = items.some((i) => i.redeemQty > 0);
    const allocations: GuestRedeemAllocation[] = [];

    if (explicit) {
      for (let index = 0; index < items.length; index++) {
        const item = items[index];
        const want = item.redeemQty;
        if (want <= 0) continue;
        if (!drinkEligible(item)) {
          return redeemFail(
            "Đổi 50 điểm chỉ áp dụng cho món ≤ 50.000đ."
          );
        }
        if (want > item.qty) {
          return redeemFail("Không đổi quá số ly đang gọi.");
        }
        allocations.push({
          index,
          id: item.id,
          redeemQty: want,
          discountVnd: want * item.priceVnd,
        });
      }
    } else {
      let left = Math.max(1, Math.round(Number(opts.units) || 1));
      for (let index = 0; index < items.length && left > 0; index++) {
        const item = items[index];
        if (!drinkEligible(item)) continue;
        const take = Math.min(item.qty, left);
        allocations.push({
          index,
          id: item.id,
          redeemQty: take,
          discountVnd: take * item.priceVnd,
        });
        left -= take;
      }
      if (left > 0) {
        return redeemFail(
          allocations.length
            ? "Không đủ số ly trong giỏ để đổi điểm."
            : "Đổi 50 điểm cần món ≤ 50.000đ trong giỏ (vd. đồ uống Mía Ơi)."
        );
      }
    }

    const units = allocations.reduce((s, a) => s + a.redeemQty, 0);
    if (units <= 0) {
      return redeemFail(
        "Đổi 50 điểm cần món ≤ 50.000đ trong giỏ (vd. đồ uống Mía Ơi)."
      );
    }
    return {
      ok: true,
      cost: units * REDEEM_TIER_DRINK,
      discountVnd: allocations.reduce((s, a) => s + a.discountVnd, 0),
      units,
      itemId: allocations[0]?.id,
      allocations,
    };
  }

  if (tier === REDEEM_TIER_SWIM) {
    if (zone !== "OLYMPIC_POOL" && zone !== "OLYMPIC") {
      return redeemFail("Đổi 100 điểm chỉ dùng cho vé bơi Hồ Olympic.");
    }
    const explicit = items.some((i) => i.redeemQty > 0);
    const allocations: GuestRedeemAllocation[] = [];
    const ticketOk = (item: { id: string; priceVnd: number; qty: number }) =>
      item.qty > 0 && item.priceVnd > 0 && isSwimTicketId(item.id);

    if (explicit) {
      for (let index = 0; index < items.length; index++) {
        const item = items[index];
        const want = item.redeemQty;
        if (want <= 0) continue;
        if (!ticketOk(item)) {
          return redeemFail("Đổi 100 điểm chỉ áp dụng cho vé bơi.");
        }
        if (want > item.qty) {
          return redeemFail("Không đổi quá số vé đang mua.");
        }
        allocations.push({
          index,
          id: item.id,
          redeemQty: want,
          discountVnd: want * item.priceVnd,
        });
      }
    } else {
      let left = Math.max(1, Math.round(Number(opts.units) || 1));
      for (let index = 0; index < items.length && left > 0; index++) {
        const item = items[index];
        if (!ticketOk(item)) continue;
        const take = Math.min(item.qty, left);
        allocations.push({
          index,
          id: item.id,
          redeemQty: take,
          discountVnd: take * item.priceVnd,
        });
        left -= take;
      }
      if (left > 0) {
        return redeemFail(
          allocations.length
            ? "Không đủ số vé trong giỏ để đổi điểm."
            : "Chọn vé bơi trong giỏ để đổi 100 điểm."
        );
      }
    }

    const units = allocations.reduce((s, a) => s + a.redeemQty, 0);
    if (units <= 0) {
      return redeemFail("Chọn vé bơi trong giỏ để đổi 100 điểm.");
    }
    return {
      ok: true,
      cost: units * REDEEM_TIER_SWIM,
      discountVnd: allocations.reduce((s, a) => s + a.discountVnd, 0),
      units,
      itemId: allocations[0]?.id,
      allocations,
    };
  }

  return redeemFail("Chỉ hỗ trợ đổi 50 hoặc 100 điểm.");
}

export function parsePointsRedeemFromCartItems(
  items: unknown
): { tier: number; cost: number } | null {
  if (!Array.isArray(items)) return null;
  for (const row of items) {
    if (!row || typeof row !== "object") continue;
    const id = String((row as { id?: string }).id || "");
    if (!id.startsWith("points-redeem-")) continue;
    const tier = Math.round(Number(id.replace("points-redeem-", "")) || 0);
    if (tier === 50 || tier === 100) {
      const units = Math.max(
        1,
        Math.round(Number((row as { qty?: number }).qty) || 1)
      );
      return { tier, cost: tier * units };
    }
  }
  return null;
}

export function cartHasVoucherItem(items: unknown): boolean {
  if (!Array.isArray(items)) return false;
  return items.some((row) => {
    if (!row || typeof row !== "object") return false;
    const id = String((row as { id?: string }).id || "");
    return id.startsWith("voucher-");
  });
}
