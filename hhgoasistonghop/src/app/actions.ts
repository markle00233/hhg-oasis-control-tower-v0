"use server";

import { auth, canWrite, isAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { normalizePhone } from "@/lib/utils";
import { logActivity, nextCode } from "@/lib/codes";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { findServiceOverlap, overlapAlertMessage } from "@/lib/overlap";
import { insertMembership } from "@/lib/membership-write";
import {
  familyPhoneConflict,
  getCustomerEntitlements,
} from "@/lib/entitlements";
import { startOfDay } from "@/lib/attendance";
import { notifyOps } from "@/lib/ops-notice";
import { INTERNAL_ACCESS_PASSWORD } from "@/config/crm.config";
import { parseSalesPersonCode, requireSalesPersonCode } from "@/lib/sales";
import { resolveActorIdForSession } from "@/lib/actor";
import { userCanFeature } from "@/lib/features";

async function requireStaff() {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  return session;
}

async function requireWrite() {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  if (!canWrite(session.user.role)) throw new Error("Không có quyền thao tác");
  if (!isAdmin(session.user.role)) {
    const ok = await userCanFeature(session.user.id, "customers_write");
    if (!ok) throw new Error("Không có quyền thao tác");
  }
  return session;
}

async function requireReceiptWrite() {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  if (!canWrite(session.user.role)) throw new Error("Không có quyền thao tác");
  if (!isAdmin(session.user.role)) {
    const ok = await userCanFeature(session.user.id, "receipts_write");
    if (!ok) throw new Error("Không có quyền chỉnh sửa hợp đồng");
  }
  return session;
}

async function requireAdmin() {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  if (!isAdmin(session.user.role)) throw new Error("Chỉ Admin được vào mục này");
  return session;
}

/** Map session → user thật trong DB */
async function resolveActorId(sessionUserId: string | undefined | null): Promise<string | null> {
  return resolveActorIdForSession(sessionUserId);
}

/** Resolve start/expiry from form: default = start + durationDays, custom = endDate */
function resolveMembershipDates(
  formData: FormData,
  fallbackDurationDays: number
): { startDate: Date; expiryDate: Date } | { error: string } {
  const mode = String(formData.get("dateMode") || "default");
  const startStr = String(formData.get("startDate") || "");
  const endStr = String(formData.get("endDate") || "");

  const startDate = startStr ? new Date(startStr) : new Date();
  if (Number.isNaN(startDate.getTime())) {
    return { error: "Ngày bắt đầu không hợp lệ" };
  }
  startDate.setHours(0, 0, 0, 0);

  let expiryDate: Date;
  if (mode === "custom") {
    if (!endStr) return { error: "Chọn ngày kết thúc (Custom)" };
    expiryDate = new Date(endStr);
    if (Number.isNaN(expiryDate.getTime())) {
      return { error: "Ngày kết thúc không hợp lệ" };
    }
    expiryDate.setHours(0, 0, 0, 0);
    if (expiryDate < startDate) {
      return { error: "Ngày kết thúc phải sau hoặc bằng ngày bắt đầu" };
    }
  } else {
    expiryDate = new Date(startDate);
    expiryDate.setDate(expiryDate.getDate() + fallbackDurationDays);
  }

  return { startDate, expiryDate };
}

async function loadPlansFromForm(formData: FormData) {
  const planCodes = formData.getAll("planCodes").map(String).filter(Boolean);
  const legacyPlanId = String(formData.get("planId") || "");
  let plans =
    planCodes.length > 0
      ? await prisma.membershipPlan.findMany({
          where: { planCode: { in: planCodes }, status: "ACTIVE" },
        })
      : [];
  if (plans.length === 0 && legacyPlanId) {
    const one = await prisma.membershipPlan.findUnique({ where: { id: legacyPlanId } });
    if (one && one.status === "ACTIVE") plans = [one];
  }
  return plans;
}

type FamilyMemberInput = {
  fullName: string;
  phone: string;
  email: string | null;
  gender: string | null;
  dateOfBirth: Date | null;
  relation: string;
  note: string | null;
};

function parseFamilyMembers(formData: FormData): FamilyMemberInput[] {
  const raw = String(formData.get("familyMembers") || "").trim();
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return [];
    return arr
      .map((row) => {
        const r = row as Record<string, unknown>;
        const fullName = String(r.fullName || "").trim();
        const phone = String(r.phone || "").trim();
        const dob = String(r.dateOfBirth || "").trim();
        return {
          fullName,
          phone,
          email: String(r.email || "").trim() || null,
          gender: String(r.gender || "").trim() || null,
          dateOfBirth: dob ? new Date(dob) : null,
          relation: String(r.relation || "OTHER").trim() || "OTHER",
          note: String(r.note || "").trim() || null,
        };
      })
      .filter((m) => m.fullName.length > 0);
  } catch {
    return [];
  }
}

