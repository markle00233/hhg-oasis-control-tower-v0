const VN_PARTS = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Ho_Chi_Minh",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function vnParts(d: Date) {
  const parts = VN_PARTS.formatToParts(d);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value || "";
  let hour = get("hour");
  if (hour === "24") hour = "00";
  return {
    hour,
    minute: get("minute"),
    day: get("day"),
    month: get("month"),
    year: get("year"),
  };
}

/** Vietnam wall clock. `hour12: false` can ignore timeZone on a UTC server. */
export function formatVnTime(d: Date) {
  const p = vnParts(d);
  return `${p.hour}:${p.minute}`;
}

export function formatVnDateTime(d: Date) {
  const p = vnParts(d);
  return `${p.hour}:${p.minute} ${p.day}/${p.month}/${p.year}`;
}

const BAKED_CLOCK = /\d{1,2}:\d{2}[,\s]+\d{1,2}\/\d{1,2}\/\d{4}/;
const BAKED_END = /(–|-)\s*\d{1,2}:\d{2}/;

/** Replace a clock baked in UTC (e.g. "10:00 27/10/2026") with Vietnam time. */
export function withVnBookingClock(nameVi: string, startAt: Date, endAt: Date) {
  if (!BAKED_CLOCK.test(nameVi)) return nameVi;
  let next = nameVi.replace(BAKED_CLOCK, formatVnDateTime(startAt));
  if (BAKED_END.test(next)) {
    next = next.replace(BAKED_END, `–${formatVnTime(endAt)}`);
  }
  return next;
}

export function bookingIdsInItems(items: unknown): string[] {
  if (!Array.isArray(items)) return [];
  const ids: string[] = [];
  for (const raw of items) {
    if (!raw || typeof raw !== "object") continue;
    const note = String((raw as { note?: string }).note || "");
    const id = note.match(/bookingId:([^|\s]+)/)?.[1]?.trim();
    if (id) ids.push(id);
  }
  return ids;
}

export function relabelItemNames(
  items: unknown,
  clocks: Map<string, { startAt: Date; endAt: Date }>
) {
  if (!Array.isArray(items) || clocks.size === 0) return items;
  return items.map((raw) => {
    if (!raw || typeof raw !== "object") return raw;
    const row = raw as Record<string, unknown>;
    const id = String(row.note || "").match(/bookingId:([^|\s]+)/)?.[1]?.trim();
    const clock = id ? clocks.get(id) : undefined;
    if (!clock || typeof row.nameVi !== "string") return raw;
    const nameVi = withVnBookingClock(row.nameVi, clock.startAt, clock.endAt);
    if (nameVi === row.nameVi) return raw;
    return { ...row, nameVi };
  });
}
