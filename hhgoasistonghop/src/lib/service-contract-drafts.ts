import { prisma } from "@/lib/prisma";
import { displayMemberCode } from "@/lib/member-code";
import { GENDERS } from "@/config/crm.config";

export type ContractFillStatus = "EMPTY" | "EDITED";

export async function nextServiceContractFormNo(type: "MEMBER" | "SERVICE") {
  const prefix = type === "MEMBER" ? "HD-HV" : "HD-DV";
  const count = await prisma.serviceContract.count({ where: { type } });
  for (let i = count + 1; i < count + 100; i++) {
    const candidate = `${prefix}-${String(i).padStart(6, "0")}`;
    const exists = await prisma.serviceContract.findUnique({ where: { formNo: candidate } });
    if (!exists) return candidate;
  }
  return `${prefix}-${String(Date.now()).slice(-6)}`;
}

function genderLabel(code?: string | null) {
  return GENDERS.find((g) => g.value === code)?.label || code || "";
}

/** Tạo sẵn 2 mẫu Receipt (Hội viên + Dịch vụ) khi tạo khách — trạng thái chưa thông tin */
export async function ensureCustomerReceiptDrafts(params: {
  customerId: string;
  actorId?: string | null;
}) {
  const customer = await prisma.customer.findUnique({
    where: { id: params.customerId },
  });
  if (!customer) return { created: 0 };

  const isFamily = !!customer.familyGroupId;
  const memberCode = displayMemberCode(customer.customerCode, isFamily);
  const basePayload: Record<string, string | boolean> = {
    formDate: new Date().toISOString().slice(0, 10),
    fullName: customer.fullName,
    memberCode,
    isFamily,
    phone: customer.phone,
    email: customer.email || "",
    dateOfBirth: customer.dateOfBirth
      ? customer.dateOfBirth.toISOString().slice(0, 10)
      : "",
    gender: genderLabel(customer.gender),
    address: "",
    payRemain: "0",
    transfer: "Không",
    pause: "Không",
    homeClub: "HHG OASIS · 27/58 Tây Lân, P. Bình Tân, TP.HCM",
  };

  let created = 0;
  for (const type of ["MEMBER", "SERVICE"] as const) {
    const existing = await prisma.serviceContract.findFirst({
      where: { customerId: customer.id, type },
    });
    if (existing) continue;

    const formNo = await nextServiceContractFormNo(type);
    await prisma.serviceContract.create({
      data: {
        type,
        formNo,
        memberCode,
        customerId: customer.id,
        status: "EMPTY",
        payload: {
          ...basePayload,
          formNoHint: formNo.replace(/^HD-/, "HĐ-"),
        },
        createdById: params.actorId || null,
      },
    });
    created += 1;
  }

  return { created };
}
