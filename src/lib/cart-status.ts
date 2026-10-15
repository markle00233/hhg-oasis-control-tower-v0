/** Shared cart / check-in status helpers (desk + customer). */

export const CART_STATUS = {
  PENDING: "PENDING_APPROVAL",
  OPEN: "OPEN",
  USED: "USED",
  REJECTED: "REJECTED",
  NO_SHOW: "NO_SHOW",
  EXPIRED: "EXPIRED",
  CANCELLED: "CANCELLED",
} as const;

/** Pool / walk-in QR valid until 21:30 Asia/Ho_Chi_Minh. */
export function isPastVnCutOff(now = new Date(), hour = 21, minute = 30) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Ho_Chi_Minh",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const h = Number(parts.find((p) => p.type === "hour")?.value || 0);
  const m = Number(parts.find((p) => p.type === "minute")?.value || 0);
  return h > hour || (h === hour && m >= minute);
}

export type CheckInUi =
  | "pending"
  | "yes"
  | "noshow"
  | "deleted"
  | "rejected"
  | "expired";

export function checkInUiFromCart(opts: {
  status: string;
  expiresAt?: Date | string | null;
  zoneCode?: string;
  now?: Date;
}): CheckInUi {
  const s = opts.status;
  if (s === CART_STATUS.CANCELLED) return "deleted";
  if (s === CART_STATUS.REJECTED) return "rejected";
  if (s === CART_STATUS.USED) return "yes";
  if (s === CART_STATUS.NO_SHOW) return "noshow";
  if (s === CART_STATUS.EXPIRED) return "expired";

  const now = opts.now || new Date();
  const zone = (opts.zoneCode || "").toUpperCase();
  const poolLike =
    zone === "OLYMPIC_POOL" ||
    zone === "OLYMPIC" ||
    zone === "RESORT_POOL" ||
    zone === "RESORT";

  if (
    (s === CART_STATUS.OPEN || s === CART_STATUS.PENDING) &&
    ((poolLike && isPastVnCutOff(now)) ||
      (opts.expiresAt && new Date(opts.expiresAt) < now))
  ) {
    return "noshow";
  }

  return "pending";
}

export function checkInLabel(ui: CheckInUi) {
  switch (ui) {
    case "yes":
      return "Rồi";
    case "noshow":
      return "Không tới";
    case "deleted":
      return "Xóa";
    case "rejected":
      return "Từ chối";
    case "expired":
      return "Hết hạn";
    default:
      return "Chưa";
  }
}
