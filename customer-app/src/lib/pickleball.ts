/** Shared pickleball booking helpers (customer app). */

/** 1 hour slots: 06:00–07:00 … 20:30–21:30 */
export const PICKLEBALL_SLOT_HOURS = 1;
export const PICKLEBALL_PRICE_VND = 200_000;
/** Minutes before end → yellow “sắp hết giờ” */
export const ENDING_SOON_MIN = 20;

export type CourtVisualStatus =
  | "available"
  | "reserved"
  | "occupied"
  | "ending_soon"
  | "blocked";

/** Open check-in with no end time counts as live for this long, then the board treats it as stale. */
export const OPEN_SESSION_ASSUME_MIN = 90;

export const LIVE_BOOKING_STATUSES = [
  "PENDING",
  "CONFIRMED",
  "ARRIVED",
  "CHECKED_IN",
  "IN_SERVICE",
] as const;

const ON_COURT_STATUSES = new Set(["ARRIVED", "CHECKED_IN", "IN_SERVICE"]);
const HOLD_STATUSES = new Set(["PENDING", "CONFIRMED"]);

function later(current: number | null, next: number) {
  return current == null || next > current ? next : current;
}

/**
 * What the customer board should show right now.
 * A stuck resource status of OCCUPIED is not enough — the court is busy only
 * while a booking or check-in actually covers the current time.
 * A reservation that covers now is "reserved", not "someone is playing".
 */
export function courtLiveState(opts: {
  resourceStatus: string;
  now: Date;
  session?: {
    startAt: Date;
    endAt: Date | null;
    bookingId?: string | null;
  } | null;
  bookings: { id: string; startAt: Date; endAt: Date; status: string }[];
}): { status: CourtVisualStatus; freeAt: Date | null } {
  if (opts.resourceStatus === "BLOCKED") {
    return { status: "blocked", freeAt: null };
  }

  const nowMs = opts.now.getTime();
  let onCourtEnd: number | null = null;
  let holdEnd: number | null = null;

  for (const booking of opts.bookings) {
    if (booking.startAt.getTime() > nowMs || booking.endAt.getTime() <= nowMs) {
      continue;
    }
    if (ON_COURT_STATUSES.has(booking.status)) {
      onCourtEnd = later(onCourtEnd, booking.endAt.getTime());
    } else if (HOLD_STATUSES.has(booking.status)) {
      holdEnd = later(holdEnd, booking.endAt.getTime());
    }
  }

  const session = opts.session;
  if (session && session.startAt.getTime() <= nowMs) {
    const linked = session.bookingId
      ? opts.bookings.find((b) => b.id === session.bookingId)
      : undefined;
    const linkedLive =
      linked &&
      (ON_COURT_STATUSES.has(linked.status) || HOLD_STATUSES.has(linked.status));
    const explicitEnd = linkedLive ? linked.endAt : session.endAt;
    let sessionEnd: number | null = null;
    if (explicitEnd && explicitEnd.getTime() > nowMs) {
      sessionEnd = explicitEnd.getTime();
    } else if (!explicitEnd) {
      const assumeEnd =
        session.startAt.getTime() + OPEN_SESSION_ASSUME_MIN * 60 * 1000;
      if (assumeEnd > nowMs) sessionEnd = assumeEnd;
    }
    if (sessionEnd != null) onCourtEnd = later(onCourtEnd, sessionEnd);
  }

  const freeMs = onCourtEnd ?? holdEnd;
  if (freeMs == null) return { status: "available", freeAt: null };

  const freeAt = new Date(freeMs);
  const minsLeft = (freeMs - nowMs) / (60 * 1000);
  if (minsLeft > 0 && minsLeft <= ENDING_SOON_MIN) {
    return { status: "ending_soon", freeAt };
  }
  if (onCourtEnd != null) return { status: "occupied", freeAt };
  return { status: "reserved", freeAt };
}

export function formatVnd(n: number) {
  return new Intl.NumberFormat("vi-VN").format(n) + "đ";
}

