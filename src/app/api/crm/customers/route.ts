import { NextRequest, NextResponse } from "next/server";
import { requireSystemAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function normalizePhone(raw: string) {
  return raw.replace(/\D/g, "");
}

export async function GET(req: NextRequest) {
  const gate = await requireSystemAdmin();
  if ("error" in gate) return gate.error;

  const q = (req.nextUrl.searchParams.get("q") || "").trim();
  /** membership | walk_in | all — mặc định all */
  const segmentRaw = (req.nextUrl.searchParams.get("segment") || "all")
    .trim()
    .toLowerCase();
  const segment =
    segmentRaw === "membership" || segmentRaw === "walk_in" || segmentRaw === "all"
      ? segmentRaw
      : "all";
  const take = Math.min(
    Number(req.nextUrl.searchParams.get("take") || 100) || 100,
    500
  );

  try {
    const searchWhere = q
      ? {
          OR: [
            { fullName: { contains: q, mode: "insensitive" as const } },
            { phone: { contains: q } },
            { phoneNormalized: { contains: normalizePhone(q) } },
            { customerCode: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {};

    // Membership = đã có ≥1 gói; Khách lẻ = chưa có membership nào.
    const segmentWhere =
      segment === "membership"
        ? { memberships: { some: {} } }
        : segment === "walk_in"
          ? { memberships: { none: {} } }
          : {};

    const where = {
      ...searchWhere,
      ...segmentWhere,
    };

    const [total, membershipTotal, walkInTotal, customers] = await Promise.all([
      prisma.crmCustomer.count({ where }),
      prisma.crmCustomer.count({
        where: { ...searchWhere, memberships: { some: {} } },
      }),
      prisma.crmCustomer.count({
        where: { ...searchWhere, memberships: { none: {} } },
      }),
      prisma.crmCustomer.findMany({
        where,
        take,
        orderBy: { customerCode: "desc" },
        include: {
          memberships: {
            orderBy: { expiryDate: "desc" },
            take: 3,
            include: { plan: { include: { services: { include: { service: true } } } } },
          },
        },
      }),
    ]);

    return NextResponse.json({
      ok: true,
      source: "control-tower-db",
      segment,
      total,
      counts: {
        membership: membershipTotal,
        walkIn: walkInTotal,
        all: membershipTotal + walkInTotal,
      },
      customers: customers.map((c) => {
        const active = c.memberships.find((m) => m.status === "ACTIVE");
        const primary = active || c.memberships[0];
        const serviceTags =
          primary?.plan.services.map((l) => l.service.name) ?? [];
        const customerType = c.memberships.length > 0 ? "membership" : "walk_in";
        return {
          id: c.id,
          customerCode: c.customerCode,
          fullName: c.fullName,
          phone: c.phone,
          email: c.email,
          gender: c.gender,
          source: c.source,
          customerType,
          status: c.status,
          note: c.note,
          salesPersonCode: c.salesPersonCode,
          totalVisits: c.totalVisits,
          lastVisitAt: c.lastVisitAt,
          createdAt: c.createdAt,
          packageCode: primary?.plan.planCode ?? null,
          packageName: primary?.plan.name ?? null,
          membershipStatus: primary?.status ?? null,
          membershipCode: primary?.membershipCode ?? null,
          expiryDate: primary?.expiryDate ?? null,
          serviceTags,
          memberships: c.memberships.map((m) => ({
            membershipCode: m.membershipCode,
            contractCode: m.contractCode,
            planCode: m.plan.planCode,
            planName: m.plan.name,
            status: m.status,
            startDate: m.startDate,
            expiryDate: m.expiryDate,
          })),
        };
      }),
    });
  } catch (e) {
    console.error("[crm/customers]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "CRM query failed" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const gate = await requireSystemAdmin();
  if ("error" in gate) return gate.error;

  try {
    const body = await req.json();
    const action = String(body.action || "").trim().toUpperCase();

    // Chuẩn hoá: khách đã có gói → source MEMBERSHIP; xoá khách lẻ thật (chưa có gói).
    if (action === "NORMALIZE_SEGMENTS" || action === "PURGE_WALK_IN") {
      const withMemIds = (
        await prisma.crmCustomer.findMany({
          where: { memberships: { some: {} } },
          select: { id: true },
        })
      ).map((c) => c.id);

      const sourceFix = await prisma.crmCustomer.updateMany({
        where: {
          id: { in: withMemIds },
          NOT: { source: "MEMBERSHIP" },
        },
        data: { source: "MEMBERSHIP" },
      });

      const walkIns = await prisma.crmCustomer.findMany({
        where: { memberships: { none: {} } },
        select: { id: true, customerCode: true },
      });
      const walkInIds = walkIns.map((c) => c.id);
      let deletedWalkIn = 0;

      if (walkInIds.length > 0 && action === "PURGE_WALK_IN") {
        // Xoá quan hệ trước (FK không cascade hết).
        await prisma.crmServiceUsage.deleteMany({
          where: { customerId: { in: walkInIds } },
        });
        await prisma.crmVisit.deleteMany({
          where: { customerId: { in: walkInIds } },
        });
        await prisma.crmActivityLog.deleteMany({
          where: { customerId: { in: walkInIds } },
        });
        await prisma.crmCustomerNote.deleteMany({
          where: { customerId: { in: walkInIds } },
        });
        await prisma.crmCustomerPromotion.deleteMany({
          where: { customerId: { in: walkInIds } },
        });
        await prisma.crmServiceContract.updateMany({
          where: { customerId: { in: walkInIds } },
          data: { customerId: null },
        });
        // Family owner Restrict — gỡ member rồi xoá group nếu owner là walk-in.
        await prisma.crmCustomer.updateMany({
          where: { id: { in: walkInIds } },
          data: { familyGroupId: null },
        });
        const ownedGroups = await prisma.crmFamilyGroup.findMany({
          where: { ownerId: { in: walkInIds } },
          select: { id: true },
        });
        if (ownedGroups.length > 0) {
          const gids = ownedGroups.map((g) => g.id);
          await prisma.crmCustomer.updateMany({
            where: { familyGroupId: { in: gids } },
            data: { familyGroupId: null },
          });
          await prisma.crmFamilyGroup.deleteMany({ where: { id: { in: gids } } });
        }
        const del = await prisma.crmCustomer.deleteMany({
          where: { id: { in: walkInIds } },
        });
        deletedWalkIn = del.count;
      }

      return NextResponse.json({
        ok: true,
        action,
        updatedSourcesToMembership: sourceFix.count,
        walkInFound: walkInIds.length,
        deletedWalkIn,
        walkInCodes: walkIns.map((c) => c.customerCode),
      });
    }

    const fullName = String(body.fullName || "").trim();
    const phone = String(body.phone || "").trim();
    const note = body.note != null ? String(body.note) : null;
    const planCode = body.planCode ? String(body.planCode).trim() : null;
    /** membership | walk_in — mặc định suy từ planCode */
    const typeRaw = String(body.customerType || body.segment || "")
      .trim()
      .toLowerCase();
    const customerType =
      typeRaw === "membership" || typeRaw === "walk_in"
        ? typeRaw
        : planCode
          ? "membership"
          : "walk_in";
    const source =
      String(body.source || (customerType === "membership" ? "MEMBERSHIP" : "WALK_IN"))
        .trim() || (customerType === "membership" ? "MEMBERSHIP" : "WALK_IN");

    if (!fullName) {
      return NextResponse.json({ error: "Nhập họ tên" }, { status: 400 });
    }
    if (!phone) {
      return NextResponse.json({ error: "Nhập số điện thoại" }, { status: 400 });
    }
    if (customerType === "membership" && !planCode) {
      return NextResponse.json(
        { error: "Membership cần chọn gói" },
        { status: 400 }
      );
    }

    const phoneNormalized = normalizePhone(phone);
    let planId: string | null = null;
    let planDurationDays = 0;
    if (customerType === "membership" && planCode) {
      const plan = await prisma.crmMembershipPlan.findUnique({
        where: { planCode },
      });
      if (!plan) {
        return NextResponse.json(
          { error: `Không tìm thấy gói ${planCode}` },
          { status: 400 }
        );
      }
      planId = plan.id;
      planDurationDays = plan.durationDays;
    }

    const count = await prisma.crmCustomer.count();
    const customerCode = `CUS-${String(count + 1).padStart(6, "0")}`;

    const created = await prisma.$transaction(async (tx) => {
      const customer = await tx.crmCustomer.create({
        data: {
          customerCode,
          fullName,
          phone,
          phoneNormalized,
          source,
          note,
          status: "ACTIVE",
        },
      });

      if (customerType === "membership" && planId) {
        const memCount = await tx.crmMembership.count();
        const start = new Date();
        start.setHours(0, 0, 0, 0);
        const expiry = new Date(start);
        expiry.setDate(expiry.getDate() + planDurationDays);
        await tx.crmMembership.create({
          data: {
            membershipCode: `MEM-${String(memCount + 1).padStart(6, "0")}`,
            contractCode: `HD-${String(memCount + 1).padStart(6, "0")}`,
            customerId: customer.id,
            planId,
            startDate: start,
            expiryDate: expiry,
            status: "ACTIVE",
          },
        });
      }

      await tx.crmActivityLog.create({
        data: {
          customerId: customer.id,
          activityType: "CUSTOMER_CREATED",
          title:
            customerType === "membership"
              ? "Tạo khách Membership từ Control Tower"
              : "Tạo khách lẻ từ Control Tower",
          note: `Admin ${gate.user.username}`,
        },
      });

      return customer;
    });

    return NextResponse.json({ ok: true, customer: created }, { status: 201 });
  } catch (e) {
    console.error("[crm/customers POST]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Create failed" },
      { status: 500 }
    );
  }
}
