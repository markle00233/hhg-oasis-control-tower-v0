import { displayMemberCode } from "@/lib/member-code";

/** Mã lưu DB: HD-000001 · hiển thị: HĐ-000001 */
export function displayContractCode(code: string | null | undefined) {
  if (!code) return "—";
  return code.replace(/^HD-/, "HĐ-");
}

export function parseContractCode(input: string) {
  const raw = input.trim().toUpperCase().replace(/\s+/g, "");
  const normalized = raw.replace(/^HĐ-/, "HD-").replace(/^HD/, (m) =>
    m === "HD" && !raw.includes("-") ? "HD" : m
  );
  if (/^HĐ?-?\d+$/i.test(raw) || /^\d+$/.test(raw)) {
    const num = raw.replace(/\D/g, "");
    return `HD-${num.padStart(6, "0")}`;
  }
  if (normalized.startsWith("HD-")) return normalized;
  return raw.startsWith("HD") ? raw : `HD-${raw}`;
}

export function membershipToCsvRow(m: {
  contractCode: string;
  membershipCode: string;
  startDate: Date;
  expiryDate: Date;
  createdAt: Date;
  status: string;
  note: string | null;
  customer: {
    fullName: string;
    phone: string;
    customerCode: string;
    familyGroupId?: string | null;
  };
  plan: { name: string; planCode: string };
  createdBy: { fullName: string; email: string } | null;
}) {
  const memberCode = displayMemberCode(
    m.customer.customerCode,
    !!m.customer.familyGroupId
  );
  const cols = [
    displayContractCode(m.contractCode),
    memberCode,
    m.customer.fullName,
    m.customer.phone,
    m.plan.name,
    m.plan.planCode,
    m.startDate.toISOString().slice(0, 10),
    m.expiryDate.toISOString().slice(0, 10),
    m.createdAt.toISOString().slice(0, 10),
    m.status,
    m.createdBy?.fullName || "",
    m.note || "",
  ];
  return cols.map(csvEscape).join(",");
}

export const CONTRACT_CSV_HEADER =
  "So hop dong,Ma hoi vien,Ho ten,SDT,Goi,Ma goi,Ngay bat dau,Ngay het han,Ngay dang ky,Trang thai,Nhan vien,Ghi chu";

function csvEscape(value: string) {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export function toCsvFile(rows: string[]) {
  return "\uFEFF" + [CONTRACT_CSV_HEADER, ...rows].join("\n");
}
