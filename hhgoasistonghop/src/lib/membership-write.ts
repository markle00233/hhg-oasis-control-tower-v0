import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/codes";

export async function nextMembershipCodes() {
  const n = (await prisma.membership.count()) + 1;
  const pad = (offset: number) => String(n + offset).padStart(6, "0");
  let membershipCode = `MEM-${pad(0)}`;
  let contractCode = `HD-${pad(0)}`;

  for (let i = 0; i < 30; i++) {
    const [mem, hd] = await Promise.all([
      prisma.membership.findUnique({ where: { membershipCode: `MEM-${pad(i)}` } }),
      prisma.membership.findUnique({ where: { contractCode: `HD-${pad(i)}` } }),
    ]);
    if (!mem) membershipCode = `MEM-${pad(i)}`;
    if (!hd) contractCode = `HD-${pad(i)}`;
    if (!mem && !hd) {
      membershipCode = `MEM-${pad(i)}`;
      contractCode = `HD-${pad(i)}`;
      break;
    }
  }

  return { membershipCode, contractCode };
}

export async function insertMembership(params: {
  customerId: string;
  planId: string;
  planName: string;
  startDate: Date;
  expiryDate: Date;
  note?: string | null;
  actorId: string | null;
  renewedFromId?: string | null;
  salesPersonCode?: string | null;
}) {
  const { membershipCode, contractCode } = await nextMembershipCodes();
  const row = await prisma.membership.create({
    data: {
      membershipCode,
      contractCode,
      customerId: params.customerId,
      planId: params.planId,
      startDate: params.startDate,
      expiryDate: params.expiryDate,
      status: "ACTIVE",
      note: params.note ?? null,
      createdById: params.actorId,
      renewedFromId: params.renewedFromId ?? null,
      salesPersonCode: params.salesPersonCode ?? null,
    },
  });
  await logActivity({
    customerId: params.customerId,
    activityType: params.renewedFromId ? "MEMBERSHIP_RENEWED" : "MEMBERSHIP_REGISTERED",
    title: params.renewedFromId
      ? `Gia hạn – ${params.planName}`
      : `Membership Registered – ${params.planName}`,
    note: `${membershipCode} · ${contractCode.replace(/^HD-/, "HĐ-")} · đến ${params.expiryDate.toLocaleDateString("vi-VN")}`,
    staffId: params.actorId ?? undefined,
  });
  return row;
}
