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

/** Cart lines → bill lines. Per-drink `pointsRedeemQty` wins over the summary row. */
export function previewCartPointLines(
  items: {
    id?: string;
    nameVi: string;
    qty: number;
    priceVnd?: number;
    unitPriceVnd?: number;
    pointsRedeemQty?: number;
    pointsDiscountVnd?: number;
    pointsRedeemTier?: number | null;
  }[]
): PointsBillLine[] {
  const list = items.filter((i) => i?.nameVi);
  const explicit = list.some((i) => {
    const id = String(i.id || "");
    if (id.startsWith("points-redeem-") || id.startsWith("voucher-")) return false;
    return Math.round(Number(i.pointsRedeemQty) || 0) > 0;
  });
  return list.flatMap((i) => {
    const id = String(i.id || "");
    if (explicit && id.startsWith("points-redeem-")) return [];
    const unit = Math.max(
      0,
      Math.round(Number(i.unitPriceVnd ?? i.priceVnd) || 0)
    );
    const qty = Math.max(1, Math.round(Number(i.qty) || 1));
    const redeemQty =
      id.startsWith("points-redeem-") || id.startsWith("voucher-")
        ? 0
        : Math.min(qty, Math.max(0, Math.round(Number(i.pointsRedeemQty) || 0)));
    const fromRedeem = redeemQty > 0 ? redeemQty * unit : 0;
    return [
      {
        id,
        nameVi: i.nameVi,
        qty,
        unitPriceVnd: unit,
        pointsDiscountVnd: Math.max(
          fromRedeem,
          Math.max(0, Math.round(Number(i.pointsDiscountVnd) || 0))
        ),
        pointsRedeemTier:
          redeemQty > 0
            ? /^pool-(u13|o13)-(90|unlimited)$/.test(id)
              ? 100
              : 50
            : i.pointsRedeemTier === 50 || i.pointsRedeemTier === 100
              ? i.pointsRedeemTier
              : null,
      },
    ];
  });
}

/** Product lines only. Point rows are removed and applied onto the drinks they pay for. */
export function foldPointsOntoItems(items: PointsBillLine[]): PointsBillView[] {
  const products: PointsBillLine[] = [];
  const redeems: { tier: number; units: number; discountVnd: number }[] = [];

  for (const item of items) {
    if (!item?.nameVi) continue;
    const id = String(item.id || "");
    if (id.startsWith("voucher-")) continue;
    const tier = redeemTierOf(item);
    if (tier === 50 || tier === 100) {
      redeems.push({
        tier,
        units: Math.max(1, Math.round(Number(item.qty) || 1)),
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
    if (redeem.discountVnd > 0 && redeem.units <= 1) {
      const idx = products.findIndex((p, i) => {
        const unit = p.unitPriceVnd;
        const room = unit * p.qty - covered[i];
        if (unit <= 0 || room <= 0) return false;
        if (redeem.tier === 50 && unit > REDEEM_DRINK_MAX_VND) return false;
        return true;
      });
      if (idx < 0) continue;
      const line = products[idx].unitPriceVnd * products[idx].qty;
      covered[idx] = Math.min(line, covered[idx] + redeem.discountVnd);
      if (!products[idx].pointsRedeemTier) {
        products[idx].pointsRedeemTier = redeem.tier;
      }
      continue;
    }
    let left = redeem.units;
    while (left > 0) {
      const idx = products.findIndex((p, i) => {
        const unit = p.unitPriceVnd;
        const room = unit * p.qty - covered[i];
        if (unit <= 0 || room < unit) return false;
        if (redeem.tier === 50 && unit > REDEEM_DRINK_MAX_VND) return false;
        return true;
      });
      if (idx < 0) break;
      const unit = products[idx].unitPriceVnd;
      const roomUnits = Math.floor(
        (unit * products[idx].qty - covered[idx]) / unit
      );
      const take = Math.min(roomUnits, left);
      if (take <= 0) break;
      covered[idx] += take * unit;
      if (!products[idx].pointsRedeemTier) {
        products[idx].pointsRedeemTier = redeem.tier;
      }
      left -= take;
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