export async function createCustomer(formData: FormData) {
  try {
    const session = await requireWrite();
    const actorId = await resolveActorId(session.user.id);

    const fullName = String(formData.get("fullName") || "").trim();
    const phone = String(formData.get("phone") || "").trim();
    if (!fullName || !phone) {
      return { ok: false as const, error: "Tên và số điện thoại là bắt buộc" };
    }

    const phoneNormalized = normalizePhone(phone);
    const addToFamily = String(formData.get("addToFamily") || "") === "1";
    const familyGroupId = String(formData.get("familyGroupId") || "");

    const family = await familyPhoneConflict(phoneNormalized);
    if (family && !addToFamily) {
      return {
        ok: false as const,
        familyPhone: true as const,
        groupId: family.id,
        ownerName: family.owner.fullName,
        members: family.members.map((m) => m.fullName),
        error: `SĐT này thuộc gói gia đình của ${family.owner.fullName}. Người không có trong danh sách không được vào bằng số này — thêm vào gia đình hoặc tạo khách gói lẻ với SĐT riêng.`,
      };
    }

    if (!addToFamily) {
      const existing = await prisma.customer.findFirst({
        where: { phoneNormalized },
        orderBy: { createdAt: "asc" },
      });
      if (existing) {
        return {
          duplicate: true as const,
          customerId: existing.id,
          customerCode: existing.customerCode,
          fullName: existing.fullName,
          phone: existing.phone,
        };
      }
    }

    const plans = await loadPlansFromForm(formData);
    const confirmOverlap = String(formData.get("confirmOverlap") || "") === "1";

    const customerCode = await nextCode("CUS", "customer");
    const dobStr = String(formData.get("dateOfBirth") || "");
    const salesPersonCode = parseSalesPersonCode(formData);
    const customer = await prisma.customer.create({
      data: {
        customerCode,
        fullName,
        phone,
        phoneNormalized,
        email: String(formData.get("email") || "") || null,
        gender: String(formData.get("gender") || "") || null,
        source: String(formData.get("source") || "WALK_IN"),
        note: String(formData.get("note") || "") || null,
        personality: String(formData.get("personality") || "").trim() || null,
        salesPersonCode,
        dateOfBirth: dobStr ? new Date(dobStr) : null,
        familyGroupId: addToFamily && familyGroupId ? familyGroupId : null,
      },
    });

    await logActivity({
      customerId: customer.id,
      activityType: "CUSTOMER_CREATED",
      title: "Customer Created",
      staffId: actorId ?? undefined,
    });

    const familyMembers = parseFamilyMembers(formData);
    if (familyMembers.length > 0) {
      const existingGroup = await prisma.familyGroup.findUnique({
        where: { phoneNormalized },
      });
      if (existingGroup) {
        return {
          ok: false as const,
          error: "SĐT này đã gắn gói gia đình khác",
          customerId: customer.id,
        };
      }
      const groupCode = await nextCode("FAM", "family");
      const group = await prisma.familyGroup.create({
        data: {
          groupCode,
          name: `Gia đình ${fullName}`,
          phone,
          phoneNormalized,
          ownerId: customer.id,
        },
      });
      await prisma.customer.update({
        where: { id: customer.id },
        data: { familyGroupId: group.id },
      });
      await logActivity({
        customerId: customer.id,
        activityType: "FAMILY_CREATED",
        title: "Tạo gói gia đình",
        note: `${groupCode} · ${familyMembers.length} thành viên`,
        staffId: actorId ?? undefined,
      });

      for (const m of familyMembers) {
        const memberPhone = m.phone || phone;
        const memberPhoneNorm = normalizePhone(memberPhone) || phoneNormalized;
        const memberCode = await nextCode("CUS", "customer");
        const member = await prisma.customer.create({
          data: {
            customerCode: memberCode,
            fullName: m.fullName,
            phone: memberPhone,
            phoneNormalized: memberPhoneNorm,
            email: m.email,
            gender: m.gender,
            dateOfBirth: m.dateOfBirth,
            source: "FAMILY",
            note: m.relation ? `Quan hệ: ${m.relation}${m.note ? ` · ${m.note}` : ""}` : m.note,
            familyGroupId: group.id,
          },
        });
        await logActivity({
          customerId: member.id,
          activityType: "FAMILY_MEMBER_ADDED",
          title: `Thành viên gia đình ${groupCode}`,
          note: m.fullName,
          staffId: actorId ?? undefined,
        });
      }
    }

    if (plans.length > 0) {
      const memSales = requireSalesPersonCode(formData);
      if (typeof memSales === "object") {
        return { ok: false as const, error: memSales.error, customerId: customer.id };
      }
      if (!confirmOverlap) {
        const overlapping = await findServiceOverlap(
          customer.id,
          plans.map((p) => p.id)
        );
        if (overlapping.length > 0) {
          return {
            overlap: true as const,
            message: overlapAlertMessage(overlapping),
            overlapping,
            customerId: customer.id,
          };
        }
      }
      for (const plan of plans) {
        const dates = resolveMembershipDates(formData, plan.durationDays || 30);
        if ("error" in dates) {
          return { ok: false as const, error: dates.error, customerId: customer.id };
        }
        await insertMembership({
          customerId: customer.id,
          planId: plan.id,
          planName: plan.name,
          startDate: dates.startDate,
          expiryDate: dates.expiryDate,
          actorId,
          salesPersonCode: memSales,
        });
      }
    }

    revalidatePath("/customers");
    revalidatePath("/");
    revalidatePath("/internal");
    revalidatePath("/receipts");

    // Receipt drafts chạy sau response — không làm chậm nút Lưu
    const customerIdForDrafts = customer.id;
    after(async () => {
      try {
        const { ensureCustomerReceiptDrafts } = await import("@/lib/service-contract-drafts");
        await ensureCustomerReceiptDrafts({
          customerId: customerIdForDrafts,
          actorId,
        });
        revalidatePath("/receipts");
      } catch (e) {
        console.error("[createCustomer] receipt drafts", e);
      }
    });

    await notifyOps({
      actorId,
      title: familyMembers.length > 0 ? "Tạo khách + gói gia đình" : "Tạo khách mới",
      detail:
        familyMembers.length > 0
          ? `${fullName} · ${familyMembers.length + 1} thành viên`
          : fullName,
      href: `/customers/${customer.id}`,
    });
    return { ok: true as const, customerId: customer.id };
  } catch (err) {
    console.error("[createCustomer]", err);
    const prismaErr = err as { code?: string; meta?: { target?: string[] } };
    if (prismaErr?.code === "P2002") {
      const target = prismaErr.meta?.target || [];
      if (target.includes("phoneNormalized") || target.includes("phone")) {
        const phone = String(formData.get("phone") || "").trim();
        const phoneNormalized = normalizePhone(phone);
        const existing = phoneNormalized
          ? await prisma.customer.findFirst({
              where: { phoneNormalized },
              orderBy: { createdAt: "asc" },
            })
          : null;
        if (existing) {
          return {
            duplicate: true as const,
            customerId: existing.id,
            customerCode: existing.customerCode,
            fullName: existing.fullName,
            phone: existing.phone,
          };
        }
        return {
          ok: false as const,
          error: "SĐT này đã tồn tại trong hệ thống. Mở hồ sơ khách cũ hoặc dùng SĐT khác.",
        };
      }
    }
    return {
      ok: false as const,
      error: err instanceof Error ? err.message : "Không tạo được khách",
    };
  }
}

