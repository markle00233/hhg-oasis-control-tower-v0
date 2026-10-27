import { NextRequest, NextResponse } from "next/server";
import {
  isDeskAdminForZone,
  isSystemAdmin,
  requireDeskZone,
  toSafeUser,
} from "@/lib/auth";
import { parseCartPromo } from "@/lib/cart-promo";
import { CART_STATUS, isPastVnCutOff } from "@/lib/cart-status";
import {
  DESK_ZONES,
  deskZoneAliases,
  getDeskZone,
  miaOlympicSector,
} from "@/lib/desk-zones";
import {
  isOlympicPackageId,
  OLYMPIC_PACKAGE_IDS,
  vipStartedAtFromExpiry,
} from "@/lib/olympic-membership";
import { phoneKeys } from "@/lib/swim-goi-bonus";
import { swimBonusStartedAfter } from "@/lib/swim-packages";
import { prisma } from "@/lib/prisma";

/** Quầy — mỗi yêu cầu QR = 1 dòng (không ghi đè cùng khách). */
function vnDayBounds(ymd: string) {
  const start = new Date(`${ymd}T00:00:00+07:00`);
  const end = new Date(`${ymd}T24:00:00+07:00`);
  return { start, end };
}

export async function GET(req: NextRequest) {
  const hours = Math.min(
    Math.max(Number(req.nextUrl.searchParams.get("hours") || 12) || 12, 1),
    72
  );
  const zone = String(req.nextUrl.searchParams.get("zone") || "")
    .trim()
    .toUpperCase();
  const dateParam = String(req.nextUrl.searchParams.get("date") || "").trim();
  const viewDate = /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : null;

  let since = new Date(Date.now() - hours * 60 * 60 * 1000);
  // Đặt bàn Lòng Nướng có thể trước 14 ngày — giữ yêu cầu để quầy gọi xác nhận.
  const cartSinceBase =
    zone === "LONG_NUONG"
      ? new Date(Date.now() - 14 * 24 * 60 * 60 * 1000)
      : since;
  let dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  let dayEnd: Date | null = null;
  const now = new Date();
  if (viewDate) {
    const bounds = vnDayBounds(viewDate);
    dayStart = bounds.start;
    dayEnd = bounds.end;
    since = bounds.start;
  }
  const cartSince = viewDate ? since : cartSinceBase;
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

  // Quầy học bơi — không dùng bảng duyệt QR; list học viên qua /api/crm/desk/swim-students
  if (zone === "SWIM_LESSON") {
    return NextResponse.json({
      ok: true,
      hours,
      zones,
      zone,
      zoneName: meta.name,
      user: toSafeUser(gate.user),
      isAdmin: isDeskAdminForZone(gate.user, zone),
      isSystemAdmin: isSystemAdmin(gate.user),
      arrivals: [],
      swimLesson: true,
    });
  }

  try {
    // Auto NO_SHOW chỉ khi xem realtime (không đụng dữ liệu ngày lịch sử)
    // Quá 21:30 VN (hồ/resort) hoặc hết expiresAt → NO_SHOW
    if (!viewDate) {
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
              createdAt: { gte: cartSince },
            },
            data: { status: CART_STATUS.NO_SHOW },
          })
          .catch(() => undefined);
      }
    }

    /**
     * Lòng Nướng: booking đã tạo nhưng thiếu cart PENDING → backfill để NV duyệt được.
     */
    if (zone === "LONG_NUONG" && !viewDate) {
      try {
        const { createServiceCart } = await import("@/lib/service-cart");
        const orphanBookings = await prisma.appBooking.findMany({
          where: {
            createdAt: { gte: since },
            status: {
              in: ["PENDING", "CONFIRMED", "ARRIVED", "CHECKED_IN"],
            },
            customerId: { not: null },
            service: { serviceCode: "LONG_NUONG" },
          },
          take: 40,
          orderBy: { createdAt: "desc" },
          include: {
            resource: { select: { id: true, code: true, name: true } },
            customer: { select: { id: true } },
          },
        });
        for (const b of orphanBookings) {
          if (!b.customerId || !b.resource) continue;
          const tag = `bookingId:${b.id}`;
          const carts = await prisma.appServiceCart.findMany({
            where: {
              customerId: b.customerId,
              zoneCode: "LONG_NUONG",
              createdAt: { gte: since },
            },
            select: { items: true },
            take: 20,
          });
          const hasCart = carts.some((c) => {
            const items = Array.isArray(c.items) ? c.items : [];
            return items.some(
              (it) =>
                it &&
                typeof it === "object" &&
                String((it as { note?: string }).note || "").includes(tag)
            );
          });
          if (hasCart) continue;
          const arriveLabel = b.startAt.toLocaleString("vi-VN", {
            day: "2-digit",
            month: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          });
          await createServiceCart({
            customerId: b.customerId,
            zoneCode: "LONG_NUONG",
            zoneName: "Lòng Nướng Chí Phèo",
            items: [
              {
                id: `table-${b.resource.code}`,
                nameVi: `${b.resource.name} · ${arriveLabel}`,
                qty: 1,
                priceVnd: 0,
                note: `resourceId:${b.resource.id}|bookingId:${b.id}|code:${b.bookingCode}`,
              },
            ],
            ttlHours: 48,
          });
        }
      } catch (err) {
        console.error("[crm/desk long-nuong backfill]", err);
      }
    }

    /**
     * Khách có cart PENDING/OPEN phải hiện để Duyệt — kể cả thiếu SĐT.
     * (Trước đây `phoneNormalized: { not: null }` làm mất đặt bàn Lòng Nướng / QR.)
     */
    const rows = await prisma.appCustomer.findMany({
      where: {
        OR: [
          {
            serviceCarts: {
              some: {
                createdAt: {
                  gte: cartSince,
                  ...(dayEnd ? { lt: dayEnd } : {}),
                },
                zoneCode: { in: aliases },
              },
            },
          },
          {
            phoneNormalized: { not: null },
            events: {
              some: {
                createdAt: {
                  gte: since,
                  ...(dayEnd ? { lt: dayEnd } : {}),
                },
                eventType: "SERVICE_USE",
                service: { serviceCode: { in: aliases } },
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
        username: true,
        fullName: true,
        phone: true,
        phoneNormalized: true,
        phoneLast4: true,
        shortId: true,
        segment: true,
        pointsBalance: true,
        vipPlanLabel: true,
        vipExpiresAt: true,
        vipStartedAt: true,
        intendedServices: true,
        adminConfirmedAt: true,
        adminNote: true,
        createdAt: true,
        updatedAt: true,
        events: {
          where: {
            createdAt: {
              gte: dayStart,
              ...(dayEnd ? { lt: dayEnd } : {}),
            },
            OR: [
              {
                eventType: "SERVICE_USE",
                service: { serviceCode: { in: aliases } },
              },
              ...(zone === "MIA_OI" || miaOlympicSector(zone)
                ? [
                    {
                      eventType: "MIA_OI_ORDER" as const,
                      service: { serviceCode: { in: aliases } },
                    },
                  ]
                : []),
              ...(zone === "SAUNA"
                ? [
                    {
                      eventType: "SPA_ORDER" as const,
                      service: { serviceCode: { in: aliases } },
                    },
                  ]
                : []),
              ...(zone === "OLYMPIC_POOL" || miaOlympicSector(zone)
                ? [
                    {
                      eventType: "POOL_ORDER" as const,
                      service: { serviceCode: { in: aliases } },
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
            createdAt: {
              gte: dayStart,
              ...(dayEnd ? { lt: dayEnd } : {}),
            },
            service: { serviceCode: { in: aliases } },
          },
          orderBy: { createdAt: "desc" },
          take: 40,
          select: {
            id: true,
            status: true,
            totalVnd: true,
            createdAt: true,
            items: {
              select: {
                itemId: true,
                nameVi: true,
                qty: true,
                unitPriceVnd: true,
              },
            },
          },
        },
        serviceCarts: {
          where: {
            createdAt: {
              gte: cartSince,
              ...(dayEnd ? { lt: dayEnd } : {}),
            },
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
            billPhotoAt: true,
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
    const membershipByPhone = new Map<
      string,
      { planLabel: string | null; expiresAt: Date | null; startDate: Date | null }
    >();
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
          select: {
            phoneNormalized: true,
            memberships: {
              where: {
                status: "ACTIVE",
                expiryDate: { gte: today },
              },
              orderBy: { expiryDate: "desc" },
              take: 1,
              select: {
                startDate: true,
                expiryDate: true,
                plan: { select: { name: true, planCode: true } },
              },
            },
          },
        });
        for (const m of members) {
          memberPhones.add(m.phoneNormalized);
          const mem = m.memberships[0];
          if (mem) {
            membershipByPhone.set(m.phoneNormalized, {
              planLabel: mem.plan?.name || mem.plan?.planCode || "Hội viên",
              expiresAt: mem.expiryDate,
              startDate: mem.startDate,
            });
          }
        }
      } catch {
        /* CRM tables may be empty */
      }
    }

    const packageStart = new Map<string, Date>();
    const vipMissingStart = rows.filter(
      (c) =>
        String(c.segment || "").toUpperCase() === "VIP" && !c.vipStartedAt
    );
    if (vipMissingStart.length) {
      const orders = await prisma.appOrder.findMany({
        where: {
          customerId: { in: vipMissingStart.map((c) => c.id) },
          status: { not: "CANCELLED" },
          items: { some: { itemId: { in: [...OLYMPIC_PACKAGE_IDS] } } },
        },
        select: { customerId: true, createdAt: true },
        orderBy: { createdAt: "desc" },
      });
      for (const order of orders) {
        if (!packageStart.has(order.customerId)) {
          packageStart.set(order.customerId, order.createdAt);
        }
      }
      const missingAfterOrders = vipMissingStart
        .map((c) => c.id)
        .filter((id) => !packageStart.has(id));
      if (missingAfterOrders.length) {
        const carts = await prisma.appServiceCart.findMany({
          where: {
            customerId: { in: missingAfterOrders },
            status: { notIn: ["CANCELLED", "REJECTED"] },
          },
          select: { customerId: true, createdAt: true, items: true },
          orderBy: { createdAt: "desc" },
        });
        for (const cart of carts) {
          if (packageStart.has(cart.customerId)) continue;
          const items = Array.isArray(cart.items) ? cart.items : [];
          const bought = items.some((row) => {
            if (!row || typeof row !== "object") return false;
            return isOlympicPackageId(String((row as { id?: string }).id || ""));
          });
          if (bought) packageStart.set(cart.customerId, cart.createdAt);
        }
      }
      const missingAfterCarts = vipMissingStart
        .map((c) => c.id)
        .filter((id) => !packageStart.has(id));
      if (missingAfterCarts.length) {
        const offers = await prisma.appCollectedOffer.findMany({
          where: {
            customerId: { in: missingAfterCarts },
            offerId: { startsWith: "hhg-oly-" },
          },
          select: { customerId: true, collectedAt: true },
          orderBy: { collectedAt: "desc" },
        });
        for (const offer of offers) {
          if (!packageStart.has(offer.customerId)) {
            packageStart.set(offer.customerId, offer.collectedAt);
          }
        }
      }
      await Promise.all(
        vipMissingStart.map(async (c) => {
          const crm = c.phoneNormalized
            ? membershipByPhone.get(c.phoneNormalized)?.startDate
            : null;
          const start =
            packageStart.get(c.id) ||
            crm ||
            (c.vipExpiresAt
              ? vipStartedAtFromExpiry(c.vipExpiresAt, c.vipPlanLabel)
              : null);
          if (!start) return;
          packageStart.set(c.id, start);
          await prisma.appCustomer
            .update({
              where: { id: c.id },
              data: { vipStartedAt: start },
            })
            .catch((err) => {
              console.error("[desk] vip start backfill", err);
            });
        })
      );
    }

      const bonusByPhone = new Map<string, number>();
      if (zone === "SAUNA" || miaOlympicSector(zone)) {
        const phones = [
          ...new Set(
            rows.flatMap((c) => [
              ...phoneKeys(c.phoneNormalized),
              ...phoneKeys(c.phone),
            ])
          ),
        ];
        if (phones.length) {
          const students = await prisma.appSwimStudent.findMany({
            where: {
              status: "ACTIVE",
              bonusVisitsTotal: { gt: 0 },
              bonusVisitsLeft: { gt: 0 },
              startedAt: { gt: swimBonusStartedAfter() },
              OR: [
                { phoneNormalized: { in: phones } },
                { phone: { in: phones } },
              ],
            },
            select: { phone: true, phoneNormalized: true, bonusVisitsLeft: true },
          });
          for (const student of students) {
            for (const key of [
              ...phoneKeys(student.phoneNormalized),
              ...phoneKeys(student.phone),
            ]) {
              const prev = bonusByPhone.get(key);
              bonusByPhone.set(
                key,
                prev == null
                  ? student.bonusVisitsLeft
                  : Math.max(prev, student.bonusVisitsLeft)
              );
            }
          }
        }
      }

      const arrivals = rows
      .map((c) => {
        const crmMember = !!(
          c.phoneNormalized && memberPhones.has(c.phoneNormalized)
        );
        const vipActive =
          String(c.segment || "").toUpperCase() === "VIP" &&
          (!c.vipExpiresAt || c.vipExpiresAt.getTime() > Date.now());
        const segment = vipActive
          ? "VIP"
          : c.segment === "MEMBER" || crmMember
            ? "MEMBER"
            : "WALK_IN";
        const crmMem =
          (c.phoneNormalized && membershipByPhone.get(c.phoneNormalized)) ||
          null;
        const packageLabel =
          (vipActive && c.vipPlanLabel) ||
          crmMem?.planLabel ||
          (segment === "MEMBER" ? "Hội viên" : null);
        const packageExpiresAt =
          (vipActive && c.vipExpiresAt) || crmMem?.expiresAt || null;
        const scans = c.events.map((e) => {
          const meta =
            e.metadata && typeof e.metadata === "object"
              ? (e.metadata as Record<string, unknown>)
              : {};
          const orderItems = Array.isArray(meta.items)
            ? (meta.items as { name?: string; qty?: number }[])
            : [];
          const ticketVerified =
            meta.ticketVerified === true ||
            !!meta.orderId ||
            e.eventType === "MIA_OI_ORDER" ||
            e.eventType === "SPA_ORDER" ||
            e.eventType === "POOL_ORDER";
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
            cartToken:
              typeof meta.cartToken === "string" ? meta.cartToken : null,
            source: typeof meta.source === "string" ? meta.source : null,
            walkInConsumed: meta.walkInConsumed === true,
            deskOrderZone:
              typeof meta.deskOrderZone === "string"
                ? meta.deskOrderZone
                : null,
            miaOrderId:
              typeof meta.miaOrderId === "string" ? meta.miaOrderId : null,
            deskBundleId:
              typeof meta.deskBundleId === "string" ? meta.deskBundleId : null,
            manualDiscountVnd: Math.max(
              0,
              Math.round(Number(meta.manualDiscountVnd) || 0)
            ),
            manualDiscountNote:
              typeof meta.manualDiscountNote === "string" &&
              meta.manualDiscountNote.trim()
                ? meta.manualDiscountNote.trim()
                : null,
            ticketItems: orderItems.map((i) => {
              const row = i as {
                name?: string;
                qty?: number;
                unitPriceVnd?: number;
                itemId?: string;
                pointsDiscountVnd?: number;
                pointsRedeemTier?: number | null;
              };
              return {
                nameVi: String(row.name || ""),
                qty: Number(row.qty) || 1,
                unitPriceVnd:
                  typeof row.unitPriceVnd === "number" ? row.unitPriceVnd : 0,
                itemId: typeof row.itemId === "string" ? row.itemId : "",
                pointsDiscountVnd:
                  typeof row.pointsDiscountVnd === "number"
                    ? row.pointsDiscountVnd
                    : 0,
                pointsRedeemTier:
                  row.pointsRedeemTier === 50 || row.pointsRedeemTier === 100
                    ? row.pointsRedeemTier
                    : null,
              };
            }),
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
            itemId: i.itemId,
            nameVi: i.nameVi,
            qty: i.qty,
            unitPriceVnd: i.unitPriceVnd,
          })),
        }));

        const carts = (c.serviceCarts || []).map((row) => {
          const items = parseCartItems(row.items);
          const menuItems = items.filter(
            (i) =>
              !i.id.startsWith("voucher-") &&
              !i.id.startsWith("points-redeem-")
          );
          const promo = parseCartPromo(items);
          return {
            token: row.token,
            zoneCode: row.zoneCode,
            zoneName: row.zoneName,
            items,
            totalVnd: row.totalVnd,
            status: row.status,
            adminNote: row.adminNote,
            hasBillPhoto: Boolean(row.billPhotoAt),
            createdAt: row.createdAt,
            expiresAt: row.expiresAt,
            billText: menuItems.length
              ? menuItems.map((i) => `${i.qty}× ${i.nameVi}`).join(", ")
              : "—",
            promoLabel: promo.label !== "—" ? promo.label : null,
            hasVoucher: promo.hasVoucher,
            hasPointsRedeem: promo.hasPointsRedeem,
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

        const todayPackageVnd = orders.reduce(
          (s, o) => (o.status === "CANCELLED" ? s : s + o.totalVnd),
          0
        );
        const cartCreatedAt = latestCart?.createdAt || null;

        const phone =
          c.phone ||
          c.phoneNormalized ||
          null;
        const shortId =
          c.phoneLast4 ||
          c.shortId ||
          (phone ? String(phone).replace(/\D/g, "").slice(-4) : null) ||
          (c.customerCode ? String(c.customerCode).slice(-6) : null);
        const fullName =
          (c.fullName && c.fullName.trim()) ||
          c.username ||
          c.customerCode ||
          null;

        return {
          id: c.id,
          customerCode: c.customerCode,
          fullName,
          phone,
          shortId,
          segment,
          segmentLabel:
            segment === "VIP"
              ? "VIP"
              : segment === "MEMBER"
                ? "Member"
                : "Khách lẻ",
          vipStartedAt: c.vipStartedAt || packageStart.get(c.id) || null,
          pointsBalance: c.pointsBalance ?? 0,
          swimBonusLeft: (() => {
            const keys = [...phoneKeys(c.phoneNormalized), ...phoneKeys(c.phone)];
            for (const key of keys) {
              if (bonusByPhone.has(key)) return bonusByPhone.get(key) ?? 0;
            }
            return null;
          })(),
          packageLabel,
          packageExpiresAt,
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
      viewDate: viewDate || null,
      user: toSafeUser(gate.user),
      isAdmin: isDeskAdminForZone(gate.user, zone),
      isSystemAdmin: isSystemAdmin(gate.user),
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
  pointsRedeemQty?: number;
}[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((i) => {
      const row = i as Record<string, unknown>;
      const pointsRedeemQty = Math.max(
        0,
        Math.round(Number(row.pointsRedeemQty) || 0)
      );
      return {
        id: String(row.id || "").trim(),
        nameVi: String(row.nameVi || "").trim(),
        qty: Math.max(1, Number(row.qty) || 1),
        priceVnd: Math.max(0, Number(row.priceVnd) || 0),
        ...(pointsRedeemQty > 0 ? { pointsRedeemQty } : {}),
      };
    })
    .filter((i) => i.id && i.nameVi);
}
