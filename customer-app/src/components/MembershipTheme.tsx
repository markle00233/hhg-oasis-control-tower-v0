"use client";

import { useEffect } from "react";
import {
  applyMembershipThemeClass,
  themeFromTier,
  tierFromPackageId,
  tierFromPlanLabel,
  type MembershipTier,
} from "@/lib/membership-theme";

/** Áp class theme lên body theo gói VIP đang active. */
export function MembershipTheme({
  vip,
  vipPlanLabel,
  packageId,
}: {
  vip?: boolean;
  vipPlanLabel?: string | null;
  packageId?: string | null;
}) {
  useEffect(() => {
    let tier: MembershipTier | null = null;
    if (vip) {
      tier =
        tierFromPackageId(packageId) || tierFromPlanLabel(vipPlanLabel);
    }
    applyMembershipThemeClass(themeFromTier(tier));
  }, [vip, vipPlanLabel, packageId]);

  return null;
}

/** Fetch /api/auth/me 1 lần để theme toàn app (Shell). */
export function MembershipThemeBoot() {
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/auth/me", { cache: "no-store" });
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (cancelled || !data?.authenticated) {
          applyMembershipThemeClass("default");
          return;
        }
        const c = data.customer || {};
        const tier = c.vip
          ? tierFromPackageId(c.membershipPackageId) ||
            tierFromPlanLabel(c.vipPlanLabel || c.packageLabel)
          : null;
        applyMembershipThemeClass(themeFromTier(tier));
      } catch {
        applyMembershipThemeClass("default");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