export async function addCustomerNote(formData: FormData) {
  const session = await requireWrite();
  const actorId = await resolveActorId(session.user.id);
  const customerId = String(formData.get("customerId"));
  const content = String(formData.get("content") || "").trim();
  if (!content) throw new Error("Nội dung ghi chú trống");

  await prisma.customerNote.create({
    data: { customerId, content, authorId: actorId },
  });
  await prisma.customer.update({
    where: { id: customerId },
    data: { note: content },
  });
  await logActivity({
    customerId,
    activityType: "NOTE",
    title: "Note added",
    note: content.slice(0, 200),
    staffId: actorId ?? undefined,
  });

  revalidatePath(`/customers/${customerId}`);
}

export async function updateCustomerProfile(formData: FormData) {
  try {
    await requireWrite();
    const customerId = String(formData.get("customerId"));
    const note = String(formData.get("note") || "").trim() || null;
    const personality = String(formData.get("personality") || "").trim() || null;

    await prisma.customer.update({
      where: { id: customerId },
      data: { note, personality },
    });

    revalidatePath(`/customers/${customerId}`);
    revalidatePath("/customers");
    return { ok: true as const };
  } catch (err) {
    return {
      ok: false as const,
      error: err instanceof Error ? err.message : "Không lưu được",
    };
  }
}

export async function registerMembership(formData: FormData) {
  try {
    const session = await requireWrite();
    const actorId = await resolveActorId(session.user.id);
    const customerId = String(formData.get("customerId"));
    const note = String(formData.get("note") || "") || null;
    const confirmOverlap = String(formData.get("confirmOverlap") || "") === "1";

    const plans = await loadPlansFromForm(formData);
    if (plans.length === 0) {
      return { ok: false as const, error: "Chọn ít nhất 1 gói membership hợp lệ" };
    }

    const memSales = requireSalesPersonCode(formData);
    if (typeof memSales === "object") {
      return { ok: false as const, error: memSales.error };
    }

    if (!confirmOverlap) {
      const overlapping = await findServiceOverlap(
        customerId,
        plans.map((p) => p.id)
      );
      if (overlapping.length > 0) {
        return {
          overlap: true as const,
          message: overlapAlertMessage(overlapping),
          overlapping,
        };
      }
    }

    const membershipCodes: string[] = [];
    const contractCodes: string[] = [];

    for (const plan of plans) {
      const dates = resolveMembershipDates(formData, plan.durationDays || 30);
      if ("error" in dates) {
        return { ok: false as const, error: dates.error };
      }
      const row = await insertMembership({
        customerId,
        planId: plan.id,
        planName: plan.name,
        startDate: dates.startDate,
        expiryDate: dates.expiryDate,
        note,
        actorId,
        salesPersonCode: memSales,
      });
      membershipCodes.push(row.membershipCode);
      contractCodes.push(row.contractCode);
    }

    revalidatePath(`/customers/${customerId}`);
    revalidatePath("/customers");
    revalidatePath("/receipts");
    revalidatePath("/");
    revalidatePath("/internal");
    await notifyOps({
      actorId,
      title: "Đăng ký membership",
      detail: membershipCodes.join(", "),
      href: `/customers/${customerId}?tab=membership`,
    });
    return {
      ok: true as const,
      membershipCodes,
      contractCodes,
      membershipCode: membershipCodes[0],
    };
  } catch (err) {
    console.error("[registerMembership]", err);
    return {
      ok: false as const,
      error: err instanceof Error ? err.message : "Không đăng ký được membership",
    };
  }
}

