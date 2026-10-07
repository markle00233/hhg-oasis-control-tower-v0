import { NextResponse } from "next/server";
import { requireSystemAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfMonth() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

/** CRM data lives in Control Tower DB (crm_* tables, migrated from hhgoasistonghop). */
export async function GET() {
  const gate = await requireSystemAdmin();
  if ("error" in gate) return gate.error;

  try {
    const today = startOfToday();
    const monthStart = startOfMonth();

    const [
      services,
      totalCustomers,
      membershipCustomers,
      walkInCustomers,
      newMonth,
      totalMemberships,
      activeMemberships,
      checkinsToday,
      recentVisits,
      plans,
    ] = await Promise.all([
      prisma.crmService.findMany({ orderBy: { sortOrder: "asc" } }),
      prisma.crmCustomer.count(),
      prisma.crmCustomer.count({ where: { memberships: { some: {} } } }),
      prisma.crmCustomer.count({ where: { memberships: { none: {} } } }),
      prisma.crmCustomer.count({ where: { createdAt: { gte: monthStart } } }),
      prisma.crmMembership.count(),
      prisma.crmMembership.count({ where: { status: "ACTIVE" } }),
      prisma.crmServiceUsage.count({ where: { startedAt: { gte: today } } }),
      prisma.crmVisit.findMany({
        take: 20,
        orderBy: { checkInAt: "desc" },
        include: {
          customer: { select: { fullName: true, customerCode: true, phone: true } },
          usages: { include: { service: true } },
        },
      }),
      prisma.crmMembershipPlan.findMany({
        where: { status: "ACTIVE" },
        orderBy: { planCode: "asc" },
        include: {
          services: { include: { service: { select: { code: true, name: true } } } },
        },
      }),
    ]);

    const usagesByService = await prisma.crmServiceUsage.groupBy({
      by: ["serviceId"],
      where: { startedAt: { gte: today } },
      _count: true,
    });
    const countMap = Object.fromEntries(
      usagesByService.map((u) => [u.serviceId, u._count])
    );

    return NextResponse.json({
      ok: true,
      source: "control-tower-db",
      summary: {
        totalCustomers,
        membershipCustomers,
        walkInCustomers,
        newMonth,
        totalMemberships,
        activeMemberships,
        checkinsToday,
      },
      services: services.map((s) => ({
        id: s.id,
        code: s.code,
        name: s.name,
        status: s.status,
        checkinsToday: countMap[s.id] || 0,
      })),
      plans: plans.map((p) => ({
        id: p.id,
        planCode: p.planCode,
        name: p.name,
        durationDays: p.durationDays,
        description: p.description,
        services: p.services.map((l) => ({
          code: l.service.code,
          name: l.service.name,
        })),
      })),
      recentVisits: recentVisits.map((v) => ({
        id: v.id,
        visitCode: v.visitCode,
        checkInAt: v.checkInAt,
        customerCode: v.customer.customerCode,
        customerName: v.customer.fullName,
        phone: v.customer.phone,
        services: v.usages.map((u) => u.service.code),
      })),
    });
  } catch (e) {
    console.error("[crm/summary]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "CRM query failed" },
      { status: 500 }
    );
  }
}
