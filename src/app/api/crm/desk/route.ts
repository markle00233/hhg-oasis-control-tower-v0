import { NextRequest, NextResponse } from "next/server";
import { isSystemAdmin, requireDeskZone, toSafeUser } from "@/lib/auth";
import { CART_STATUS, isPastVnCutOff } from "@/lib/cart-status";
import { DESK_ZONES, deskZoneAliases, getDeskZone } from "@/lib/desk-zones";
import { prisma } from "@/lib/prisma";

/** Quầy — mỗi yêu cầu QR = 1 dòng (không ghi đè cùng khách). */
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
  const now = new Date();
  const aliases = deskZoneAliases(zone);

  const zones = DESK_ZONES.map((z) => ({
    code: z.code,
    name: z.name,
    username: z.username,
  }));

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
    // Auto: quá 21:30 VN (hồ/resort) hoặc hết expiresAt → NO_SHOW
    const poolLike =
      zone === "OLYMPIC_POOL" ||
      zone === "RESORT_POOL" ||
      aliases.includes("OLYMPIC_POOL");
    if (poolLike && isPastVnCutOff(now)) {
      await prisma.appServiceCart
        .updateMany({
          where: {
            zoneCode: { in: aliases },
            status: { in: [CART_STATUS.PENDING, CART_STATUS.OPEN] },
            createdAt: { gte: since },
          },
          data: { status: CART_STATUS.NO_SHOW },
        })
        .catch(() => undefined);
    } else {
      await prisma.appServiceCart
        .updateMany({
          where: {
            zoneCode: { in: aliases },
            status: { in: [CART_STATUS.PENDING, CART_STATUS.OPEN] },
            expiresAt: { lt: now },
            createdAt: { gte: since },
          },
          data: { status: CART_STATUS.NO_SHOW },
        })
        .catch(() => undefined);
    }

    const rows = await prisma.appCustomer.findMany({
      where: {
        phoneNormalized: { not: null },
        OR: [
          {
            events: {
              some: {
                createdAt: { gte: since },
                eventType: "SERVICE_USE",
                service: { serviceCode: { in: aliases } },
              },
            },
          },
          {
            serviceCarts: {
              some: {
                createdAt: { gte: since },
                zoneCode: { in: aliases },
              },
            },
          },
        ],
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
                service: { serviceCode: { in: aliases } },
              },
              ...(zone === "MIA_OI"
                ? [
                    {
                      eventType: "MIA_OI_ORDER" as const,
                      service: { serviceCode: "MIA_OI" },
                    },
                  ]
                : []),
              ...(zone === "SAUNA"
                ? [
                    {
                      eventType: "SPA_ORDER" as const,
                      service: { serviceCode: "SAUNA" },
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
            operationalStatus: true,
            createdAt: true,
            metadata: true,
            service: { select: { serviceCode: true, serviceName: true } },
          },
        },
        orders: {
          where: {
            createdAt: { gte: dayStart },
            ...(zone === "MIA_OI" ||
            zone === "SAUNA" ||
            zone === "OLYMPIC_POOL"
              ? { service: { serviceCode: zone } }
              : { id: "__none__" }),
          },
          orderBy: { createdAt: "desc" },
          take:
            zone === "MIA_OI" || zone === "SAUNA" || zone === "OLYMPIC_POOL"
              ? 40
              : 0,
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
        serviceCarts: {
          where: {
            createdAt: { gte: since },
            zoneCode: { in: aliases },
          },
          orderBy: { createdAt: "desc" },
          take: 40,
          select: {
            id: true,
            token: true,
            zoneCode: true,
            zoneName: true,
            items: true,
            totalVnd: true,
            status: true,
            adminNote: true,
            createdAt: true,
            expiresAt: true,
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
          const ticketVerified =
            e.eventType === "SERVICE_USE" &&
            (meta.ticketVerified === true || !!meta.orderId);
          const orderSummary =
            e.eventType === "MIA_OI_ORDER" ||
            e.eventType === "SPA_ORDER" ||
            e.eventType === "POOL_ORDER" ||
            ticketVerified
              ? orderItems
                  .map((i) => `${i.qty || 1}× ${i.name || "dịch vụ"}`)
                  .join(", ") || null
              : null;
          return {
            id: e.id,
            at: e.createdAt,
            eventType: e.eventType,
            operationalStatus: e.operationalStatus || "NEW",
            serviceCode: e.service.serviceCode,
            serviceName: e.service.serviceName,
            orderSummary,
            ticketVerified,
            totalVnd:
              typeof meta.totalVnd === "number" ? meta.totalVnd : null,
            orderId: typeof meta.orderId === "string" ? meta.orderId : null,
            ticketItems: orderItems.map((i) => ({
              nameVi: String(i.name || ""),
              qty: Number(i.qty) || 1,
              unitPriceVnd:
                typeof (i as { unitPriceVnd?: number }).unitPriceVnd ===
                "number"
                  ? (i as { unitPriceVnd: number }).unitPriceVnd
                  : 0,
            })),
          };
        });

        const zoneScans = scans.filter(
          (s) =>
            s.eventType === "SERVICE_USE" && aliases.includes(s.serviceCode)
        );
        const lastZoneScan = zoneScans[0] || null;
        const hasNewArrival = zoneScans.some(
          (s) => (s.operationalStatus || "NEW") === "NEW" && !s.ticketVerified
        );

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

        const carts = (c.serviceCarts || []).map((row) => {
          const items = parseCartItems(row.items);
          return {
            token: row.token,
            zoneCode: row.zoneCode,
            zoneName: row.zoneName,
            items,
            totalVnd: row.totalVnd,
            status: row.status,
            adminNote: row.adminNote,
            createdAt: row.createdAt,
            expiresAt: row.expiresAt,
            billText: items.length
              ? items.map((i) => `${i.qty}× ${i.nameVi}`).join(", ")
              : "—",
          };
        });
        const pendingCart = carts.find(
          (x) => x.status === CART_STATUS.PENDING
        );
        const latestCart = carts[0] || null;
        const needsApproval = !!pendingCart;
        const checkedIn =
          carts.some((x) => x.status === CART_STATUS.USED) ||
          (zone === "OLYMPIC_POOL"
            ? zoneScans.some((s) => s.ticketVerified)
            : zoneScans.some(
                (s) =>
                  s.ticketVerified ||
                  s.operationalStatus === "ACKNOWLEDGED"
              ) || orders.length > 0);

        const todayPackageVnd = orders.reduce((s, o) => s + o.totalVnd, 0);
        const cartCreatedAt = latestCart?.createdAt || null;

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
          lastVisitAt: lastZoneScan?.at ?? cartCreatedAt,
          pendingAdmin: hasNewArrival || needsApproval,
          needsApproval,
          checkedIn,
          /** @deprecated prefer carts[] — kept for modal compat */
          openCart: pendingCart || latestCart,
          cartBillText: (pendingCart || latestCart)?.billText || null,
          carts,
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

function parseCartItems(raw: unknown): {
  id: string;
  nameVi: string;
  qty: number;
  priceVnd: number;
}[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((i) => {
      const row = i as Record<string, unknown>;
      return {
        id: String(row.id || "").trim(),
        nameVi: String(row.nameVi || "").trim(),
        qty: Math.max(1, Number(row.qty) || 1),
        priceVnd: Math.max(0, Number(row.priceVnd) || 0),
      };
    })
    .filter((i) => i.id && i.nameVi);
}
