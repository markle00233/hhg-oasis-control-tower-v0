export function normalizePhone(raw: string): string {
  let d = raw.replace(/\D/g, "");
  if (d.startsWith("84") && d.length >= 11) d = `0${d.slice(2)}`;
  return d;
}

export function phoneShortId(raw: string): string {
  const d = normalizePhone(raw);
  if (d.length < 4) return d.padStart(4, "0");
  return d.slice(-4);
}
