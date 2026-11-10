/**
 * Tournament rules for the staff desk.
 * Keep in sync with customer-app/src/lib/tournament.ts.
 *
 * One row per athlete per event.
 * Signup stores Tham gia. Check-in stores Có mặt.
 * The event day ending without check-in stores Không đến.
 * The athlete cancelling their entry stores Đã hủy.
 * The voucher is separate: one per athlete, one amount, redeemed once
 * at any of Mía Ơi, Olympic, Spa, or Lòng Nướng.
 * 0đ means no voucher. Only inside the event window.
 * Gallery is an external URL. Results are a single image.
 */
import { randomBytes } from "crypto";

export const VN_TZ = "Asia/Ho_Chi_Minh";

export const TOURNAMENT_STATUS = {
  UPCOMING: "UPCOMING",
  LIVE: "LIVE",
  ENDED: "ENDED",
} as const;

export type TournamentStatus =
  (typeof TOURNAMENT_STATUS)[keyof typeof TOURNAMENT_STATUS];

export const TOURNAMENT_STATUS_LABEL: Record<TournamentStatus, string> = {
  UPCOMING: "Sắp diễn ra",
  LIVE: "Đang diễn ra",
  ENDED: "Đã kết thúc",
};

export const CHECKIN_SOURCE = {
  QR: "QR",
  STAFF: "STAFF",
  APP: "APP",
} as const;

/** Written by signup, check-in, the event ending, or the athlete cancelling. */
export const ATTENDANCE = {
  REGISTERED: "REGISTERED",
  PRESENT: "PRESENT",
  NO_SHOW: "NO_SHOW",
  CANCELLED: "CANCELLED",
} as const;

export type TournamentAttendance =
  (typeof ATTENDANCE)[keyof typeof ATTENDANCE];

export const ATTENDANCE_LABEL: Record<TournamentAttendance, string> = {
  REGISTERED: "Tham gia",
  PRESENT: "Có mặt",
  NO_SHOW: "Không đến",
  CANCELLED: "Đã hủy",
};

/** A signup that outlasts the event day is a no-show. */
export function attendanceAfterWindow(
  attendance: string,
  endsAt: Date,
  now = new Date()
): TournamentAttendance {
  if (
    attendance === ATTENDANCE.REGISTERED &&
    now.getTime() >= endsAt.getTime()
  ) {
    return ATTENDANCE.NO_SHOW;
  }
  if (attendance === ATTENDANCE.PRESENT) return ATTENDANCE.PRESENT;
  if (attendance === ATTENDANCE.NO_SHOW) return ATTENDANCE.NO_SHOW;
  if (attendance === ATTENDANCE.CANCELLED) return ATTENDANCE.CANCELLED;
  return ATTENDANCE.REGISTERED;
}

/** Null when a new signup can be stored. REGISTERED means they are already in. */
export function registerBlockReason(attendance: string): string | null {
  if (attendance === ATTENDANCE.REGISTERED) return null;
  if (attendance === ATTENDANCE.PRESENT) return "Vận động viên đã check-in.";
  if (attendance === ATTENDANCE.CANCELLED) return "Vận động viên đã hủy.";
  if (attendance === ATTENDANCE.NO_SHOW) return "Vận động viên không đến.";
  return "Vận động viên đã có trong danh sách.";
}

/** Null when check-in may create Có mặt, including a first arrival. */
export function checkInBlockReason(attendance: string): string | null {
  if (
    attendance === ATTENDANCE.REGISTERED ||
    attendance === ATTENDANCE.PRESENT
  ) {
    return null;
  }
  if (attendance === ATTENDANCE.CANCELLED) return "Vận động viên đã hủy.";
  if (attendance === ATTENDANCE.NO_SHOW) return "Vận động viên không đến.";
  return "Không check-in được.";
}

/** Null when the athlete may withdraw an entry that is still Tham gia. */
export function cancelBlockReason(
  attendance: string,
  endsAt: Date,
  now = new Date()
): string | null {
  if (attendance === ATTENDANCE.CANCELLED) return null;
  if (attendance === ATTENDANCE.PRESENT) return "Đã check-in, không hủy được.";
  if (
    now.getTime() >= endsAt.getTime() ||
    attendance === ATTENDANCE.NO_SHOW
  ) {
    return "Giải đã kết thúc.";
  }
  if (attendance !== ATTENDANCE.REGISTERED) return "Không hủy được.";
  return null;
}

export const VOUCHER_STATUS = {
  ISSUED: "ISSUED",
  REDEEMED: "REDEEMED",
  EXPIRED: "EXPIRED",
} as const;

export type TournamentVoucherStatus =
  (typeof VOUCHER_STATUS)[keyof typeof VOUCHER_STATUS];

