import { getPackageByCode, GENDERS } from "@/config/crm.config";
import { displayContractCode } from "@/lib/contract";
import { displayMemberCode, isFamilyCustomer } from "@/lib/member-code";
import { formatDate } from "@/lib/utils";

export type ReceiptMembership = {
  contractCode: string;
  membershipCode: string;
  startDate: Date;
  expiryDate: Date;
  createdAt: Date;
  status: string;
  note: string | null;
  salesPersonCode: string | null;
  customer: {
    customerCode: string;
    fullName: string;
    phone: string;
    email: string | null;
    dateOfBirth: Date | null;
    gender: string | null;
    note: string | null;
    familyGroupId: string | null;
  };
  plan: {
    name: string;
    planCode: string;
    durationDays: number;
    description: string | null;
  };
  createdBy: { fullName: string; email: string } | null;
};

function genderLabel(g?: string | null) {
  return GENDERS.find((x) => x.value === g)?.label || g || "………………";
}

function formatMoney(n?: number | null) {
  if (n == null) return "………………";
  return `${n.toLocaleString("vi-VN")} đ`;
}

function paidMonthsFromPlan(planCode: string, durationDays: number) {
  const m = planCode.match(/_(\d+)M$/i);
  if (m) return Number(m[1]);
  return Math.max(1, Math.round(durationDays / 30));
}

/** Dữ liệu điền sẵn vào 2 mẫu hợp đồng */
export function buildReceiptFormData(m: ReceiptMembership) {
  const pkg = getPackageByCode(m.plan.planCode);
  const family = isFamilyCustomer(m.customer);
  const memberCode = displayMemberCode(m.customer.customerCode, family);
  const months = paidMonthsFromPlan(m.plan.planCode, m.plan.durationDays);
  const priceTotal = pkg?.priceTotal ?? null;
  const priceMonth = pkg?.priceMonth ?? null;
  const promoNote = pkg?.description?.includes("Tặng")
    ? pkg.description.split("·").map((s) => s.trim()).find((s) => s.startsWith("Tặng")) || ""
    : m.plan.description?.includes("Tặng")
      ? m.plan.description
      : "";

  return {
    formNo: displayContractCode(m.contractCode),
    date: formatDate(m.createdAt),
    memberCode,
    isFamily: family,
    registrationType: family ? "Gia đình (GĐ)" : "Cá nhân",
    fullName: m.customer.fullName,
    phone: m.customer.phone,
    email: m.customer.email || "………………",
    dateOfBirth: m.customer.dateOfBirth
      ? formatDate(m.customer.dateOfBirth)
      : "… / … / … …",
    gender: genderLabel(m.customer.gender),
    address: "………………………………………………………………",
    idCard: "………………",
    idIssueDate: "………………",
    idIssuePlace: "………………",
    permanentAddress: "………………………………………………………………",
    guardian: "………………",
    guardianPhone: "………………",
    planName: m.plan.name,
    planMonths: `${months} tháng`,
    durationDays: `${m.plan.durationDays} ngày`,
    startDate: formatDate(m.startDate),
    expiryDate: formatDate(m.expiryDate),
    joinFee: "………………",
    promo: promoNote || "………………",
    payTotal: formatMoney(priceTotal),
    payMonth: formatMoney(priceMonth),
    payPrepaid: formatMoney(priceTotal),
    payRemain: "0 đ",
    payDueDate: "… / … / 20…",
    paymentMethod: "………………",
    transfer: false,
    pause: false,
    homeClub: "HHG OASIS · 27/58 Tây Lân, P. Bình Tân, TP.HCM",
    serviceType: m.plan.name,
    totalSessions: "………………",
    sessionPrice: "………………",
    staffName: m.createdBy?.fullName || "………………",
    note: m.note || "",
    membershipCodeLegacy: m.membershipCode,
  };
}

export type ReceiptFormData = ReturnType<typeof buildReceiptFormData>;
