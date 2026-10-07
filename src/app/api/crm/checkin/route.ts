import { NextRequest, NextResponse } from "next/server";
import { requireSystemAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function normalizePhone(raw: string) {
  return raw.replace(/\D/g, "");
}

export async function POST(req: NextRequest) {
  const gate = await requireSystemAdmin();
  if ("error" in gate) return gate.error;

  try {
    const body = await req.json();
    const query = String(body.query || body.code || body.phone || "").trim();
    const serviceCode = String(body.serviceCode || "").trim().toUpperCase();

    if (!query) {
      return NextResponse.json(
        { error: "Nhập mã khách / membership / SĐT" },
        { status: 400 }
      );
    }
    if (!serviceCode) {
      return NextResponse.json({ error: "Chọn khu vực check-in" }, { status: 400 });
    }

    const service = await prisma.crmService.findUnique({ where: { code: serviceCode } });
    if (!service || service.status !== "ACTIVE") {
      return NextResponse.json({ error: "Khu vực không hợp lệ" }, { status: 400 });
    }

    const phoneNorm = normalizePhone(query);
    const customer = await prisma.crmCustomer.findFirst({
      where: {
        OR: [
          { customerCode: { equals: query, mode: "insensitive" } },
          { phone: query },
          ...(phoneNorm ? [{ phoneNormalized: phoneNorm }] : []),
          {
            memberships: {
              some: { membershipCode: { equals: query, mode: "insensitive" } },
            },
          },
        ],
      },
      include: {
        memberships: {
          where: { status: "ACTIVE" },
          include: { plan: { include: { services: true } } },
          orderBy: { expiryDate: "desc" },
        },
      },
    });

    if (!customer) {
      return NextResponse.json({ error: "Không tìm thấy khách" }, { status: 404 });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const activeMem = customer.memberships.find((m) => m.expiryDate >= today);
    if (!activeMem) {
      return NextResponse.json(
        { error: "Khách không có membership ACTIVE còn hạn" },
        { status: 400 }
      );
    }

    const allowed = activeMem.plan.services.some((s) => s.serviceId === service.id);
    const planHasLinks = activeMem.plan.services.length > 0;
    if (planHasLinks && !allowed) {
      return NextResponse.json(
        { error: `Gói ${activeMem.plan.planCode} không gồm khu ${serviceCode}` },
        { status: 400 }
      );
    }

    const visitCount = await prisma.crmVisit.count();
    const visitCode = `VIS-${String(visitCount + 1).padStart(6, "0")}`;

    const visit = await prisma.$transaction(async (tx) => {
      const v = await tx.crmVisit.create({
        data: {
          visitCode,
          customerId: customer.id,
          membershipId: activeMem.id,
          checkInAt: new Date(),
          visitDate: today,
          note: `App Control Tower · ${gate.user.username}`,
        },
      });
      await tx.crmServiceUsage.create({
        data: {
          visitId: v.id,
          customerId: customer.id,
          serviceId: service.id,
          status: "ACTIVE",
        },
      });
      await tx.crmCustomer.update({
        where: { id: customer.id },
        data: {
          totalVisits: { increment: 1 },
          lastVisitAt: new Date(),
          firstVisitAt: customer.firstVisitAt ?? new Date(),
        },
      });
      await tx.crmActivityLog.create({
        data: {
          customerId: customer.id,
          activityType: "CHECK_IN",
          serviceId: service.id,
          title: `Check-in ${service.name}`,
          note: visitCode,
        },
      });
      return v;
    });

    return NextResponse.json({
      ok: true,
      visit: {
        id: visit.id,
        visitCode: visit.visitCode,
        checkInAt: visit.checkInAt,
        customerCode: customer.customerCode,
        customerName: customer.fullName,
        serviceCode,
        serviceName: service.name,
        membershipCode: activeMem.membershipCode,
      },
    });
  } catch (e) {
    console.error("[crm/checkin]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Check-in failed" },
      { status: 500 }
    );
  }
}
