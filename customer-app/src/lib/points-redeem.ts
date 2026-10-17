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

export function computeGuestPointsRedeem(opts: {
  zoneCode: string;
  tier: number;
  items: { id: string; priceVnd: number; qty: number }[];
}): {
  ok: boolean;
  cost: number;
  discountVnd: number;
  itemId?: string;
  error?: string;
} {
  const zone = String(opts.zoneCode || "").toUpperCase();
  const tier = Math.round(Number(opts.tier) || 0);
  const items = opts.items.filter((i) => i.qty > 0 && i.priceVnd > 0);

  if (tier === REDEEM_TIER_DRINK) {
    const hit = items.find((i) => i.priceVnd <= REDEEM_DRINK_MAX_VND);
    if (!hit) {
      return {
        ok: false,
        cost: tier,
        discountVnd: 0,
        error: "Đổi 50 điểm cần món ≤ 50.000đ trong giỏ (vd. đồ uống Mía Ơi).",
      };
    }
    return {
      ok: true,
      cost: tier,
      discountVnd: hit.priceVnd,
      itemId: hit.id,
    };
  }

  if (tier === REDEEM_TIER_SWIM) {
    if (zone !== "OLYMPIC_POOL" && zone !== "OLYMPIC") {
      return {
        ok: false,
        cost: tier,
        discountVnd: 0,
        error: "Đổi 100 điểm chỉ dùng cho vé bơi Hồ Olympic.",
      };
    }
    const hit = items.find((i) => isSwimTicketId(i.id));
    if (!hit) {
      return {
        ok: false,
        cost: tier,
        discountVnd: 0,
        error: "Chọn vé bơi trong giỏ để đổi 100 điểm.",
      };
    }
    return {
      ok: true,
      cost: tier,
      discountVnd: hit.priceVnd,
      itemId: hit.id,
    };
  }

  return {
    ok: false,
    cost: 0,
    discountVnd: 0,
    error: "Chỉ hỗ trợ đổi 50 hoặc 100 điểm.",
  };
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
    if (tier === 50 || tier === 100) return { tier, cost: tier };
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
