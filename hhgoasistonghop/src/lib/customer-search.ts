import { Prisma } from "@prisma/client";
import { normalizePhone } from "@/lib/utils";

/** Bỏ dấu tiếng Việt + thường hóa để search lỏng */
export function normalizeSearchText(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/** Tìm gia đình / ID … - GĐ */
export function isFamilySearchQuery(query: string): boolean {
  const q = query.trim();
  if (!q) return false;
  const compact = normalizeSearchText(q);
  if (compact === "gd" || compact === "giadinh" || compact === "family") return true;
  if (/[-\s]*g[đd]\s*$/i.test(q)) return true;
  if (/^g[đd]$/i.test(q)) return true;
  return false;
}

/** Lấy phần mã CUS từ chuỗi kiểu "CUS-000012 - GĐ" */
export function stripFamilyIdSuffix(query: string): string {
  return query
    .trim()
    .replace(/[-\s]*g[đd]\s*$/i, "")
    .replace(/\s+/g, "")
    .toUpperCase();
}

/** Match realtime: không cần đúng dấu / khoảng trắng; ghép từ cũng được */
export function fuzzyMatchCustomer(
  c: {
    fullName: string;
    phone: string;
    customerCode: string;
    familyGroupId?: string | null;
  },
  query: string
): boolean {
  const q = query.trim();
  if (!q) return true;

  if (isFamilySearchQuery(q)) {
    const codePart = stripFamilyIdSuffix(q);
    if (codePart.startsWith("CUS") && codePart.length > 3) {
      return (
        !!c.familyGroupId &&
        normalizeSearchText(c.customerCode).includes(normalizeSearchText(codePart))
      );
    }
    return !!c.familyGroupId;
  }

  const phoneQ = normalizePhone(q);
  if (phoneQ.length >= 3) {
    const phone = normalizePhone(c.phone);
    if (phone.includes(phoneQ)) return true;
  }

  const hay = normalizeSearchText(
    `${c.fullName} ${c.phone} ${c.customerCode}${c.familyGroupId ? " gd giadinh" : ""}`
  );
  const needle = normalizeSearchText(q);
  if (needle && hay.includes(needle)) return true;

  const tokens = q
    .split(/\s+/)
    .map((t) => normalizeSearchText(t))
    .filter((t) => t.length > 0);
  if (tokens.length > 1 && tokens.every((t) => hay.includes(t))) return true;

  return false;
}

/**
 * Build a tight customer search filter (server).
 * Avoids `contains: ""` on phone (matches everyone).
 */
export function buildCustomerSearchWhere(query: string): Prisma.CustomerWhereInput | null {
  const q = query.trim();
  if (!q) return null;

  if (isFamilySearchQuery(q)) {
    const codePart = stripFamilyIdSuffix(q);
    if (codePart.startsWith("CUS") && codePart.length > 3) {
      return {
        AND: [
          { familyGroupId: { not: null } },
          { customerCode: { contains: codePart, mode: "insensitive" } },
        ],
      };
    }
    return { familyGroupId: { not: null } };
  }

  const phoneNorm = normalizePhone(q);
  const looksLikePhone = phoneNorm.length >= 3;
  const looksLikeCode = /^cus/i.test(q) || /^[A-Z]{2,}-\d+/i.test(q);

  const or: Prisma.CustomerWhereInput[] = [];

  if (looksLikePhone) {
    or.push(
      { phone: { contains: phoneNorm } },
      { phoneNormalized: { contains: phoneNorm } }
    );
  }

  if (looksLikeCode || q.toUpperCase().startsWith("CUS")) {
    const code = stripFamilyIdSuffix(q) || q.toUpperCase().replace(/\s+/g, "");
    or.push({ customerCode: { contains: code, mode: "insensitive" } });
    or.push({
      AND: [
        { familyGroupId: { not: null } },
        { customerCode: { contains: code.replace(/-GĐ$/i, ""), mode: "insensitive" } },
      ],
    });
  }

  const tokens = q
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 1 && !/^\d+$/.test(t));

  if (tokens.length > 0 && !looksLikePhone) {
    or.push({
      AND: tokens.map((token) => ({
        fullName: { contains: token, mode: "insensitive" as const },
      })),
    });
    // Tên gia đình lưu trên FamilyGroup
    or.push({
      familyGroup: {
        name: { contains: q, mode: "insensitive" },
      },
    });
  } else if (tokens.length > 0) {
    or.push({
      fullName: { contains: q, mode: "insensitive" },
    });
  }

  if (or.length === 0) {
    or.push({ fullName: { contains: q, mode: "insensitive" } });
  }

  return { OR: or };
}

export function rankCustomerMatches<
  T extends {
    fullName: string;
    phone: string;
    phoneNormalized: string;
    customerCode: string;
    familyGroupId?: string | null;
  },
>(rows: T[], query: string): T[] {
  const phoneNorm = normalizePhone(query);
  const qCompact = normalizeSearchText(query);
  const familyQ = isFamilySearchQuery(query);

  return [...rows].sort((a, b) => score(b) - score(a));

  function score(c: T) {
    const nameN = normalizeSearchText(c.fullName);
    let s = 0;
    if (familyQ && c.familyGroupId) s += 60;
    if (nameN === qCompact) s += 100;
    if (nameN.startsWith(qCompact)) s += 50;
    if (nameN.includes(qCompact)) s += 20;
    if (phoneNorm && (c.phoneNormalized.includes(phoneNorm) || c.phone.includes(phoneNorm))) {
      s += phoneNorm.length >= 8 ? 80 : 30;
    }
    if (normalizeSearchText(c.customerCode).includes(qCompact)) s += 40;
    if (c.familyGroupId && (qCompact === "gd" || qCompact.includes("gd"))) s += 30;
    return s;
  }
}
