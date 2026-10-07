import { displayMemberCode } from "@/lib/member-code";

export type ContractType = "MEMBER" | "SERVICE";

export type MemberContractPayload = {
  formDate: string;
  fullName: string;
  memberCode: string;
  isFamily: boolean;
  phone: string;
  email: string;
  dateOfBirth: string;
  gender: string;
  address: string;
  planName: string;
  planMonths: string;
  startDate: string;
  expiryDate: string;
  joinFee: string;
  promo: string;
  payTotal: string;
  payPrepaid: string;
  payRemain: string;
  payDueDate: string;
  paymentMethod: string;
  transfer: string;
  pause: string;
  emergencyName: string;
  emergencyPhone: string;
  emergencyRelation: string;
  emergencyAddress: string;
  staffName: string;
  note: string;
};

export type ServiceContractPayload = {
  formDate: string;
  fullName: string;
  memberCode: string;
  isFamily: boolean;
  dateOfBirth: string;
  gender: string;
  idCard: string;
  idIssueDate: string;
  idIssuePlace: string;
  address: string;
  permanentAddress: string;
  phone: string;
  email: string;
  guardian: string;
  guardianPhone: string;
  serviceType: string;
  totalSessions: string;
  sessionPrice: string;
  promo: string;
  payTotal: string;
  homeClub: string;
  payPrepaid: string;
  payRemain: string;
  staffName: string;
  note: string;
};

export type AnyContractPayload = MemberContractPayload | ServiceContractPayload;

export function normalizeMemberCodeInput(raw: string, isFamily: boolean): string {
  const base = raw.trim().toUpperCase().replace(/\s*-\s*G[ĐD]\s*$/i, "").replace(/\s+/g, "");
  if (!base) return "";
  const withPrefix = base.startsWith("CUS-")
    ? base
    : base.startsWith("CUS")
      ? `CUS-${base.slice(3).replace(/^-+/, "")}`
      : /^\d+$/.test(base)
        ? `CUS-${base.padStart(6, "0")}`
        : base;
  return displayMemberCode(withPrefix, isFamily);
}

export function baseCustomerCodeFromMemberCode(memberCode: string): string {
  return memberCode.trim().replace(/\s*-\s*G[ĐD]\s*$/i, "").toUpperCase();
}

export function emptyMemberPayload(partial?: Partial<MemberContractPayload>): MemberContractPayload {
  return {
    formDate: new Date().toISOString().slice(0, 10),
    fullName: "",
    memberCode: "",
    isFamily: false,
    phone: "",
    email: "",
    dateOfBirth: "",
    gender: "",
    address: "",
    planName: "",
    planMonths: "",
    startDate: new Date().toISOString().slice(0, 10),
    expiryDate: "",
    joinFee: "",
    promo: "",
    payTotal: "",
    payPrepaid: "",
    payRemain: "0",
    payDueDate: "",
    paymentMethod: "",
    transfer: "Không",
    pause: "Không",
    emergencyName: "",
    emergencyPhone: "",
    emergencyRelation: "",
    emergencyAddress: "",
    staffName: "",
    note: "",
    ...partial,
  };
}

export function emptyServicePayload(
  partial?: Partial<ServiceContractPayload>
): ServiceContractPayload {
  return {
    formDate: new Date().toISOString().slice(0, 10),
    fullName: "",
    memberCode: "",
    isFamily: false,
    dateOfBirth: "",
    gender: "",
    idCard: "",
    idIssueDate: "",
    idIssuePlace: "",
    address: "",
    permanentAddress: "",
    phone: "",
    email: "",
    guardian: "",
    guardianPhone: "",
    serviceType: "",
    totalSessions: "",
    sessionPrice: "",
    promo: "",
    payTotal: "",
    homeClub: "HHG OASIS · 27/58 Tây Lân, P. Bình Tân, TP.HCM",
    payPrepaid: "",
    payRemain: "0",
    staffName: "",
    note: "",
    ...partial,
  };
}