export async function renewMembership(formData: FormData) {
  try {
    const session = await requireWrite();
    const actorId = await resolveActorId(session.user.id);
    const membershipId = String(formData.get("membershipId") || "");
    const old = await prisma.membership.findUnique({
      where: { id: membershipId },
      include: { plan: true, customer: true },
    });
    if (!old) return { ok: false as const, error: "Không tìm thấy gói để gia hạn" };

    const dates = resolveMembershipDates(formData, old.plan.durationDays || 30);
    if ("error" in dates) return { ok: false as const, error: dates.error };

    const row = await insertMembership({
      customerId: old.customerId,
      planId: old.planId,
      planName: old.plan.name,
      startDate: dates.startDate,
      expiryDate: dates.expiryDate,
      note: String(formData.get("note") || "") || `Gia hạn từ ${old.contractCode}`,
      actorId,
      renewedFromId: old.id,
      salesPersonCode: old.salesPersonCode,
    });

    revalidatePath(`/customers/${old.customerId}`);
    revalidatePath("/customers");
    revalidatePath("/receipts");
    await notifyOps({
      actorId,
      title: "Gia hạn gói",
      detail: `${old.customer.fullName} · ${old.plan.name}`,
      href: `/customers/${old.customerId}?tab=membership`,
    });
    return {
      ok: true as const,
      membershipCode: row.membershipCode,
      contractCode: row.contractCode,
    };
  } catch (err) {
    console.error("[renewMembership]", err);
    return {
      ok: false as const,
      error: err instanceof Error ? err.message : "Không gia hạn được",
    };
  }
}

export async function performCheckin(formData: FormData) {
  try {
    const session = await requireWrite();
    const actorId = await resolveActorId(session.user.id);
    const customerId = String(formData.get("customerId"));
    const membershipIdRaw = String(formData.get("membershipId") || "").trim();
    let serviceIds = formData.getAll("serviceIds").map(String).filter(Boolean);
    const note = String(formData.get("note") || "") || null;

    const now = new Date();
    const visitDate = startOfDay(now);

    let membershipCode: string | null = null;
    let membershipName: string | null = null;
    let membershipId: string | null = null;

    if (membershipIdRaw) {
      const mem = await prisma.membership.findFirst({
        where: { id: membershipIdRaw, customerId },
        include: {
          plan: { include: { services: { include: { service: true } } } },
        },
      });
      if (!mem) {
        return { ok: false as const, error: "Không tìm thấy gói này của khách" };
      }
      membershipId = mem.id;
      membershipCode = mem.membershipCode;
      membershipName = mem.plan.name;
      const planServiceIds = mem.plan.services.map((ps) => ps.serviceId);
      if (planServiceIds.length > 0) {
        serviceIds = planServiceIds;
      }
    }

    if (serviceIds.length === 0) {
      return { ok: false as const, error: "Chọn ít nhất 1 dịch vụ" };
    }

    const entitled = await getCustomerEntitlements(customerId);
    const entitledIds = new Set(entitled.map((s) => s.id));
    const blocked = serviceIds.filter((id) => !entitledIds.has(id));
    if (entitled.length > 0 && blocked.length > 0) {
      return {
        ok: false as const,
        error:
          "Khách không có quyền một hoặc nhiều dịch vụ đã chọn (không nằm trong gói / gói gia đình / promotion). Người lạ biết SĐT gia đình nhưng không có trong danh sách thì phải mua gói lẻ.",
      };
    }

    const visitCode = await nextCode("VIS", "visit");
    const visit = await prisma.visit.create({
      data: {
        visitCode,
        customerId,
        membershipId,
        checkInAt: now,
        visitDate,
        note:
          note ||
          (membershipCode ? `Check-in gói ${membershipCode}` : null),
        staffId: actorId,
      },
    });

    const customer = await prisma.customer.findUnique({ where: { id: customerId } });
    await prisma.customer.update({
      where: { id: customerId },
      data: {
        lastVisitAt: now,
        totalVisits: { increment: 1 },
        firstVisitAt: customer?.firstVisitAt ?? now,
      },
    });

    const services = await prisma.service.findMany({
      where: { id: { in: serviceIds }, status: "ACTIVE" },
    });

    for (const service of services) {
      await prisma.serviceUsage.create({
        data: {
          visitId: visit.id,
          customerId,
          serviceId: service.id,
          startedAt: now,
          status: "ACTIVE",
        },
      });

      await logActivity({
        customerId,
        activityType: "CHECK_IN",
        serviceId: service.id,
        title: `${service.name} Check-in`,
        note: `Visit ${visit.visitCode}`,
        staffId: actorId ?? undefined,
      });
    }

    revalidatePath("/checkin");
    revalidatePath(`/customers/${customerId}`);
    revalidatePath("/");
    const todayCount = await prisma.visit.count({
      where: {
        customerId,
        visitDate,
        ...(membershipId ? { membershipId } : {}),
      },
    });
    const serviceNames = services.map((s) => s.name).join(", ");
    await notifyOps({
      actorId,
      title: membershipName
        ? `Check-in +1 ${membershipName} (lần ${todayCount})`
        : `Check-in lần ${todayCount}`,
      detail: `${customer?.fullName || visit.visitCode}${serviceNames ? ` · ${serviceNames}` : ""}`,
      href: `/customers/${customerId}?tab=checkin`,
    });
    return {
      ok: true as const,
      visitCode: visit.visitCode,
      checkInCountToday: todayCount,
      serviceNames,
      membershipCode,
    };
  } catch (err) {
    console.error("[performCheckin]", err);
    return {
      ok: false as const,
      error: err instanceof Error ? err.message : "Check-in lỗi",
    };
  }
}

