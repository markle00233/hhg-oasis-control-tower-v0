import { NextRequest, NextResponse } from "next/server";
import { isSystemAdmin, requireDeskZone, toSafeUser } from "@/lib/auth";
import { DESK_ZONES, getDeskZone } from "@/lib/desk-zones";
import { prisma } from "@/lib/prisma";

/** Quầy — chỉ khách quét đúng khu của acc (admin lớn xem mọi khu). */
export async function GET(req: NextRequest) {
  const hours = Math.min(
    Math.max(Number(req.nextUrl.searchParams.get("hours") || 12) || 12, 1),
    72
  );
  const zone = String(req.nextUrl.searchParams.get("zone") || "")
    .trim()
    .toUpperCase();
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);
  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);

  const zones = DESK_ZONES.map((z) => ({
    code: z.code,
    name: z.name,
    username: z.username,
  }));

  // No zone → public picker metadata (no arrivals)
  if (!zone) {
    return NextResponse.json({ ok: true, hours, zones, zone: null, arrivals: [] });
  }

  const gate = await requireDeskZone(zone);
  if ("error" in gate) return gate.error;

  const meta = getDeskZone(zone);
  if (!meta) {
    return NextResponse.json({ error: "Khu vực không hợp lệ." }, { status: 400 });
  }

  try {

    const rows = await prisma.appCustomer.findMany({
      where: {
        phoneNormalized: { not: null },
        events: {
          some: {
            createdAt: { gte: since },
            eventType: "SERVICE_USE",
            service: { serviceCode: zone },
          },
        },
      },
      orderBy: { updatedAt: "desc" },
      take: 150,
      select: {
        id: true,
        customerCode: true,
        fullName: true,
        phone: true,
        phoneNormalized: true,
        phoneLast4: true,
        shortId: true,
        segment: true,
        intendedServices: true,
        adminConfirmedAt: true,
        adminNote: true,
        createdAt: true,
        updatedAt: true,
        events: {
          where: {
            createdAt: { gte: dayStart },
            OR: [
              {
                eventType: "SERVICE_USE",
                service: { serviceCode: zone },
              },
              ...(zone === "MIA_OI"
                ? [
                    {
                      eventType: "MIA_OI_ORDER" as const,
                      service: { serviceCode: "MIA_OI" },
                    },
                  ]
                : []),
            ],
          },
          orderBy: { createdAt: "desc" },
          take: 40,
          select: {
            id: true,
            eventType: true,
            createdAt: true,
            metadata: true,
            service: { select: { serviceCode: true, serviceName: true } },
          },
        },
        orders: {
          where: { createdAt: { gte: dayStart } },
          orderBy: { createdAt: "desc" },
          take: zone === "MIA_OI" ? 20 : 0,
          select: {
            id: true,
            status: true,
            totalVnd: true,
            createdAt: true,
            items: {
              select: {
                nameVi: true,
                qty: true,
                unitPriceVnd: true,
              },
            },
          },
        },
      },
    });

    const phones = rows
      .map((r) => r.phoneNormalized)
      .filter((p): p is string => !!p);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const memberPhones = new Set<string>();
    if (phones.length) {
      try {
        const members = await prisma.crmCustomer.findMany({
          where: {
            phoneNormalized: { in: phones },
            memberships: {
              some: {
                status: "ACTIVE",
                expiryDate: { gte: today },
              },
            },
          },
          select: { phoneNormalized: true },
        });
        for (const m of members) memberPhones.add(m.phoneNormalized);
      } catch {
        /* CRM tables may be empty */
      }
    }

    const arrivals = rows
      .map((c) => {
        const crmMember = !!(
          c.phoneNormalized && memberPhones.has(c.phoneNormalized)
        );
        const segment =
          c.segment === "MEMBER" || crmMember ? "MEMBER" : "WALK_IN";

        const scans = c.events.map((e) => {
          const meta =
            e.metadata && typeof e.metadata === "object"
              ? (e.metadata as Record<string, unknown>)
              : {};
          const orderItems = Array.isArray(meta.items)
            ? (meta.items as { name?: string; qty?: number }[])
            : [];
          return {
            id: e.id,
            at: e.createdAt,
            eventType: e.eventType,
            serviceCode: e.service.serviceCode,
            serviceName: e.service.serviceName,
            orderSummary:
              e.eventType === "MIA_OI_ORDER"
                ? orderItems
                    .map((i) => `${i.qty || 1}× ${i.name || "món"}`)
                    .join(", ")
                : null,
          };
        });

        const zoneScans = scans.filter(
          (s) => s.eventType === "SERVICE_USE" && s.serviceCode === zone
        );
        const lastZoneScan = zoneScans[0] || null;

        const orders = (c.orders || []).map((o) => ({
          id: o.id,
          at: o.createdAt,
          status: o.status,
          totalVnd: o.totalVnd,
          items: o.items.map((i) => ({
            nameVi: i.nameVi,
            qty: i.qty,
            unitPriceVnd: i.unitPriceVnd,
          })),
        }));

        const todayPackageVnd = orders.reduce((s, o) => s + o.totalVnd, 0);

        return {
          id: c.id,
          customerCode: c.customerCode,
          fullName: c.fullName,
          phone: c.phone,
          shortId: c.phoneLast4 || c.shortId,
          segment,
          segmentLabel: segment === "MEMBER" ? "Member" : "Khách lẻ",
          intendedServices: c.intendedServices
            ? safeParseServices(c.intendedServices)
            : [],
          adminConfirmedAt: c.adminConfirmedAt,
          adminNote: c.adminNote,
          createdAt: c.createdAt,
          updatedAt: c.updatedAt,
          lastServiceName: lastZoneScan?.serviceName ?? null,
          lastVisitAt: lastZoneScan?.at ?? null,
          pendingAdmin: !c.adminConfirmedAt,
          todayScans: scans,
          todayOrders: orders,
          todayPackageVnd,
          todayScanCount: zoneScans.length,
          todayOrderCount: orders.length,
        };
      })
      .sort((a, b) => {
        const ta = a.lastVisitAt ? new Date(a.lastVisitAt).getTime() : 0;
        const tb = b.lastVisitAt ? new Date(b.lastVisitAt).getTime() : 0;
        return tb - ta;
      });

    return NextResponse.json({
      ok: true,
      hours,
      zones,
      zone,
      zoneName: meta.name,
      user: toSafeUser(gate.user),
      isAdmin: isSystemAdmin(gate.user),
      arrivals,
    });
  } catch (e) {
    console.error("[crm/desk]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to load desk arrivals" },
      { status: 500 }
    );
  }
}

function safeParseServices(raw: string): string[] {
  try {
    const v = JSON.parse(raw);
    if (Array.isArray(v)) return v.map((x) => String(x));
  } catch {
    /* comma list */
  }
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}
