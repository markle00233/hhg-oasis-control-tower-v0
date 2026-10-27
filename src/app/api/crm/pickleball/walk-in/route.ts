import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { requireDeskZone } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { hashPassword } from "@/lib/password";
import { normalizePhone, phoneShortId } from "@/lib/phone";
import { priceForRange } from "@/lib/pickleball";
import { formatVnDateTime, formatVnTime } from "@/lib/revise-booking";
import { prisma } from "@/lib/prisma";
import { createServiceCart, serviceCartQrPayload } from "@/lib/service-cart";
import { CART_STATUS } from "@/lib/cart-status";

export const dynamic = "force-dynamic";

function bookingCode() {
  return `PB-${Date.now().toString(36).toUpperCase()}-${Math.random()
    .toString(36)
    .slice(2, 5)
    .toUpperCase()}`;
}

function generateCustomerCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(6);
  let body = "";
  for (let i = 0; i < 6; i++) body += alphabet[bytes[i]! % alphabet.length];
  return `CUS-${body}`;
}

/**
 * Quầy Pickleball: khách đến trực tiếp — NV ghi tên/SĐT/tiền/sân/giờ
 * → booking + cart OPEN (đã duyệt tại chỗ) hiện trên dashboard.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const zone = "PICKLEBALL";
    const gate = await requireDeskZone(zone);
    if ("error" in gate) return gate.error;

    const fullName = String(body.fullName || body.guestName || "")
      .trim()
      .slice(0, 120);
    const phoneRaw = String(body.phone || body.guestPhone || "").trim();
    const resourceId = String(body.resourceId || "").trim();
    const startAt = new Date(body.startAt);
    const endAt = new Date(body.endAt);
    const partySize = Math.min(Math.max(Number(body.partySize) || 2, 1), 8);
    const paidRaw = body.paidVnd ?? body.totalVnd;
    const startSession = Boolean(body.startSession);

    if (!fullName) {
      return NextResponse.json({ error: "Nhập tên khách." }, { status: 400 });
    }
    if (!resourceId || Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) {
      return NextResponse.json(
        { error: "Thiếu sân / khung giờ." },
        { status: 400 }
      );
    }
    if (endAt <= startAt) {
      return NextResponse.json({ error: "Khung giờ không hợp lệ." }, { status: 400 });
    }

    const phoneNormalized = normalizePhone(phoneRaw);
    const hasPhone = phoneNormalized.length >= 9 && phoneNormalized.length <= 11;
    const phoneDisplay = hasPhone
      ? phoneNormalized.startsWith("0")
        ? phoneNormalized
        : `0${phoneNormalized}`
      : null;

    const service = await prisma.appService.findUnique({
      where: { serviceCode: "PICKLEBALL" },
    });
    if (!service) {
      return NextResponse.json({ error: "Pickleball chưa cấu hình." }, { status: 404 });
    }

    const court = await prisma.appResource.findFirst({
      where: {
        id: resourceId,
        serviceId: service.id,
        type: "COURT",
        active: true,
      },
    });
    if (!court) {
      return NextResponse.json({ error: "Sân không hợp lệ." }, { status: 404 });
    }

    const conflict = await prisma.appBooking.findFirst({
      where: {
        resourceId: court.id,
        status: {
          in: ["PENDING", "CONFIRMED", "ARRIVED", "CHECKED_IN", "IN_SERVICE"],
        },
        startAt: { lt: endAt },
        endAt: { gt: startAt },
      },
    });
    if (conflict) {
      return NextResponse.json(
        { error: "Khung giờ này sân đã có người đặt." },
        { status: 409 }
      );
    }

    let customer =
      hasPhone
        ? await prisma.appCustomer.findFirst({ where: { phoneNormalized } })
        : null;

    if (customer) {
      customer = await prisma.appCustomer.update({
        where: { id: customer.id },
        data: {
          fullName,
          phone: phoneDisplay || customer.phone,
          phoneLast4: phoneShortId(phoneDisplay || phoneNormalized),
          shortId: phoneShortId(phoneDisplay || phoneNormalized),
          status: "ACTIVE",
        },
      });
    } else {
      const passwordHash = await hashPassword(
        `desk_${randomBytes(12).toString("base64url")}`
      );
      const synthPhone = hasPhone
        ? phoneNormalized
        : `w${Date.now().toString().slice(-10)}`;
      for (let i = 0; i < 6; i++) {
        const customerCode = generateCustomerCode();
        try {
          customer = await prisma.appCustomer.create({
            data: {
              customerCode,
              username: customerCode,
              passwordHash,
              status: "ACTIVE",
              fullName,
              phone: phoneDisplay,
              phoneNormalized: synthPhone,
              phoneLast4: phoneShortId(synthPhone),
              shortId: phoneShortId(synthPhone),
              segment: "WALK_IN",
              identityToken: `oq_${randomBytes(18).toString("base64url")}`,
              adminConfirmedAt: new Date(),
              adminNote: "Walk-in Pickleball quầy",
            },
          });
          break;
        } catch (e) {
          if (
            e instanceof Prisma.PrismaClientKnownRequestError &&
            e.code === "P2002"
          ) {
            continue;
          }
          throw e;
        }
      }
    }
    if (!customer) {
      return NextResponse.json({ error: "Không tạo được khách." }, { status: 500 });
    }

    const priced = priceForRange(startAt, endAt);
    const totalVnd =
      paidRaw != null && paidRaw !== ""
        ? Math.max(0, Math.round(Number(paidRaw) || 0))
        : priced;

    const slotLabel = `${formatVnDateTime(startAt)}–${formatVnTime(endAt)}`;

    const booking = await prisma.appBooking.create({
      data: {
        bookingCode: bookingCode(),
        customerId: customer.id,
        customerNameSnapshot: fullName,
        phone: phoneDisplay || customer.phone,
        phoneNormalized: customer.phoneNormalized,
        serviceId: service.id,
        resourceId: court.id,
        startAt,
        endAt,
        partySize,
        status: startSession ? "IN_SERVICE" : "CONFIRMED",
        notes: `Walk-in quầy · ${totalVnd}đ · ${partySize} người`,
        source: "STAFF",
        createdByType: "STAFF",
        createdById: gate.user.id,
      },
    });

    const { cart, payload } = await createServiceCart({
      customerId: customer.id,
      zoneCode: "PICKLEBALL",
      zoneName: "Pickleball",
      status: CART_STATUS.OPEN,
      items: [
        {
          id: `court-${court.code}`,
          nameVi: `${court.name} · ${slotLabel}`,
          qty: 1,
          priceVnd: totalVnd,
          note: `resourceId:${court.id}|bookingId:${booking.id}|code:${booking.bookingCode}|source:STAFF`,
        },
      ],
      ttlHours: 24,
    });

    let sessionId: string | null = null;
    if (startSession) {
      const overlapsNow =
        startAt.getTime() <= Date.now() && endAt.getTime() > Date.now() - 5 * 60 * 1000;
      if (overlapsNow || body.forceStart) {
        const existing = await prisma.appResourceSession.findFirst({
          where: { resourceId: court.id, status: "OCCUPIED" },
        });
        if (!existing) {
          const session = await prisma.$transaction(async (tx) => {
            await tx.appResource.update({
              where: { id: court.id },
              data: { status: "OCCUPIED" },
            });
            const s = await tx.appResourceSession.create({
              data: {
                resourceId: court.id,
                customerId: customer.id,
                bookingId: booking.id,
                status: "OCCUPIED",
                startAt: new Date(),
                note: `${fullName}${phoneDisplay ? ` · ${phoneDisplay}` : ""} · ${partySize} người`,
              },
            });
            await tx.appServiceCart.update({
              where: { id: cart.id },
              data: { status: CART_STATUS.USED },
            });
            return s;
          });
          sessionId = session.id;
        }
      }
    }

    await writeAudit({
      actorType: "STAFF",
      actorId: gate.user.id,
      action: "PICKLEBALL_WALK_IN",
      entityType: "AppBooking",
      entityId: booking.id,
      zoneCode: zone,
      payload: {
        resourceId: court.id,
        customerId: customer.id,
        totalVnd,
        cartToken: cart.token,
        sessionId,
      },
    });

    return NextResponse.json({
      ok: true,
      booking: {
        id: booking.id,
        bookingCode: booking.bookingCode,
        startAt: booking.startAt,
        endAt: booking.endAt,
        courtName: court.name,
        partySize,
        totalVnd,
        source: "STAFF",
      },
      cart: {
        token: cart.token,
        status: sessionId ? CART_STATUS.USED : cart.status,
        totalVnd: cart.totalVnd,
        payload: serviceCartQrPayload(cart.token),
      },
      customer: {
        id: customer.id,
        fullName: customer.fullName,
        phone: customer.phone,
        customerCode: customer.customerCode,
      },
      sessionId,
    });
  } catch (e) {
    console.error("[pickleball/walk-in]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Walk-in failed" },
      { status: 500 }
    );
  }
}