export async function checkoutVisit(visitId: string) {
  await requireWrite();
  const now = new Date();
  await prisma.visit.update({
    where: { id: visitId },
    data: { checkOutAt: now },
  });
  await prisma.serviceUsage.updateMany({
    where: { visitId, status: "ACTIVE" },
    data: { endedAt: now, status: "COMPLETED" },
  });
  revalidatePath("/checkin");
}

export async function createFamilyGroup(formData: FormData) {
  try {
    const session = await requireWrite();
    const actorId = await resolveActorId(session.user.id);
    const ownerId = String(formData.get("ownerId") || "");
    const owner = await prisma.customer.findUnique({ where: { id: ownerId } });
    if (!owner) return { ok: false as const, error: "Không tìm thấy chủ hộ" };

    const existingOwned = await prisma.familyGroup.findUnique({ where: { ownerId } });
    if (existingOwned) {
      return { ok: false as const, error: "Khách này đã là chủ một gói gia đình" };
    }
    if (owner.familyGroupId) {
      return { ok: false as const, error: "Khách đã thuộc một gia đình khác" };
    }

    const phoneNormalized = owner.phoneNormalized;
    const taken = await prisma.familyGroup.findUnique({ where: { phoneNormalized } });
    if (taken) {
      return { ok: false as const, error: "SĐT này đã gắn gói gia đình khác" };
    }

    const groupCode = await nextCode("FAM", "family");
    const name = String(formData.get("name") || "").trim() || `Gia đình ${owner.fullName}`;

    const group = await prisma.familyGroup.create({
      data: {
        groupCode,
        name,
        phone: owner.phone,
        phoneNormalized,
        ownerId: owner.id,
      },
    });
    await prisma.customer.update({
      where: { id: owner.id },
      data: { familyGroupId: group.id },
    });
    await logActivity({
      customerId: owner.id,
      activityType: "FAMILY_CREATED",
      title: "Tạo gói gia đình",
      note: groupCode,
      staffId: actorId ?? undefined,
    });

    revalidatePath(`/customers/${ownerId}`);
    await notifyOps({
      actorId,
      title: "Tạo gói gia đình",
      detail: owner.fullName,
      href: `/customers/${ownerId}?tab=family`,
    });
    return { ok: true as const, groupId: group.id };
  } catch (err) {
    return {
      ok: false as const,
      error: err instanceof Error ? err.message : "Không tạo được gói gia đình",
    };
  }
}

export async function addFamilyMember(formData: FormData) {
  try {
    const session = await requireWrite();
    const actorId = await resolveActorId(session.user.id);
    const groupId = String(formData.get("groupId") || "");
    const group = await prisma.familyGroup.findUnique({
      where: { id: groupId },
      include: { owner: true },
    });
    if (!group) return { ok: false as const, error: "Không tìm thấy gia đình" };

    const existingId = String(formData.get("existingCustomerId") || "");
    if (existingId) {
      const member = await prisma.customer.findUnique({ where: { id: existingId } });
      if (!member) return { ok: false as const, error: "Không tìm thấy khách" };
      if (member.familyGroupId && member.familyGroupId !== groupId) {
        return { ok: false as const, error: "Khách đã thuộc gia đình khác" };
      }
      await prisma.customer.update({
        where: { id: existingId },
        data: { familyGroupId: groupId },
      });
      await logActivity({
        customerId: existingId,
        activityType: "FAMILY_MEMBER_ADDED",
        title: `Thêm vào gia đình ${group.groupCode}`,
        staffId: actorId ?? undefined,
      });
      revalidatePath(`/customers/${group.ownerId}`);
      revalidatePath(`/customers/${existingId}`);
      return { ok: true as const, customerId: existingId };
    }

    const fullName = String(formData.get("fullName") || "").trim();
    if (!fullName) return { ok: false as const, error: "Nhập tên thành viên" };
    const ownPhone = String(formData.get("phone") || "").trim();
    const phone = ownPhone || group.phone;
    const phoneNormalized = normalizePhone(phone);
    const dobStr = String(formData.get("dateOfBirth") || "");

    const customerCode = await nextCode("CUS", "customer");
    const member = await prisma.customer.create({
      data: {
        customerCode,
        fullName,
        phone,
        phoneNormalized,
        gender: String(formData.get("gender") || "") || null,
        dateOfBirth: dobStr ? new Date(dobStr) : null,
        source: "FAMILY",
        note: String(formData.get("relation") || "") || "Thành viên gia đình",
        familyGroupId: groupId,
      },
    });
    await logActivity({
      customerId: member.id,
      activityType: "FAMILY_MEMBER_ADDED",
      title: `Thành viên gia đình ${group.groupCode}`,
      note: fullName,
      staffId: actorId ?? undefined,
    });
    await logActivity({
      customerId: group.ownerId,
      activityType: "FAMILY_MEMBER_ADDED",
      title: `Thêm ${fullName} vào gia đình`,
      staffId: actorId ?? undefined,
    });

    revalidatePath(`/customers/${group.ownerId}`);
    revalidatePath(`/customers/${member.id}`);
    await notifyOps({
      actorId,
      title: "Thêm thành viên gia đình",
      detail: fullName,
      href: `/customers/${group.ownerId}?tab=family`,
    });
    return { ok: true as const, customerId: member.id };
  } catch (err) {
    return {
      ok: false as const,
      error: err instanceof Error ? err.message : "Không thêm được thành viên",
    };
  }
}

