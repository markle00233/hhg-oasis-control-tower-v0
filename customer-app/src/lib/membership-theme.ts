/** Theme dashboard theo gói tháng Olympic. */

export type MembershipTier = 1 | 3 | 6 | 12;

export type MembershipThemeId = "default" | "m1" | "m3" | "m6" | "m12";

export function tierFromPackageId(packageId: string | null | undefined): MembershipTier | null {
  switch (String(packageId || "").trim()) {
    case "oly-1m":
      return 1;
    case "oly-3m":
      return 3;
    case "oly-6m":
      return 6;
    case "oly-12m":
      return 12;
    default:
      return null;
  }
}

export function tierFromPlanLabel(label: string | null | undefined): MembershipTier | null {
  const s = String(label || "");
  if (/12\s*tháng/i.test(s)) return 12;
  if (/6\s*tháng/i.test(s)) return 6;
  if (/3\s*tháng/i.test(s)) return 3;
  if (/1\s*tháng/i.test(s)) return 1;
  return null;
}

export function themeFromTier(tier: MembershipTier | null): MembershipThemeId {
  if (tier === 1) return "m1";
  if (tier === 3) return "m3";
  if (tier === 6) return "m6";
  if (tier === 12) return "m12";
  return "default";
}

export function applyMembershipThemeClass(theme: MembershipThemeId) {
  if (typeof document === "undefined") return;
  const body = document.body;
  body.classList.remove(
    "theme-m1",
    "theme-m3",
    "theme-m6",
    "theme-m12",
    "theme-default"
  );
  body.classList.add(theme === "default" ? "theme-default" : `theme-${theme}`);
}

export const MEMBERSHIP_UPGRADE_COPY: Record<
  MembershipTier,
  {
    title: string;
    payOnce: string;
    monthly: string;
    save?: string;
    perks: string[];
  }
> = {
  1: {
    title: "1 THÁNG",
    payOnce: "700K",
    monthly: "700K",
    perks: ["01 gội đầu Spa 30'", "Giảm giá nước Mía Ơi 5% (trong hạn gói)"],
  },
  3: {
    title: "3 THÁNG",
    payOnce: "1,9tr",
    monthly: "~630K",
    save: "Tiết kiệm 200K",
    perks: [
      "01 massage Spa 45'",
      "01 voucher LN 100K",
      "Giảm giá nước Mía Ơi 5% (trong hạn gói)",
    ],
  },
  6: {
    title: "6 THÁNG",
    payOnce: "3,4tr",
    monthly: "~490K",
    save: "Tiết kiệm 1,5tr",
    perks: [
      "03 massage",
      "03 voucher LN",
      "+01 tháng bơi",
      "Giảm giá nước Mía Ơi 10% (trong hạn gói)",
    ],
  },
  12: {
    title: "12 THÁNG",
    payOnce: "5,4tr",
    monthly: "~390K",
    save: "Tiết kiệm 4,4tr",
    perks: [
      "08 massage",
      "08 voucher LN",
      "+02 tháng bơi",
      "Giảm giá nước Mía Ơi 10% (trong hạn gói)",
    ],
  },
};

export function packageIdFromTier(tier: MembershipTier) {
  return `oly-${tier}m` as const;
}

/** Cart line id for auto VIP Mía discount (must match desk confirm). */
export const MIA_MEMBERSHIP_DISC_PREFIX = "disc-mia-membership";

/** Giảm Mía Ơi theo gói VIP (trong hạn) — không phải voucher. */
export function miaOiDiscountPercentForTier(
  tier: MembershipTier | null | undefined
): number {
  if (tier === 1 || tier === 3) return 5;
  if (tier === 6 || tier === 12) return 10;
  return 0;
}

export function miaOiMembershipDiscountVnd(
  baseVnd: number,
  percent: number
): number {
  const base = Math.max(0, Math.round(Number(baseVnd) || 0));
  const p = Math.min(100, Math.max(0, Math.round(Number(percent) || 0)));
  if (base <= 0 || p <= 0) return 0;
  return Math.round((base * p) / 100);
}

export function isOlympicMembershipPackageId(id: string | null | undefined) {
  return /^oly-\d+m$/i.test(String(id || "").trim());
}

export function cartItemsIncludeMembership(items: unknown): boolean {
  if (!Array.isArray(items)) return false;
  return items.some((row) => {
    if (!row || typeof row !== "object") return false;
    const id = String((row as { id?: string }).id || "");
    const name = String(
      (row as { nameVi?: string }).nameVi ||
        (row as { name?: string }).name ||
        ""
    ).toLowerCase();
    return isOlympicMembershipPackageId(id) || name.includes("nâng cấp");
  });
}
