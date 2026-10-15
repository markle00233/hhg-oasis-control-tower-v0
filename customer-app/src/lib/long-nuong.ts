/** Lòng Nướng — chỉ đặt bàn (không đồ ăn). */

export type TableVisualStatus = "available" | "occupied" | "held";

/** Thời lượng giữ bàn sau giờ đến (giờ). */
export const LONG_NUONG_SESSION_HOURS = 3;
export const LONG_NUONG_OPEN_MIN = 10 * 60; // 10:00
export const LONG_NUONG_CLOSE_MIN = 22 * 60; // 22:00

export function pad(n: number) {
  return String(n).padStart(2, "0");
}

export function localDayKey(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function buildDateOptions(days = 14) {
  const out: { key: string; date: Date; dayNum: number; weekday: string; label: string }[] =
    [];
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
      label: `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`,
    });
  }
  return out;
}

export function hmToMinutes(hm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hm.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

export function minutesToHm(minutes: number) {
  return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
}

export function atLocal(dayKey: string, minutes: number) {
  const [y, m, d] = dayKey.split("-").map(Number);
  return new Date(y, m - 1, d, Math.floor(minutes / 60), minutes % 60, 0, 0);
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

export function validateArrival(
  dayKey: string,
  arriveHm: string,
  bookings: { startAt: string; endAt: string }[]
):
  | { ok: true; startAt: string; endAt: string }
  | { ok: false; error: string } {
  const min = hmToMinutes(arriveHm);
  if (min == null) {
    return { ok: false, error: "Nhập giờ đến (HH:mm)." };
  }
  if (min < LONG_NUONG_OPEN_MIN || min > LONG_NUONG_CLOSE_MIN - 30) {
    return {
      ok: false,
      error: `Giờ nhận bàn ${minutesToHm(LONG_NUONG_OPEN_MIN)} – ${minutesToHm(LONG_NUONG_CLOSE_MIN)}.`,
    };
  }
  const startAt = atLocal(dayKey, min).toISOString();
  const endAt = new Date(
    new Date(startAt).getTime() + LONG_NUONG_SESSION_HOURS * 60 * 60 * 1000
  ).toISOString();
  if (new Date(startAt).getTime() < Date.now() - 5 * 60 * 1000) {
    return { ok: false, error: "Giờ đến đã qua — chọn khung khác." };
  }
  if (rangeConflicts(startAt, endAt, bookings)) {
    return {
      ok: false,
      error: "Ngày/giờ này bàn đã có người đặt — chọn khung khác.",
    };
  }
  return { ok: true, startAt, endAt };
}

export function tableTone(status: TableVisualStatus) {
  if (status === "occupied") {
    return { bg: "#fecaca", fg: "#7f1d1d", label: "Đang dùng" };
  }
  if (status === "held") {
    return { bg: "#fed7aa", fg: "#9a3412", label: "Đã giữ" };
  }
  return { bg: "#bbf7d0", fg: "#14532d", label: "Còn trống" };
}

export function tableShortLabel(name: string, code: string) {
  const fromName = name.replace(/^Bàn\s*/i, "").trim();
  if (fromName) return fromName;
  return code.replace(/^TABLE_/i, "");
}

/** Parse table hold from cart item note. */
export function parseCartTableRef(items: unknown): {
  resourceId: string | null;
  bookingId: string | null;
} {
  if (!Array.isArray(items)) return { resourceId: null, bookingId: null };
  for (const raw of items) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as Record<string, unknown>;
    const id = String(item.id || "");
    const note = String(item.note || "");
    if (!id.startsWith("table-") && !note.includes("resourceId:")) continue;
    return {
      resourceId: note.match(/resourceId:([^|]+)/)?.[1]?.trim() || null,
      bookingId: note.match(/bookingId:([^|]+)/)?.[1]?.trim() || null,
    };
  }
  return { resourceId: null, bookingId: null };
}
