/** VIP / membership helpers for My Oasis account + QR. */

export function isVipActive(opts: {
  segment?: string | null;
  vipExpiresAt?: Date | string | null;
  now?: Date;
}) {
  const now = opts.now || new Date();
  if (String(opts.segment || "").toUpperCase() !== "VIP") return false;
  if (!opts.vipExpiresAt) return true;
  const exp = new Date(opts.vipExpiresAt);
  return !Number.isNaN(exp.getTime()) && exp.getTime() > now.getTime();
}

export function vipExpiryLabel(vipExpiresAt?: Date | string | null) {
  if (!vipExpiresAt) return null;
  const d = new Date(vipExpiresAt);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}