export async function removeFamilyMember(customerId: string) {
  try {
    await requireWrite();
    const member = await prisma.customer.findUnique({
      where: { id: customerId },
      include: { familyGroup: true },
    });
    if (!member?.familyGroupId || !member.familyGroup) {
      return { ok: false as const, error: "Khách không thuộc gia đình nào" };
    }
    if (member.familyGroup.ownerId === customerId) {
      return { ok: false as const, error: "Không gỡ chủ hộ — xóa cả nhóm nếu cần" };
    }
    const ownerId = member.familyGroup.ownerId;
    await prisma.customer.update({
      where: { id: customerId },
      data: { familyGroupId: null },
    });
    revalidatePath(`/customers/${ownerId}`);
    revalidatePath(`/customers/${customerId}`);
    return { ok: true as const };
  } catch (err) {
    return {
      ok: false as const,
      error: err instanceof Error ? err.message : "Không gỡ được",
    };
  }
}

export async function createPromotion(formData: FormData) {
  try {
    const session = await requireWrite();
    const actorId = await resolveActorId(session.user.id);
    const name = String(formData.get("name") || "").trim();
    if (!name) return { ok: false as const, error: "Nhập tên promotion/voucher" };

    const customCode = String(formData.get("code") || "").trim().toUpperCase();
    const code = customCode || (await nextCode("PROMO", "promotion"));
    const exists = await prisma.promotion.findUnique({ where: { code } });
    if (exists) return { ok: false as const, error: "Mã đã tồn tại" };

    const validFrom = String(formData.get("validFrom") || "");
    const validTo = String(formData.get("validTo") || "");
    const serviceId = String(formData.get("serviceId") || "") || null;

    const promo = await prisma.promotion.create({
      data: {
        code,
        name,
        type: String(formData.get("type") || "PROMOTION"),
        description: String(formData.get("description") || "") || null,
        serviceId,
        validFrom: validFrom ? new Date(validFrom) : null,
        validTo: validTo ? new Date(validTo) : null,
        createdById: actorId,
      },
    });

    revalidatePath("/promotions");
    return { ok: true as const, promotionId: promo.id };
  } catch (err) {
    return {
      ok: false as const,
      error: err instanceof Error ? err.message : "Không tạo được promotion",
    };
  }
}

export async function assignPromotion(formData: FormData) {
  try {
    const session = await requireWrite();
    const actorId = await resolveActorId(session.user.id);
    const customerId = String(formData.get("customerId") || "");
    const promotionId = String(formData.get("promotionId") || "");
    if (!customerId || !promotionId) {
      return { ok: false as const, error: "Chọn khách và promotion" };
    }

    const promo = await prisma.promotion.findUnique({ where: { id: promotionId } });
    if (!promo || promo.status !== "ACTIVE") {
      return { ok: false as const, error: "Promotion không còn hiệu lực" };
    }

    const row = await prisma.customerPromotion.create({
      data: {
        customerId,
        promotionId,
        note: String(formData.get("note") || "") || null,
        assignedById: actorId,
      },
    });
    await logActivity({
      customerId,
      activityType: "PROMOTION_ASSIGNED",
      title: `Gắn ${promo.type === "VOUCHER" ? "voucher" : "promotion"} ${promo.name}`,
      note: promo.code,
      staffId: actorId ?? undefined,
    });

    revalidatePath("/promotions");
    revalidatePath(`/customers/${customerId}`);
    revalidatePath("/checkin");
    await notifyOps({
      actorId,
      title: "Gắn promotion",
      detail: promo.name,
      href: `/customers/${customerId}?tab=promotion`,
    });
    return { ok: true as const, id: row.id };
  } catch (err) {
    return {
      ok: false as const,
      error: err instanceof Error ? err.message : "Không gắn được promotion",
    };
  }
}

export async function cancelCustomerPromotion(id: string) {
  try {
    await requireWrite();
    const row = await prisma.customerPromotion.update({
      where: { id },
      data: { status: "CANCELLED" },
    });
    revalidatePath("/promotions");
    revalidatePath(`/customers/${row.customerId}`);
    return { ok: true as const };
  } catch (err) {
    return {
      ok: false as const,
      error: err instanceof Error ? err.message : "Không hủy được",
    };
  }
}

/** Chỉ ADMIN — xóa khách + membership / visit / usage liên quan */
export async function deleteCustomer(customerId: string) {
  try {
    const session = await requireWrite();
    if (session.user.role !== "ADMIN") {
      return { ok: false as const, error: "Chỉ Admin được xóa khách" };
    }

    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      select: { id: true },
    });
    if (!customer) {
      return { ok: false as const, error: "Không tìm thấy khách" };
    }

    await prisma.$transaction(async (tx) => {
      await tx.customerPromotion.deleteMany({ where: { customerId } });
      await tx.serviceUsage.deleteMany({ where: { customerId } });
      await tx.visit.deleteMany({ where: { customerId } });
      await tx.membership.deleteMany({ where: { customerId } });
      await tx.activityLog.deleteMany({ where: { customerId } });
      await tx.customerNote.deleteMany({ where: { customerId } });
      const owned = await tx.familyGroup.findUnique({ where: { ownerId: customerId } });
      if (owned) {
        await tx.customer.updateMany({
          where: { familyGroupId: owned.id },
          data: { familyGroupId: null },
        });
        await tx.familyGroup.delete({ where: { id: owned.id } });
      }
      await tx.customer.delete({ where: { id: customerId } });
    });

    revalidatePath("/customers");
    revalidatePath("/");
    return { ok: true as const };
  } catch (err) {
    console.error("[deleteCustomer]", err);
    return {
      ok: false as const,
      error: err instanceof Error ? err.message : "Không xóa được khách",
    };
  }
}

