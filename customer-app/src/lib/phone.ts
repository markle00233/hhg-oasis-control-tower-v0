/** Normalize VN-ish phone to digits only. */
export function normalizePhone(raw: string): string {
  let d = raw.replace(/\D/g, "");
  if (d.startsWith("84") && d.length >= 11) d = `0${d.slice(2)}`;
  return d;
}

/** Valid guest phone: 9–11 digits after normalize. */
export function isValidPhone(raw: string): boolean {
  const d = normalizePhone(raw);
  return d.length >= 9 && d.length <= 11;
}

/** Display form with leading 0. */
export function canonicalPhone(raw: string): string {
  const d = normalizePhone(raw);
  if (!d) return "";
  return d.startsWith("0") ? d : `0${d}`;
}

/** Variants so 09x and 9x (and +84) hit the same row. */
export function phoneKeys(raw: string): string[] {
  const d = normalizePhone(raw);
  if (d.length < 9) return [];
  const with0 = canonicalPhone(d);
  const no0 = with0.startsWith("0") ? with0.slice(1) : with0;
  const last9 = with0.slice(-9);
  return [...new Set([d, with0, no0, last9])].filter((k) => k.length >= 9);
}

/** Display / desk ID = last 4 digits. */
export function phoneShortId(raw: string): string {
  const d = normalizePhone(raw);
  if (d.length < 4) return d.padStart(4, "0");
  return d.slice(-4);
}