/** Map payload → dữ liệu in (reuse contract print components) */
export function payloadToPrintData(
  type: ContractType,
  formNo: string,
  payload: AnyContractPayload
) {
  const common = {
    formNo: formNo.replace(/^HD-/, "HĐ-"),
    date: payload.formDate
      ? new Date(payload.formDate).toLocaleDateString("vi-VN")
      : "………………",
    memberCode: payload.memberCode || "………………",
    isFamily: payload.isFamily,
    registrationType: payload.isFamily ? "Gia đình (GĐ)" : "Cá nhân",
    fullName: payload.fullName || "………………",
    phone: payload.phone || "………………",
    email: payload.email || "………………",
    dateOfBirth: payload.dateOfBirth
      ? /^\d{4}-\d{2}-\d{2}$/.test(payload.dateOfBirth)
        ? new Date(payload.dateOfBirth).toLocaleDateString("vi-VN")
        : payload.dateOfBirth
      : "… / … / … …",
    gender: payload.gender || "………………",
    address: "address" in payload ? payload.address || "………………" : "………………",
    idCard: "idCard" in payload ? payload.idCard || "………………" : "………………",
    idIssueDate: "idIssueDate" in payload ? payload.idIssueDate || "………………" : "………………",
    idIssuePlace: "idIssuePlace" in payload ? payload.idIssuePlace || "………………" : "………………",
    permanentAddress:
      "permanentAddress" in payload ? payload.permanentAddress || "………………" : "………………",
    guardian: "guardian" in payload ? payload.guardian || "………………" : "………………",
    guardianPhone: "guardianPhone" in payload ? payload.guardianPhone || "………………" : "………………",
    planName: "planName" in payload ? payload.planName || "………………" : "………………",
    planMonths: "planMonths" in payload ? payload.planMonths || "………………" : "………………",
    durationDays: "………………",
    startDate: "startDate" in payload ? payload.startDate || "………………" : "………………",
    expiryDate: "expiryDate" in payload ? payload.expiryDate || "………………" : "………………",
    joinFee: "joinFee" in payload ? payload.joinFee || "………………" : "………………",
    promo: payload.promo || "………………",
    payTotal: payload.payTotal || "………………",
    payMonth: "………………",
    payPrepaid: payload.payPrepaid || "………………",
    payRemain: payload.payRemain || "………………",
    payDueDate: "payDueDate" in payload ? payload.payDueDate || "………………" : "………………",
    paymentMethod: "paymentMethod" in payload ? payload.paymentMethod || "………………" : "………………",
    transfer: "transfer" in payload ? payload.transfer === "Có" : false,
    pause: "pause" in payload ? payload.pause === "Có" : false,
    homeClub:
      "homeClub" in payload
        ? payload.homeClub || "HHG OASIS · 27/58 Tây Lân, P. Bình Tân, TP.HCM"
        : "HHG OASIS · 27/58 Tây Lân, P. Bình Tân, TP.HCM",
    serviceType: "serviceType" in payload ? payload.serviceType || "………………" : "………………",
    totalSessions: "totalSessions" in payload ? payload.totalSessions || "………………" : "………………",
    sessionPrice: "sessionPrice" in payload ? payload.sessionPrice || "………………" : "………………",
    staffName: payload.staffName || "………………",
    note: payload.note || "",
    membershipCodeLegacy: "",
  };

  if (type === "MEMBER" && "emergencyName" in payload) {
    return {
      ...common,
      guardian: payload.emergencyName || "………………",
      startDate: payload.startDate
        ? /^\d{4}-\d{2}-\d{2}$/.test(payload.startDate)
          ? new Date(payload.startDate).toLocaleDateString("vi-VN")
          : payload.startDate
        : "………………",
      expiryDate: payload.expiryDate
        ? /^\d{4}-\d{2}-\d{2}$/.test(payload.expiryDate)
          ? new Date(payload.expiryDate).toLocaleDateString("vi-VN")
          : payload.expiryDate
        : "………………",
    };
  }

  return common;
}
