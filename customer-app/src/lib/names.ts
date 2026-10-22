/** Chuẩn hoá tên để so khớp (bỏ dấu, thường, gọn khoảng trắng). */
export function normalizeName(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function namesMatch(a: string, b: string): boolean {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na || !nb) return false;
  return na === nb || na.includes(nb) || nb.includes(na);
}

/** Che tên: Nguyễn Quang Khiêm → N**** Q**** K**** */
export function maskFullName(raw: string | null | undefined): string {
  const parts = String(raw || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return "K****";
  return parts
    .map((p) => {
      const ch = p[0] || "?";
      return `${ch.toLocaleUpperCase("vi-VN")}****`;
    })
    .join(" ");
}

/** Gợi ý xác nhận: 098182338. N**** Q**** K**** */
export function maskedIdentityLabel(
  phone: string | null | undefined,
  fullName: string | null | undefined
) {
  const digits = String(phone || "").replace(/\D/g, "");
  const phonePart =
    digits.length <= 3
      ? digits || "—"
      : `${digits.slice(0, 3)}${"•".repeat(digits.length - 3)}`;
  return `${phonePart} · ${maskFullName(fullName)}`;
}
