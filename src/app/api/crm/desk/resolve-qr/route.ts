import { NextRequest, NextResponse } from "next/server";
import { requireDeskZone } from "@/lib/auth";
import { CART_STATUS } from "@/lib/cart-status";
import { deskZoneAliases } from "@/lib/desk-zones";
import { findCustomerByIdentityToken } from "@/lib/identity-qr";
import { activateLongNuongTable } from "@/lib/long-nuong-activate";
import {
  applyOlympicMembership,
  pickPrimaryOlympicPackage,
} from "@/lib/olympic-membership";
import { activatePickleballCourt } from "@/lib/pickleball-activate";
import { prisma } from "@/lib/prisma";
import { redeemVoucherScan, voucherTokenFromScan } from "@/lib/voucher-redeem";

export const dynamic = "force-dynamic";

const DESK_SCAN_DEDUP_MS = 60_000;

/**
 * Staff scans My Oasis QR / cart QR → resolve customer, ensure SERVICE_USE
 * (desk check-in), return open cart for order panel.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const zone = String(body.zone || "").trim().toUpperCase();
    const raw = String(body.token || body.payload || "").trim();
    if (!zone || !raw) {
      return NextResponse.json({ error: "Thiếu zone / token" }, { status: 400 });
    }

    const gate = await requireDeskZone(zone);
    if ("error" in gate) return gate.error;

    const aliases = deskZoneAliases(zone);
    const now = new Date();

    if (voucherTokenFromScan(raw)) {
      try {
        const redeemed = await redeemVoucherScan({
          raw,
          deskZone: zone,
          staffUserId: gate.user.id,
          staffName: gate.user.displayName || gate.user.username,
        });
        if (!redeemed) {
          return NextResponse.json(
            { error: "QR voucher không hợp lệ." },
            { status: 404 }
          );
        }
        const v = redeemed.voucher;
        return NextResponse.json({
          ok: true,
          mode: "VOUCHER",
          already: redeemed.already,
          voucher: v
            ? {
                token: v.token,
                offerId: v.offerId,
                offerTitle: v.offerTitle,
                zoneCode: v.zoneCode,
                status: "SCANNED",
                scannedAt: v.scannedAt,
                scannedByName: v.scannedByName,
              }
            : null,
          log: redeemed.log
            ? {
                id: redeemed.log.id,
                at: redeemed.log.createdAt,
                claimedByName: redeemed.log.claimedByName,
                offerTitle: redeemed.log.offerTitle,
                note: redeemed.log.note,
              }
            : null,
          customer: {
            id: redeemed.customer.id,
            customerCode: redeemed.customer.customerCode,
            fullName: redeemed.customer.fullName,
            phone: redeemed.customer.phone,
            shortId:
              redeemed.customer.shortId || redeemed.customer.phoneLast4,
            segment: redeemed.customer.segment,
          },
        });
      } catch (e) {
        const status =
          e && typeof e === "object" && "status" in e
            ? Number((e as { status: number }).status) || 500
            : 500;
        if (status >= 500) console.error("[resolve-qr voucher]", e);
        return NextResponse.json(
          {
            error:
              e instanceof Error ? e.message : "Không xác nhận được voucher",
          },
          { status }
        );
      }
    }

    // Service-cart QR (multi-select): /q/sc_… carries all chosen items
    const cartToken = raw.includes("/q/")
      ? raw.split("/q/").pop()?.split(/[?#]/)[0] || ""
      : raw.startsWith("sc_")
        ? raw
        : "";

    if (cartToken.startsWith("sc_")) {
      const cart = await prisma.appServiceCart.findUnique({
        where: { token: decodeURIComponent(cartToken) },
        include: {
          customer: {
            select: {
              id: true,
              customerCode: true,
              fullName: true,
              phone: true,
              phoneNormalized: true,
              phoneLast4: true,
              shortId: true,
              segment: true,
            },
          },
        },
      });
      if (!cart || !cart.customer) {
        return NextResponse.json(
          { error: "QR giỏ dịch vụ không hợp lệ." },
          { status: 404 }
        );
      }

      const scan = await ensureDeskScan({
        customerId: cart.customer.id,
        zone,
        cartToken: cart.token,
      });

      let tableActivation: Awaited<
        ReturnType<typeof activateLongNuongTable>
      > | null = null;
      if (
        zone === "LONG_NUONG" &&
        (cart.status === "OPEN" || cart.status === "PENDING_APPROVAL")
      ) {
        tableActivation = await activateLongNuongTable({
          cartId: cart.id,
          customerId: cart.customer.id,
          items: cart.items,
          cartStatus: cart.status,
        }).catch((err) => {
          console.error("[resolve-qr long-nuong]", err);
          return null;
        });
      }

      let courtActivation: Awaited<
        ReturnType<typeof activatePickleballCourt>
      > | null = null;
      if (zone === "PICKLEBALL" && cart.status === "OPEN") {
        courtActivation = await activatePickleballCourt({
          cartId: cart.id,
          customerId: cart.customer.id,
          items: cart.items,
          cartStatus: cart.status,
          guestName: cart.customer.fullName,
          guestPhone: cart.customer.phone,
        }).catch((err) => {
          console.error("[resolve-qr pickleball]", err);
          return null;
        });
      }

      /** Hồ Olympic — gói tháng: quét QR OPEN = xác nhận nâng cấp → VIP + theme. */
      let membership: {
        planLabel: string;
        expiresAt: Date;
        packageId: string;
      } | null = null;
      if (
        (zone === "OLYMPIC_POOL" || zone === "OLYMPIC") &&
        cart.status === "OPEN"
      ) {
        const itemIds = Array.isArray(cart.items)
          ? cart.items
              .map((row) =>
                row && typeof row === "object"
                  ? String((row as { id?: string }).id || "")
                  : ""
              )
              .filter(Boolean)
          : [];
        const pkgId = pickPrimaryOlympicPackage(itemIds);
        if (pkgId) {
          const applied = await applyOlympicMembership(prisma, {
            customerId: cart.customer.id,
            packageId: pkgId,
          }).catch((err) => {
            console.error("[resolve-qr membership]", err);
            return null;
          });
          if (applied?.alreadyActive) {
            const exp = applied.vipExpiresAt.toLocaleDateString("vi-VN");
            return NextResponse.json(
              {
                error: `Khách đang dùng ${applied.vipPlanLabel} đến ${exp}. Hết hạn mới được gắn gói mới (không nâng/hạ gói khi còn hạn).`,
                membershipLocked: true,
                membership: {
                  planLabel: applied.vipPlanLabel,
                  expiresAt: applied.vipExpiresAt,
                  packageId: pkgId,
                },
              },
              { status: 409 }
            );
          }
          if (applied && !applied.alreadyActive) {
            membership = {
              planLabel: applied.vipPlanLabel,
              expiresAt: applied.vipExpiresAt,
              packageId: pkgId,
            };
            await prisma.appServiceCart
              .update({
                where: { id: cart.id },
                data: { status: CART_STATUS.USED },
              })
              .catch(() => undefined);
          }
        }
      }

      return NextResponse.json({
        ok: true,
        mode: "SERVICE_CART",
        scanEventId: scan?.id || null,
        cart: {
          token: cart.token,
          zoneCode: cart.zoneCode,
          zoneName: cart.zoneName,
          items: cart.items,
          totalVnd: cart.totalVnd,
          status:
            tableActivation?.activated ||
            courtActivation?.activated ||
            membership
              ? "USED"
              : cart.status,
          expiresAt: cart.expiresAt,
        },
        table: tableActivation?.activated
          ? {
              activated: true,
              already: "already" in tableActivation && tableActivation.already,
              resource: tableActivation.resource,
              sessionId: tableActivation.sessionId,
            }
          : null,
        court: courtActivation?.activated
          ? {
              activated: true,
              already: "already" in courtActivation && courtActivation.already,
              resource: courtActivation.resource,
              sessionId: courtActivation.sessionId,
            }
          : null,
        payment: null,
        membership,
        customer: {
          id: cart.customer.id,
          customerCode: cart.customer.customerCode,
          fullName: cart.customer.fullName,
          phone: cart.customer.phone,
          shortId: cart.customer.shortId || cart.customer.phoneLast4,
          segment: membership ? "VIP" : cart.customer.segment,
        },
        bookings: [],
      });
    }

    const customer = await findCustomerByIdentityToken(raw);
    if (!customer) {
      return NextResponse.json(
        { error: "Không nhận diện được khách từ QR." },
        { status: 404 }
      );
    }

    const service = await prisma.appService.findFirst({
      where: {
        OR: [
          { serviceCode: zone },
          { serviceCode: mapDeskZoneToService(zone) },
        ],
      },
    });

    const windowStart = new Date(now.getTime() - 2 * 60 * 60 * 1000);
    const windowEnd = new Date(now.getTime() + 3 * 60 * 60 * 1000);

    const bookings = service
      ? await prisma.appBooking.findMany({
          where: {
            serviceId: service.id,
            status: {
              in: ["PENDING", "CONFIRMED", "ARRIVED", "CHECKED_IN", "IN_SERVICE"],
            },
            startAt: { lte: windowEnd },
            endAt: { gte: windowStart },
            OR: [
              { customerId: customer.id },
              ...(customer.phoneNormalized
                ? [{ phoneNormalized: customer.phoneNormalized }]
                : []),
            ],
          },
          include: {
            resource: { select: { id: true, code: true, name: true } },
          },
          orderBy: { startAt: "asc" },
          take: 10,
        })
      : [];

    const openCart = await prisma.appServiceCart.findFirst({
      where: {
        customerId: customer.id,
        status: { in: ["PENDING_APPROVAL", "OPEN"] },
        expiresAt: { gt: now },
        zoneCode: { in: aliases },
      },
      orderBy: { createdAt: "desc" },
    });

    const scan = await ensureDeskScan({
      customerId: customer.id,
      zone,
      cartToken: openCart?.token || null,
    });

    return NextResponse.json({
      ok: true,
      mode:
        bookings.length === 0
          ? "WALK_IN"
          : bookings.length === 1
            ? "BOOKING"
            : "MULTI",
      scanEventId: scan?.id || null,
      customer: {
        id: customer.id,
        customerCode: customer.customerCode,
        fullName: customer.fullName,
        phone: customer.phone,
        shortId: customer.shortId || customer.phoneLast4,
        segment: customer.segment,
      },
      cart: openCart
        ? {
            token: openCart.token,
            zoneCode: openCart.zoneCode,
            zoneName: openCart.zoneName,
            items: openCart.items,
            totalVnd: openCart.totalVnd,
            status: openCart.status,
            expiresAt: openCart.expiresAt,
          }
        : null,
      bookings: bookings.map((b) => ({
        id: b.id,
        bookingCode: b.bookingCode,
        status: b.status,
        startAt: b.startAt,
        endAt: b.endAt,
        partySize: b.partySize,
        resource: b.resource,
      })),
    });
  } catch (e) {
    console.error("[desk/resolve-qr]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}

/** Staff scanned guest QR at desk → create SERVICE_USE so guest appears + can verify. */
async function ensureDeskScan(opts: {
  customerId: string;
  zone: string;
  cartToken?: string | null;
}) {
  const service = await prisma.appService.findFirst({
    where: {
      OR: [
        { serviceCode: opts.zone },
        { serviceCode: mapDeskZoneToService(opts.zone) },
      ],
    },
    select: { id: true },
  });
  if (!service) return null;

  const recent = await prisma.appServiceEvent.findFirst({
    where: {
      customerId: opts.customerId,
      serviceId: service.id,
      eventType: "SERVICE_USE",
      createdAt: { gte: new Date(Date.now() - DESK_SCAN_DEDUP_MS) },
    },
    orderBy: { createdAt: "desc" },
  });
  if (recent) {
    if (opts.cartToken) {
      const prev =
        recent.metadata && typeof recent.metadata === "object"
          ? (recent.metadata as Record<string, unknown>)
          : {};
      if (!prev.cartToken) {
        await prisma.appServiceEvent.update({
          where: { id: recent.id },
          data: {
            metadata: { ...prev, cartToken: opts.cartToken },
          },
        });
      }
    }
    return recent;
  }

  return prisma.appServiceEvent.create({
    data: {
      customerId: opts.customerId,
      serviceId: service.id,
      eventType: "SERVICE_USE",
      operationalStatus: "NEW",
      metadata: {
        source: "desk_scan_customer_qr",
        ...(opts.cartToken ? { cartToken: opts.cartToken } : {}),
      },
    },
  });
}

function mapDeskZoneToService(zone: string) {
  const map: Record<string, string> = {
    PICKLEBALL: "PICKLEBALL",
    SPA: "SPA",
    MIA_OI: "MIA_OI",
    VIP: "VIP_RESORT",
    VIP_RESORT: "VIP_RESORT",
    OLYMPIC: "OLYMPIC_POOL",
    OLYMPIC_POOL: "OLYMPIC_POOL",
    RESORT: "RESORT_POOL",
    RESORT_POOL: "RESORT_POOL",
    LONG_NUONG: "LONG_NUONG",
    SAUNA: "SAUNA",
  };
  return map[zone] || zone;
}
