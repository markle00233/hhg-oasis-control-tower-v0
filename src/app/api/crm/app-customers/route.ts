import { NextRequest, NextResponse } from "next/server";
import { requireSystemAdmin } from "@/lib/auth";
import { activeCrmMemberships } from "@/lib/crm-membership";
import {
  customerHasLoginAccount,
  deskSegmentOf,
} from "@/lib/desk-segment";
import { prisma } from "@/lib/prisma";

/** Khách app (QR pass). Chưa có tên → hiển thị ID. */
export async function GET(req: NextRequest) {
  const gate = await requireSystemAdmin();
  if ("error" in gate) return gate.error;

  const q = (req.nextUrl.searchParams.get("q") || "").trim();
  const take = Math.min(
    Number(req.nextUrl.searchParams.get("take") || 100) || 100,
    500
  );
  const days = Math.min(
    Math.max(Number(req.nextUrl.searchParams.get("days") || 30) || 30, 1),
    365
  );
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  try {
    const where = q
      ? {
          OR: [
            { customerCode: { contains: q, mode: "insensitive" as const } },
            { username: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {};

    const [total, rows] = await Promise.all([
      prisma.appCustomer.count({ where }),
      prisma.appCustomer.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take,
        select: {
          id: true,
          customerCode: true,
          username: true,
          status: true,
          phone: true,
          phoneNormalized: true,
          shortId: true,
          segment: true,
          vipExpiresAt: true,
          vipPlanLabel: true,
          intendedServices: true,
          adminConfirmedAt: true,
          createdAt: true,
          _count: {
            select: {
              events: {
                where: {
                  eventType: "SERVICE_USE",
                  createdAt: { gte: since },
                },
              },
            },
          },
          events: {
            where: {
              eventType: "SERVICE_USE",
              createdAt: { gte: since },
            },
            orderBy: { createdAt: "desc" },
            take: 1,
            select: {
              createdAt: true,
              service: { select: { serviceCode: true, serviceName: true } },
            },
          },
        },
      }),
    ]);

    const crm = await activeCrmMemberships(
      rows.map((c) => c.phoneNormalized || "").filter((p): p is string => !!p)
    );

    return NextResponse.json({
      ok: true,
      days,
      total,
      customers: rows.map((c) => {
        const last = c.events[0];
        const marked = deskSegmentOf({
          segment: c.segment,
          vipExpiresAt: c.vipExpiresAt,
          vipPlanLabel: c.vipPlanLabel,
          hasAccount: customerHasLoginAccount(c),
          crmMember: !!(c.phoneNormalized && crm.has(c.phoneNormalized)),
        });
        return {
          id: c.id,
          customerCode: c.customerCode,
          username: c.username,
          status: c.status,
          phone: c.phone,
          shortId: c.shortId,
          segment: marked.segment,
          segmentLabel: marked.segmentLabel,
          intendedServices: c.intendedServices,
          adminConfirmedAt: c.adminConfirmedAt,
          createdAt: c.createdAt,
          displayName: c.shortId || c.phone || c.customerCode,
          visitsInPeriod: c._count.events,
          lastVisitAt: last?.createdAt ?? null,
          lastServiceName: last?.service.serviceName ?? null,
          lastServiceCode: last?.service.serviceCode ?? null,
        };
      }),
    });
  } catch (e) {
    console.error("[crm/app-customers]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to load app customers" },
      { status: 500 }
    );
  }
}
