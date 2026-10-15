/** Pickleball pricing + court schedule helpers (desk). */

export const PICKLEBALL_PRICE_VND = 200_000;
export const PICKLEBALL_OPEN_MIN = 6 * 60;
export const PICKLEBALL_CLOSE_MIN = 21 * 60 + 30;

export function formatVnd(n: number) {
  return new Intl.NumberFormat("vi-VN").format(n) + "đ";
}

export function localDayKey(d = new Date()) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function hoursBetween(startAt: string | Date, endAt: string | Date) {
  return Math.max(
    0,
    (new Date(endAt).getTime() - new Date(startAt).getTime()) / (60 * 60 * 1000)
  );
}

export function priceForRange(startAt: string | Date, endAt: string | Date) {
  return Math.round(hoursBetween(startAt, endAt) * PICKLEBALL_PRICE_VND);
}

/** Stable color per court index (0–5). */
export const COURT_COLORS = [
  { bg: "#dbeafe", fg: "#1e40af", border: "#93c5fd" },
  { bg: "#ede9fe", fg: "#5b21b6", border: "#c4b5fd" },
  { bg: "#ffe4e6", fg: "#9f1239", border: "#fda4af" },
  { bg: "#ecfccb", fg: "#3f6212", border: "#bef264" },
  { bg: "#ffedd5", fg: "#9a3412", border: "#fdba74" },
  { bg: "#cffafe", fg: "#155e75", border: "#67e8f9" },
] as const;

export function courtColor(index: number) {
  return COURT_COLORS[((index % COURT_COLORS.length) + COURT_COLORS.length) % COURT_COLORS.length];
}
