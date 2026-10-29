/** Desk badge: no login → Khách lẻ, account → Khách, gói → Member, gói VIP → VIP. */

export type DeskSegmentCode = "VIP" | "MEMBER" | "ACCOUNT" | "WALK_IN";

function looksLikeLoginPhone(raw: string | null | undefined) {
  const s = String(raw || "").trim();
  if (!s || /^anon-/i.test(s) || /^w\d/i.test(s)) return false;
  if (/[a-z]/i.test(s)) return false;
  const digits = s.replace(/\D/g, "");
  return digits.length >= 9 && digits.length <= 12;
}

/** App login is the phone (username or SĐT). Anonymous shells and `w…` placeholders are not accounts. */
export function customerHasLoginAccount(c: {
  username?: string | null;
  phone?: string | null;
  phoneNormalized?: string | null;
}) {
  if (/^anon-/i.test(String(c.username || ""))) return false;
  return (
    looksLikeLoginPhone(c.username) ||
    looksLikeLoginPhone(c.phone) ||
    looksLikeLoginPhone(c.phoneNormalized)
  );
}

/** Gói VIP hồ (Gói VIP …). Gói Olympic is a regular subscription. */
export function isVipSubscriptionLabel(label: string | null | undefined) {
  const s = String(label || "").trim();
  return /gói\s*vip/i.test(s) || /^vip-/i.test(s);
}

/** Active package badge. Olympic / other gói → Member. Gói VIP → VIP. */
export function badgeForPlanLabel(label: string | null | undefined): {
  segment: "VIP" | "MEMBER";
  segmentLabel: string;
} {
  if (isVipSubscriptionLabel(label)) {
    return { segment: "VIP", segmentLabel: "VIP" };
  }
  return { segment: "MEMBER", segmentLabel: "Member" };
}

export function deskSegmentLabel(
  segment: string | null | undefined,
  fallback = "Khách"
) {
  switch (String(segment || "").toUpperCase()) {
    case "VIP":
      return "VIP";
    case "MEMBER":
      return "Member";
    case "WALK_IN":
      return "Khách lẻ";
    case "ACCOUNT":
      return "Khách";
    default:
      return fallback;
  }
}

export function deskSegmentOf(opts: {
  segment?: string | null;
  vipExpiresAt?: Date | string | null;
  vipPlanLabel?: string | null;
  hasAccount?: boolean;
  crmMember?: boolean;
  now?: number;
}): { segment: DeskSegmentCode; segmentLabel: string } {
  const raw = String(opts.segment || "").toUpperCase();
  const now = opts.now ?? Date.now();
  let packageOn = raw === "VIP";
  if (packageOn && opts.vipExpiresAt) {
    const exp = new Date(opts.vipExpiresAt).getTime();
    if (!Number.isNaN(exp) && exp <= now) packageOn = false;
  }
  if (packageOn) return badgeForPlanLabel(opts.vipPlanLabel);
  if (raw === "MEMBER" || opts.crmMember) {
    return { segment: "MEMBER", segmentLabel: "Member" };
  }
  if (opts.hasAccount) return { segment: "ACCOUNT", segmentLabel: "Khách" };
  return { segment: "WALK_IN", segmentLabel: "Khách lẻ" };
}