export async function createMembershipPlan(formData: FormData) {
  const session = await requireStaff();
  if (session.user.role !== "ADMIN") throw new Error("Chỉ Admin được tạo plan");

  const name = String(formData.get("name") || "").trim();
  const durationDays = Number(formData.get("durationDays") || 30);
  const description = String(formData.get("description") || "") || null;
  const serviceIds = formData.getAll("serviceIds").map(String);

  if (!name) throw new Error("Tên plan bắt buộc");
  if (serviceIds.length === 0) throw new Error("Chọn ít nhất 1 service");

  const planCode = name
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 30);

  const plan = await prisma.membershipPlan.create({
    data: {
      planCode: `${planCode}_${Date.now().toString(36).toUpperCase()}`,
      name,
      durationDays,
      description,
      status: "ACTIVE",
      services: {
        create: serviceIds.map((serviceId) => ({ serviceId })),
      },
    },
  });

  revalidatePath("/settings");
  revalidatePath("/customers");
  return { ok: true, planId: plan.id };
}

export async function toggleServiceStatus(serviceId: string) {
  const session = await requireStaff();
  if (session.user.role !== "ADMIN") throw new Error("Chỉ Admin");
  const svc = await prisma.service.findUnique({ where: { id: serviceId } });
  if (!svc) throw new Error("Not found");
  await prisma.service.update({
    where: { id: serviceId },
    data: { status: svc.status === "ACTIVE" ? "INACTIVE" : "ACTIVE" },
  });
  revalidatePath("/services");
  revalidatePath("/settings");
}

export async function unlockInternalAccess(formData: FormData) {
  await requireAdmin();
  const password = String(formData.get("password") || "");
  if (password !== INTERNAL_ACCESS_PASSWORD) {
    return { ok: false as const, error: "Sai mật khẩu" };
  }
  const jar = await cookies();
  jar.set("hhgo_internal", "1", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
  });
  const raw = String(formData.get("redirectTo") || "/internal?auth=1").trim();
  const next = raw.startsWith("/internal") ? raw : "/internal?auth=1";
  const withAuth = next.includes("auth=1")
    ? next
    : `${next}${next.includes("?") ? "&" : "?"}auth=1`;
  revalidatePath("/internal");
  redirect(withAuth);
}

export async function clearInternalAccess() {
  await requireAdmin();
  const jar = await cookies();
  jar.delete("hhgo_internal");
  return { ok: true as const };
}

export async function unlockStaticAccess(formData: FormData) {
  await requireStaff();
  const password = String(formData.get("password") || "");
  if (password !== INTERNAL_ACCESS_PASSWORD) {
    return { ok: false as const, error: "Sai mật khẩu" };
  }
  const jar = await cookies();
  jar.set("hhgo_static", "1", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
  });
  const raw = String(formData.get("redirectTo") || "/static?auth=1").trim();
  const next = raw.startsWith("/static") ? raw : "/static?auth=1";
  const withAuth = next.includes("auth=1")
    ? next
    : `${next}${next.includes("?") ? "&" : "?"}auth=1`;
  revalidatePath("/static");
  redirect(withAuth);
}

export async function clearStaticAccess() {
  await requireStaff();
  const jar = await cookies();
  jar.delete("hhgo_static");
  return { ok: true as const };
}

export async function lookupCustomerForContract(memberCodeRaw: string) {
  await requireStaff();
  const base = memberCodeRaw
    .trim()
    .toUpperCase()
    .replace(/\s*-\s*G[ĐD]\s*$/i, "")
    .replace(/\s+/g, "");
  if (!base) return { ok: false as const, error: "Nhập mã hội viên (CUS-…)" };

  const code = base.startsWith("CUS-")
    ? base
    : /^\d+$/.test(base)
      ? `CUS-${base.padStart(6, "0")}`
      : base.startsWith("CUS")
        ? `CUS-${base.slice(3).replace(/^-+/, "")}`
        : base;

  const customer = await prisma.customer.findUnique({
    where: { customerCode: code },
    select: {
      id: true,
      customerCode: true,
      fullName: true,
      phone: true,
      email: true,
      dateOfBirth: true,
      gender: true,
      familyGroupId: true,
      memberships: {
        where: { status: "ACTIVE" },
        orderBy: { createdAt: "desc" },
        take: 1,
        include: { plan: true },
      },
    },
  });

  if (!customer) return { ok: false as const, error: `Không tìm thấy ${code}` };

  const mem = customer.memberships[0];
  return {
    ok: true as const,
    customer: {
      id: customer.id,
      customerCode: customer.customerCode,
      fullName: customer.fullName,
      phone: customer.phone,
      email: customer.email || "",
      dateOfBirth: customer.dateOfBirth
        ? customer.dateOfBirth.toISOString().slice(0, 10)
        : "",
      gender:
        customer.gender === "MALE"
          ? "Nam"
          : customer.gender === "FEMALE"
            ? "Nữ"
            : customer.gender || "",
      isFamily: !!customer.familyGroupId,
      planName: mem?.plan.name || "",
      planMonths: mem?.plan.planCode.match(/_(\d+)M$/i)?.[1]
        ? `${mem.plan.planCode.match(/_(\d+)M$/i)![1]} tháng`
        : "",
      startDate: mem?.startDate.toISOString().slice(0, 10) || "",
      expiryDate: mem?.expiryDate.toISOString().slice(0, 10) || "",
    },
  };
}