/** Local calendar day YYYY-MM-DD (avoid UTC shift from toISOString). */
export function localDayKey(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function buildDateOptions(days = 14) {
  const out: { key: string; date: Date; dayNum: number; weekday: string }[] = [];
  const weekdays = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  for (let i = 0; i < days; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    out.push({
      key: localDayKey(d),
      date: d,
      dayNum: d.getDate(),
      weekday: weekdays[d.getDay()],
    });
  }
  return out;
}

/**
 * Time slots 06:00 → 21:30 (1h each).
 * Starts every 30 min: 06:00, 06:30, … 20:30 (last ends 21:30).
 */
export function buildTimeSlots(dayKey: string, opts?: { includePast?: boolean }) {
  const [y, m, d] = dayKey.split("-").map(Number);
  const slots: { id: string; label: string; startAt: string; endAt: string }[] =
    [];
  const close = new Date(y, m - 1, d, 21, 30, 0, 0);
  for (let h = 6; h <= 20; h++) {
    for (const half of [0, 30]) {
      const start = new Date(y, m - 1, d, h, half, 0, 0);
      const end = new Date(
        start.getTime() + PICKLEBALL_SLOT_HOURS * 60 * 60 * 1000
      );
      if (end.getTime() > close.getTime()) continue;
      if (!opts?.includePast && start.getTime() < Date.now() - 5 * 60 * 1000) {
        continue;
      }
      const label = `${pad(start.getHours())}:${pad(start.getMinutes())} – ${pad(end.getHours())}:${pad(end.getMinutes())}`;
      slots.push({
        id: `${dayKey}T${pad(start.getHours())}${pad(start.getMinutes())}`,
        label,
        startAt: start.toISOString(),
        endAt: end.toISOString(),
      });
    }
  }
  return slots;
}

/** Open 06:00 · close 21:30 (local minutes from midnight). */
export const PICKLEBALL_OPEN_MIN = 6 * 60;
export const PICKLEBALL_CLOSE_MIN = 21 * 60 + 30;
/** Picker step: 06:00, 06:15, 06:30, 06:45, … */
export const PICKLEBALL_TIME_STEP_MIN = 15;
/** Minimum bookable duration */
export const PICKLEBALL_MIN_DURATION_MIN = 30;

export function pad(n: number) {
  return String(n).padStart(2, "0");
}

export function minutesToHm(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${pad(h)}:${pad(m)}`;
}

/** 6:00 AM, 6:15 AM, … from minutes after midnight. */
export function formatAmpmMinutes(total: number) {
  const h24 = Math.floor(total / 60);
  const m = total % 60;
  const suffix = h24 >= 12 ? "PM" : "AM";
  let h = h24 % 12;
  if (h === 0) h = 12;
  return `${h}:${pad(m)} ${suffix}`;
}

export function hmToMinutes(hm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hm.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

export function atLocal(dayKey: string, minutes: number) {
  const [y, m, d] = dayKey.split("-").map(Number);
  const h = Math.floor(minutes / 60);
  const min = minutes % 60;
  return new Date(y, m - 1, d, h, min, 0, 0);
}

export function formatTimeLabel(iso: string) {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 15-minute options within open hours. Labels are built once. */
export function buildTimeOptions(
  opts?: { forEnd?: boolean; afterMin?: number }
) {
  const start = opts?.forEnd
    ? PICKLEBALL_OPEN_MIN + PICKLEBALL_MIN_DURATION_MIN
    : PICKLEBALL_OPEN_MIN;
  const end = opts?.forEnd
    ? PICKLEBALL_CLOSE_MIN
    : PICKLEBALL_CLOSE_MIN - PICKLEBALL_MIN_DURATION_MIN;
  const after = opts?.afterMin ?? -1;
  const out: { key: string; label: string; minutes: number }[] = [];
  for (let m = start; m <= end; m += PICKLEBALL_TIME_STEP_MIN) {
    if (m <= after) continue;
    out.push({ key: minutesToHm(m), label: formatAmpmMinutes(m), minutes: m });
  }
  return out;
}

export type DayScheduleRow = {
  key: string;
  label: string;
  startAt: string;
  endAt: string;
  kind: "free" | "busy" | "selected";
};

function mergeBusy(
  dayKey: string,
  bookings: { startAt: string; endAt: string }[]
) {
  const open = atLocal(dayKey, PICKLEBALL_OPEN_MIN).getTime();
  const close = atLocal(dayKey, PICKLEBALL_CLOSE_MIN).getTime();
  const sorted = bookings
    .map((b) => ({
      start: Math.max(open, new Date(b.startAt).getTime()),
      end: Math.min(close, new Date(b.endAt).getTime()),
    }))
    .filter((b) => b.end > b.start)
    .sort((a, b) => a.start - b.start);

  const merged: { start: number; end: number }[] = [];
  for (const b of sorted) {
    const last = merged[merged.length - 1];
    if (last && b.start <= last.end) last.end = Math.max(last.end, b.end);
    else merged.push({ start: b.start, end: b.end });
  }
  return { open, close, merged };
}

/**
 * Day schedule: free gaps + booked ranges (actual start/end, not fixed slots).
 * A chosen range is split out of the free gap so the rest of that gap stays "trống".
 */
export function buildDaySchedule(
  dayKey: string,
  bookings: { startAt: string; endAt: string }[],
  selection?: { startAt: string; endAt: string } | null
) {
  const { open, close, merged } = mergeBusy(dayKey, bookings);
  const labelTs = (ts: number) => {
    const d = new Date(ts);
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };
  const selStart = selection ? new Date(selection.startAt).getTime() : null;
  const selEnd = selection ? new Date(selection.endAt).getTime() : null;

  const rows: DayScheduleRow[] = [];
  const push = (start: number, end: number, kind: DayScheduleRow["kind"]) => {
    if (end <= start) return;
    rows.push({
      key: `${kind}-${start}`,
      label: `${labelTs(start)} – ${labelTs(end)}`,
      startAt: new Date(start).toISOString(),
      endAt: new Date(end).toISOString(),
      kind,
    });
  };
  const pushFree = (start: number, end: number) => {
    if (selStart == null || selEnd == null || selEnd <= start || selStart >= end) {
      push(start, end, "free");
      return;
    }
    const chosenStart = Math.max(start, selStart);
    const chosenEnd = Math.min(end, selEnd);
    push(start, chosenStart, "free");
    push(chosenStart, chosenEnd, "selected");
    push(chosenEnd, end, "free");
  };

  let cursor = open;
  for (const b of merged) {
    if (b.start > cursor) pushFree(cursor, b.start);
    push(b.start, b.end, "busy");
    cursor = Math.max(cursor, b.end);
  }
  if (cursor < close) pushFree(cursor, close);
  return rows;
}

/** Next open stretch after `now`. `until` is set when another booking starts before close. */
export function nextFreeGap(
  dayKey: string,
  bookings: { startAt: string; endAt: string }[],
  now = new Date()
): { from: string; until: string | null; startsNow: boolean } | null {
  const { close, merged } = mergeBusy(dayKey, bookings);
  const nowMs = now.getTime();
  let cursor = nowMs;
  for (const block of merged) {
    if (block.end <= nowMs) continue;
    if (block.start > cursor) return gapBetween(cursor, block.start, close, nowMs);
    cursor = block.end;
  }
  if (cursor < close) return gapBetween(cursor, close, close, nowMs);
  return null;
}

function gapBetween(fromMs: number, untilMs: number, close: number, nowMs: number) {
  return {
    from: formatTimeLabel(new Date(fromMs).toISOString()),
    until:
      untilMs >= close - 1000
        ? null
        : formatTimeLabel(new Date(untilMs).toISOString()),
    startsNow: fromMs <= nowMs,
  };
}

/** Short line under a court tile. */
export function courtBoardNote(
  status: CourtVisualStatus,
  dayKey: string,
  bookings: { startAt: string; endAt: string }[],
  now = new Date()
) {
  if (status === "blocked") return "Chọn giờ khác";
  const gap = nextFreeGap(dayKey, bookings, now);
  if (!gap) return status === "available" ? "" : "Hết chỗ hôm nay";
  if (gap.startsNow) return gap.until ? `đến ${gap.until}` : "";
  return gap.until ? `Trống ${gap.from}–${gap.until}` : `Trống ${gap.from}`;
}

export function rangeConflicts(
  startAt: string,
  endAt: string,
  bookings: { startAt: string; endAt: string }[]
) {
  const s = new Date(startAt).getTime();
  const e = new Date(endAt).getTime();
  return bookings.some((b) => {
    const bs = new Date(b.startAt).getTime();
    const be = new Date(b.endAt).getTime();
    return bs < e && be > s;
  });
}

export function hoursBetween(startAt: string, endAt: string) {
  return Math.max(
    0,
    (new Date(endAt).getTime() - new Date(startAt).getTime()) / (60 * 60 * 1000)
  );
}

export function priceForRange(startAt: string, endAt: string) {
  const h = hoursBetween(startAt, endAt);
  return Math.round(h * PICKLEBALL_PRICE_VND);
}

export function validateBookRange(
  dayKey: string,
  fromHm: string,
  toHm: string,
  bookings: { startAt: string; endAt: string }[]
): { ok: true; startAt: string; endAt: string } | { ok: false; error: string } {
  const fromMin = hmToMinutes(fromHm);
  const toMin = hmToMinutes(toHm);
  if (fromMin == null || toMin == null) {
    return { ok: false, error: "Chọn đủ từ giờ và đến giờ." };
  }
  if (fromMin < PICKLEBALL_OPEN_MIN || toMin > PICKLEBALL_CLOSE_MIN) {
    return {
      ok: false,
      error: `Giờ mở cửa ${minutesToHm(PICKLEBALL_OPEN_MIN)} – ${minutesToHm(PICKLEBALL_CLOSE_MIN)}.`,
    };
  }
  if (toMin <= fromMin) {
    return { ok: false, error: "Giờ kết thúc phải sau giờ bắt đầu." };
  }
  if (toMin - fromMin < PICKLEBALL_MIN_DURATION_MIN) {
    return {
      ok: false,
      error: `Đặt tối thiểu ${PICKLEBALL_MIN_DURATION_MIN} phút.`,
    };
  }
  const startAt = atLocal(dayKey, fromMin).toISOString();
  const endAt = atLocal(dayKey, toMin).toISOString();
  if (new Date(startAt).getTime() < Date.now() - 5 * 60 * 1000) {
    return { ok: false, error: "Không đặt khung giờ đã qua." };
  }
  if (rangeConflicts(startAt, endAt, bookings)) {
    return { ok: false, error: "Khoảng này đã có người đặt — chọn khung khác." };
  }
  return { ok: true, startAt, endAt };
}

export function courtTone(status: CourtVisualStatus) {
  if (status === "blocked") {
    return { bg: "#e2e8f0", fg: "#334155", label: "Tạm khóa" };
  }
  if (status === "occupied") {
    return { bg: "#fecaca", fg: "#7f1d1d", label: "Có khách" };
  }
  if (status === "reserved") {
    return { bg: "#dbeafe", fg: "#1e3a8a", label: "Đã có giờ" };
  }
  if (status === "ending_soon") {
    return { bg: "#fef08a", fg: "#713f12", label: "Sắp trống" };
  }
  return { bg: "#bbf7d0", fg: "#14532d", label: "Trống" };
}

const LIVE_STATUS = new Set<string>(LIVE_BOOKING_STATUSES);

/** Keep a check-in's booking on the day list when the day query missed it. */
export function withSessionBooking<T extends { id: string; status: string }>(
  bookings: T[],
  sessionBooking: T | null | undefined
) {
  if (!sessionBooking || !LIVE_STATUS.has(sessionBooking.status)) return bookings;
  if (bookings.some((b) => b.id === sessionBooking.id)) return bookings;
  return [...bookings, sessionBooking];
}

export function formatHmVietnam(d: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "Asia/Ho_Chi_Minh",
  }).formatToParts(d);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value || "";
  const hour = get("hour") === "24" ? "00" : get("hour");
  return `${hour}:${get("minute")}`;
}
