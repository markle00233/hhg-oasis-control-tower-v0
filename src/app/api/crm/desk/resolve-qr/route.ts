import { NextRequest, NextResponse } from "next/server";
import { requireDeskZone } from "@/lib/auth";
import { deskZoneAliases, deskZoneServiceCode } from "@/lib/desk-zones";
import {
  customerHasLoginAccount,
  deskSegmentOf,
} from "@/lib/desk-segment";
import { findCustomerByIdentityToken } from "@/lib/identity-qr";
import { prisma } from "@/lib/prisma";
import { redeemVoucherScan, voucherTokenFromScan } from "@/lib/voucher-redeem";

export const dynamic = "force-dynamic";

const DESK_SCAN_DEDUP_MS = 60_000;

/**
 * Staff scans My Oasis QR / cart QR → resolve customer and return the open cart.
 * Scanning does not confirm payment. Staff confirms the transaction, uploads the bill, then finalizes.
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
          status: cart.status,
          expiresAt: cart.expiresAt,
        },
        table: null,
        court: null,
        spa: null,
        payment: null,
        membership: null,
        customer: {
          id: cart.customer.id,
          customerCode: cart.customer.customerCode,
          fullName: cart.customer.fullName,
          phone: cart.customer.phone,
          shortId: cart.customer.shortId || cart.customer.phoneLast4,
          segment: cart.customer.segment,
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
          { serviceCode: deskZoneServiceCode(zone) },
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

    const marked = deskSegmentOf({
      segment: customer.segment,
      vipExpiresAt: customer.vipExpiresAt,
      vipPlanLabel: customer.vipPlanLabel,
      hasAccount: customerHasLoginAccount(customer),
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
        segment: marked.segment,
        segmentLabel: marked.segmentLabel,
      },
      table: null,
      court: null,
      spa: null,
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
  /** Prefer mapped code (MIA_OLYMPIC → OLYMPIC_POOL) so desk can attach pool tickets. */
  const preferredService = deskZoneServiceCode(opts.zone);
  const service = await prisma.appService.findFirst({
    where: {
      OR: [
        { serviceCode: preferredService },
        ...(preferredService !== opts.zone
          ? [{ serviceCode: opts.zone }]
          : []),
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