export const ASSET_KIND = {
  RESULTS_IMAGE: "RESULTS_IMAGE",
  GALLERY_LINK: "GALLERY_LINK",
} as const;

export type TournamentAssetKind =
  (typeof ASSET_KIND)[keyof typeof ASSET_KIND];

export const TOURNAMENT_VOUCHER_ZONES = [
  { zone: "MIA_OI", label: "Mía Ơi" },
  { zone: "OLYMPIC_POOL", label: "Olympic" },
  { zone: "SPA", label: "Spa" },
  { zone: "LONG_NUONG", label: "Lòng Nướng" },
] as const;

export type TournamentVoucherZone =
  (typeof TOURNAMENT_VOUCHER_ZONES)[number]["zone"];

export const VOUCHER_ZONE = {
  MIA_OI: "MIA_OI",
  OLYMPIC_POOL: "OLYMPIC_POOL",
  SPA: "SPA",
  LONG_NUONG: "LONG_NUONG",
} as const;

export const ZONE_LABEL: Record<TournamentVoucherZone, string> = {
  MIA_OI: "Mía Ơi",
  OLYMPIC_POOL: "Olympic",
  SPA: "Spa",
  LONG_NUONG: "Lòng Nướng",
};

export const DEFAULT_VOUCHER_DISCOUNT_VND = 50_000;

/** Printed event QR. Customer route reserved: /t/[token] */
export const CHECKIN_TOKEN_PREFIX = "tq_";
/** One-time staff scan. Customer route reserved: /v/[token] */
export const VOUCHER_PASS_PREFIX = "tv_";

export const VOUCHER_CONDITIONS = [
  "Chỉ dùng 1 lần",
  "Dùng được tại Mía Ơi, Olympic, Spa hoặc Lòng Nướng",
  "Chỉ có hiệu lực trong ngày giải đấu",
  "Chỉ dành cho vận động viên",
] as const;

export function vnCivilDayKey(d: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: VN_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

const WEEKDAY_VI: Record<string, string> = {
  Sun: "CN",
  Mon: "T2",
  Tue: "T3",
  Wed: "T4",
  Thu: "T5",
  Fri: "T6",
  Sat: "T7",
};

/** When the match starts. An empty clock means the start of that Vietnam day. */
export function tournamentKickoff(startsAt: Date, eventTime: string | null) {
  if (!eventTime) return startsAt;
  const at = new Date(`${vnCivilDayKey(startsAt)}T${eventTime}:00+07:00`);
  return Number.isNaN(at.getTime()) ? startsAt : at;
}

/** Sắp diễn ra, then Đang diễn ra from the announced clock, then Đã kết thúc after the day. */
export function tournamentStatusAt(
  startsAt: Date,
  endsAt: Date,
  eventTime: string | null,
  now = new Date()
): TournamentStatus {
  if (now.getTime() >= endsAt.getTime()) return TOURNAMENT_STATUS.ENDED;
  if (now.getTime() >= tournamentKickoff(startsAt, eventTime).getTime()) {
    return TOURNAMENT_STATUS.LIVE;
  }
  return TOURNAMENT_STATUS.UPCOMING;
}

/** Null while the event is still Sắp diễn ra. Ongoing and finished events cannot be joined. */
export function registerWindowReason(
  startsAt: Date,
  endsAt: Date,
  eventTime: string | null,
  now = new Date()
) {
  const status = tournamentStatusAt(startsAt, endsAt, eventTime, now);
  if (status === TOURNAMENT_STATUS.UPCOMING) return null;
  if (status === TOURNAMENT_STATUS.LIVE) return "Giải đang diễn ra, không đăng ký được.";
  return "Giải đã kết thúc.";
}

/** Shown beside the status after the day or the clock is moved. */
export function rescheduleNote(opts: {
  originalStartsAt: Date | null;
  originalEventTime: string | null;
  startsAt: Date;
  eventTime: string | null;
}) {
  if (!opts.originalStartsAt) return null;
  const sameDay =
    vnCivilDayKey(opts.originalStartsAt) === vnCivilDayKey(opts.startsAt);
  const sameTime = (opts.originalEventTime || "") === (opts.eventTime || "");
  if (sameDay && sameTime) return null;
  const when = [tournamentDayLabel(opts.startsAt), opts.eventTime]
    .filter(Boolean)
    .join(" ");
  return `dời về ${when}`;
}

/** e.g. T7 07/11/2026 — the Vietnam civil day of `startsAt`. */
export function tournamentDayLabel(startsAt: Date) {
  const key = vnCivilDayKey(startsAt);
  const noon = new Date(`${key}T12:00:00+07:00`);
  const wd = new Intl.DateTimeFormat("en-US", {
    timeZone: VN_TZ,
    weekday: "short",
  }).format(noon);
  const [year, month, day] = key.split("-");
  return `${WEEKDAY_VI[wd] || wd} ${day}/${month}/${year}`;
}

/** [start, end) for one Vietnam civil day. `end` is exclusive. */
export function vnDayBounds(ymd: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) {
    throw new Error("Ngày giải phải là YYYY-MM-DD.");
  }
  const startsAt = new Date(`${ymd}T00:00:00+07:00`);
  if (Number.isNaN(startsAt.getTime())) {
    throw new Error("Ngày giải không hợp lệ.");
  }
  return {
    startsAt,
    endsAt: new Date(startsAt.getTime() + 24 * 60 * 60 * 1000),
  };
}