export async function createServiceContract(formData: FormData) {
  const session = await requireReceiptWrite();
  const type = String(formData.get("type") || "") as "MEMBER" | "SERVICE";
  if (type !== "MEMBER" && type !== "SERVICE") {
    return { ok: false as const, error: "Loại hợp đồng không hợp lệ" };
  }

  const contractId = String(formData.get("contractId") || "").trim();
  const isFamily = String(formData.get("isFamily") || "") === "1";
  const memberCodeRaw = String(formData.get("memberCode") || "");
  const { normalizeMemberCodeInput, baseCustomerCodeFromMemberCode } = await import(
    "@/lib/service-contract"
  );
  const { nextServiceContractFormNo } = await import("@/lib/service-contract-drafts");

  const memberCode = normalizeMemberCodeInput(memberCodeRaw, isFamily);
  if (!memberCode) {
    return { ok: false as const, error: "Thiếu mã hội viên (CUS-…)" };
  }

  const fullName = String(formData.get("fullName") || "").trim();
  if (!fullName) return { ok: false as const, error: "Thiếu họ và tên" };

  const baseCode = baseCustomerCodeFromMemberCode(memberCode);
  const customer = await prisma.customer.findUnique({
    where: { customerCode: baseCode },
    select: { id: true },
  });

  const actorId = await resolveActorId(session.user.id);
  const staffName =
    String(formData.get("staffName") || "").trim() || session.user.name || "";

  const payload: Record<string, string | boolean> = {};
  for (const [key, value] of formData.entries()) {
    if (key === "type" || key === "contractId") continue;
    if (typeof value === "string") payload[key] = value.trim();
  }
  payload.memberCode = memberCode;
  payload.fullName = fullName;
  payload.isFamily = isFamily;
  payload.staffName = staffName;
  if (!payload.homeClub && type === "SERVICE") {
    payload.homeClub = "HHG OASIS · 27/58 Tây Lân, P. Bình Tân, TP.HCM";
  }
  if (!payload.transfer) payload.transfer = "Không";
  if (!payload.pause) payload.pause = "Không";
  if (payload.emergencyName && !payload.cosignerName) {
    payload.cosignerName = String(payload.emergencyName);
  }
  if (payload.emergencyPhone && !payload.cosignerPhone) {
    payload.cosignerPhone = String(payload.emergencyPhone);
  }

  if (contractId) {
    const existing = await prisma.serviceContract.findUnique({ where: { id: contractId } });
    if (!existing) return { ok: false as const, error: "Không tìm thấy hợp đồng" };
    payload.formNoHint = existing.formNo.replace(/^HD-/, "HĐ-");
    const row = await prisma.serviceContract.update({
      where: { id: contractId },
      data: {
        memberCode,
        customerId: customer?.id || existing.customerId,
        payload,
        status: "EDITED",
      },
    });
    revalidatePath("/receipts");
    return {
      ok: true as const,
      id: row.id,
      formNo: row.formNo,
      memberCode: row.memberCode,
      type: row.type as "MEMBER" | "SERVICE",
    };
  }

  const formNo = await nextServiceContractFormNo(type);
  payload.formNoHint = formNo.replace(/^HD-/, "HĐ-");

  const row = await prisma.serviceContract.create({
    data: {
      type,
      formNo,
      memberCode,
      customerId: customer?.id || null,
      payload,
      status: "EDITED",
      createdById: actorId,
    },
  });

  revalidatePath("/receipts");
  return {
    ok: true as const,
    id: row.id,
    formNo: row.formNo,
    memberCode: row.memberCode,
    type: row.type as "MEMBER" | "SERVICE",
  };
}

/** Admin: lưu tick chức năng cho 1 tài khoản */
export async function saveUserFeatureFlags(formData: FormData) {
  await requireAdmin();
  const userId = String(formData.get("userId") || "").trim();
  if (!userId) return { ok: false as const, error: "Thiếu tài khoản" };

  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) return { ok: false as const, error: "Không tìm thấy tài khoản" };
  if (target.role === "ADMIN") {
    return { ok: false as const, error: "Không chỉnh quyền tài khoản Admin" };
  }

  const { CRM_FEATURES } = await import("@/config/features");
  const flags: Record<string, boolean> = {};
  for (const f of CRM_FEATURES) {
    flags[f.code] = String(formData.get(`feat_${f.code}`) || "") === "1";
  }

  await prisma.user.update({
    where: { id: userId },
    data: { featureFlags: flags },
  });

  revalidatePath("/admin");
  revalidatePath("/");
  return { ok: true as const, userId, flags };
}
