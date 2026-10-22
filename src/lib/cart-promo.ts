/** Parse voucher / đổi điểm từ items JSON của AppServiceCart. */

export function parseCartPromo(items: unknown): {
  hasVoucher: boolean;
  hasPointsRedeem: boolean;
  pointsTier: number | null;
  label: string;
} {
  let hasVoucher = false;
  let pointsTier: number | null = null;
  let pointsCost = 0;
  if (Array.isArray(items)) {
    for (const row of items) {
      if (!row || typeof row !== "object") continue;
      const id = String((row as { id?: string }).id || "");
      if (id.startsWith("voucher-")) hasVoucher = true;
      if (id.startsWith("points-redeem-")) {
        const t = Math.round(Number(id.replace("points-redeem-", "")) || 0);
        if (t === 50 || t === 100) {
          pointsTier = t;
          const units = Math.max(
            1,
            Math.round(Number((row as { qty?: number }).qty) || 1)
          );
          pointsCost = t * units;
        }
      }
    }
  }
  const hasPointsRedeem = pointsTier != null;
  const parts: string[] = [];
  if (hasVoucher) parts.push("Voucher");
  if (hasPointsRedeem) parts.push(`Đổi ${pointsCost} điểm`);
  return {
    hasVoucher,
    hasPointsRedeem,
    pointsTier,
    label: parts.length ? parts.join(" · ") : "—",
  };
}