export function isWithinTournamentWindow(
  startsAt: Date,
  endsAt: Date,
  now = new Date()
) {
  const t = now.getTime();
  return t >= startsAt.getTime() && t < endsAt.getTime();
}

export function discountForZone(
  tournament: { discountVnd: number },
  zone: TournamentVoucherZone
) {
  if (!TOURNAMENT_VOUCHER_ZONES.some((item) => item.zone === zone)) return 0;
  return Math.max(0, Math.round(Number(tournament.discountVnd) || 0));
}

/** Every sector, when the event actually gives a voucher. */
export function offeredVoucherZones(tournament: { discountVnd: number }) {
  if (discountForZone(tournament, "MIA_OI") <= 0) return [];
  return TOURNAMENT_VOUCHER_ZONES;
}

export function parseCourt(raw: unknown) {
  const court = String(raw || "").trim().slice(0, 80);
  return court || null;
}

/** HH:mm, or null when the field is left empty. */
export function parseEventTime(raw: unknown) {
  const text = String(raw || "").trim();
  if (!text) return null;
  const match = text.match(/^(\d{2}):(\d{2})/);
  if (!match) return undefined;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return undefined;
  return `${match[1]}:${match[2]}`;
}

export function tournamentGivesVoucher(discountVnd: number) {
  return Math.max(0, Math.round(Number(discountVnd) || 0)) > 0;
}

export function voucherTitle(discountVnd: number) {
  const n = Math.max(0, Math.round(discountVnd));
  return `Voucher VĐV ${n.toLocaleString("vi-VN")}đ`;
}

/** Desk the athlete's voucher may be scanned at. The amount is the same everywhere. */
export function redeemZoneForDesk(raw: string): TournamentVoucherZone | null {
  const z = raw.trim().toUpperCase();
  if (z === "MIA_OI" || z === "MIAOI" || z === "MIA_OLYMPIC") return VOUCHER_ZONE.MIA_OI;
  if (z === "OLYMPIC_POOL" || z === "OLYMPIC" || z === "GYM" || z === "VIP") {
    return VOUCHER_ZONE.OLYMPIC_POOL;
  }
  if (z === "SPA" || z === "SAUNA") return VOUCHER_ZONE.SPA;
  if (z === "LONG_NUONG" || z === "LONGNUONG" || z === "CHI_PHEO") {
    return VOUCHER_ZONE.LONG_NUONG;
  }
  return null;
}

export function parseVoucherZone(raw: string): TournamentVoucherZone | null {
  const z = raw.trim().toUpperCase();
  if (z === "MIA_OI" || z === "MIAOI") return VOUCHER_ZONE.MIA_OI;
  if (z === "OLYMPIC_POOL" || z === "OLYMPIC") return VOUCHER_ZONE.OLYMPIC_POOL;
  if (z === "SPA" || z === "SAUNA") return VOUCHER_ZONE.SPA;
  if (z === "LONG_NUONG" || z === "LONGNUONG") return VOUCHER_ZONE.LONG_NUONG;
  return null;
}

/** External gallery only. Rejects data URLs and non-http links. */
export function assertGalleryUrl(raw: string) {
  const url = raw.trim();
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("Link ảnh phải là một đường dẫn http hoặc https.");
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("Link ảnh phải là một đường dẫn http hoặc https.");
  }
  return url;
}

export function newCheckInToken() {
  return `${CHECKIN_TOKEN_PREFIX}${randomBytes(16).toString("base64url")}`;
}

export function newVoucherPassToken() {
  return `${VOUCHER_PASS_PREFIX}${randomBytes(16).toString("base64url")}`;
}

export function checkInTokenFromScan(raw: string) {
  const text = raw.trim();
  if (text.startsWith(CHECKIN_TOKEN_PREFIX)) return text;
  const match = text.match(/\/t\/(tq_[A-Za-z0-9_-]+)/);
  return match?.[1] || "";
}

export function voucherPassFromScan(raw: string) {
  const text = raw.trim();
  if (text.startsWith(VOUCHER_PASS_PREFIX)) return text;
  const match = text.match(/\/v\/(tv_[A-Za-z0-9_-]+)/);
  return match?.[1] || "";
}
