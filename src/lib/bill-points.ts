/** Fold a “Đổi 50/100 điểm” row onto the drink or ticket it pays for. */

export const REDEEM_DRINK_MAX_VND = 50_000;

export type PointsBillLine = {
  id?: string;
  nameVi: string;
  qty: number;
  unitPriceVnd: number;
  pointsDiscountVnd?: number;
  pointsRedeemTier?: number | null;
};

export type PointsBillView = {
  key: string;
  nameVi: string;
  qty: number;
  /** Line total after the point discount. */
  netVnd: number;
  pointsLabel: string | null;
};

const REDEEM_NAME = /^Đổi\s*(50|100)\s*điểm$/i;

function redeemTierOf(item: PointsBillLine) {
  const id = String(item.id || "");
  if (id.startsWith("points-redeem-")) {
    const tier = Math.round(Number(id.slice("points-redeem-".length)) || 0);
    if (tier === 50 || tier === 100) return tier;
  }
  const named = String(item.nameVi || "").match(REDEEM_NAME);
  if (named) {
    const tier = Number(named[1]);
    if (tier === 50 || tier === 100) return tier;
  }
  return 0;
}

/** Product lines only. Point rows are removed and applied to one unit of the matching item. */
export function foldPointsOntoItems(items: PointsBillLine[]): PointsBillView[] {
  const products: PointsBillLine[] = [];
  const redeems: { tier: number; discountVnd: number }[] = [];

  for (const item of items) {
    if (!item?.nameVi) continue;
    const id = String(item.id || "");
    if (id.startsWith("voucher-")) continue;
    const tier = redeemTierOf(item);
    if (tier === 50 || tier === 100) {
      redeems.push({
        tier,
        discountVnd: Math.max(0, Math.round(Number(item.pointsDiscountVnd) || 0)),
      });
      continue;
    }
    products.push({
      ...item,
      qty: Math.max(1, Math.round(Number(item.qty) || 1)),
      unitPriceVnd: Math.max(0, Math.round(Number(item.unitPriceVnd) || 0)),
      pointsDiscountVnd: Math.max(
        0,
        Math.round(Number(item.pointsDiscountVnd) || 0)
      ),
      pointsRedeemTier:
        item.pointsRedeemTier === 50 || item.pointsRedeemTier === 100
          ? item.pointsRedeemTier
          : null,
    });
  }

  const covered = products.map((p) =>
    Math.min(p.unitPriceVnd * p.qty, p.pointsDiscountVnd || 0)
  );

  for (const redeem of redeems) {
    const idx = products.findIndex((p, i) => {
      const unit = p.unitPriceVnd;
      const room = unit * p.qty - covered[i];
      if (unit <= 0 || room <= 0) return false;
      if (redeem.tier === 50 && unit > REDEEM_DRINK_MAX_VND) return false;
      return true;
    });
    if (idx < 0) continue;
    const unit = products[idx].unitPriceVnd;
    const add = redeem.discountVnd > 0 ? redeem.discountVnd : unit;
    const line = unit * products[idx].qty;
    covered[idx] = Math.min(line, covered[idx] + add);
    if (!products[idx].pointsRedeemTier) {
      products[idx].pointsRedeemTier = redeem.tier;
    }
  }

  return products.map((p, i) => {
    const line = p.unitPriceVnd * p.qty;
    const net = Math.max(0, line - covered[i]);
    const tier = p.pointsRedeemTier;
    const unitsCovered =
      p.unitPriceVnd > 0
        ? Math.min(p.qty, Math.round(covered[i] / p.unitPriceVnd))
        : 0;
    const pointsUsed =
      unitsCovered > 0 && (tier === 50 || tier === 100)
        ? unitsCovered * tier
        : 0;
    return {
      key: `${p.id || p.nameVi}-${i}`,
      nameVi: p.nameVi,
      qty: p.qty,
      netVnd: net,
      pointsLabel: pointsUsed > 0 ? `Đổi ${pointsUsed} điểm` : null,
    };
  });
}
