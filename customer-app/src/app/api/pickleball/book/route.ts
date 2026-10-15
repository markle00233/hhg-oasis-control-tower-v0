import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionCustomer } from "@/lib/session";
import { priceForRange } from "@/lib/pickleball";
import {
  CART_STATUS,
  createServiceCart,
  serviceCartQrPayload,
} from "@/lib/service-cart";

export const dynamic = "force-dynamic";
export const preferredRegion = "sin1";

function bookingCode() {
  return `PB-${Date.now().toString(36).toUpperCase()}-${Math.random()
    .toString(36)
    .slice(2, 5)
    .toUpperCase()}`;
}

/** Customer books a pickleball court → PENDING cart (giống các khu khác). */
export async function POST(req: NextRequest) {
  try {
    const customer = await getSessionCustomer();
    if (!customer) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const resourceId = String(body.resourceId || "").trim();
    const startAt = new Date(body.startAt);
    const endAt = new Date(body.endAt);
    const partySize = Math.min(Math.max(Number(body.partySize) || 2, 1), 8);

    if (!resourceId || Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) {
      return NextResponse.json({ error: "Thiếu sân / khung giờ." }, { status: 400 });
    }
    if (endAt <= startAt) {
      return NextResponse.json({ error: "Khung giờ không hợp lệ." }, { status: 400 });
    }
    if (startAt.getTime() < Date.now() - 5 * 60 * 1000) {
      return NextResponse.json({ error: "Không đặt khung giờ đã qua." }, { status: 400 });
    }

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

    if (court.status === "OCCUPIED" || court.status === "BLOCKED") {
      const overlapsNow =
        startAt.getTime() <= Date.now() && endAt.getTime() > Date.now();
      if (overlapsNow) {
        return NextResponse.json(
          { error: "Sân đang được sử dụng. Chọn khung giờ khác." },
          { status: 409 }
        );
      }
    }

    const totalVnd = priceForRange(startAt.toISOString(), endAt.toISOString());
    const slotLabel = `${startAt.toLocaleString("vi-VN", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })}–${endAt.toLocaleTimeString("vi-VN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })}`;

    const booking = await prisma.appBooking.create({
      data: {
        bookingCode: bookingCode(),
        customerId: customer.id,
        customerNameSnapshot: customer.fullName,
        phone: customer.phone,
        phoneNormalized: customer.phoneNormalized,
        serviceId: service.id,
        resourceId: court.id,
        startAt,
        endAt,
        partySize,
        status: "CONFIRMED",
        notes: `Online · ${totalVnd}đ`,
        source: "CUSTOMER",
        createdByType: "CUSTOMER",
        createdById: customer.id,
      },
      include: {
        resource: { select: { code: true, name: true } },
      },
    });

    const { cart, payload } = await createServiceCart({
      customerId: customer.id,
      zoneCode: "PICKLEBALL",
      zoneName: "Pickleball",
      items: [
        {
          id: `court-${court.code}`,
          nameVi: `${court.name} · ${slotLabel}`,
          qty: 1,
          priceVnd: totalVnd,
          note: `resourceId:${court.id}|bookingId:${booking.id}|code:${booking.bookingCode}|source:CUSTOMER`,
        },
      ],
      ttlHours: 48,
    });

    return NextResponse.json({
      ok: true,
      booking: {
        id: booking.id,
        bookingCode: booking.bookingCode,
        startAt: booking.startAt,
        endAt: booking.endAt,
        courtName: booking.resource?.name,
        totalVnd,
        partySize,
      },
      cart: {
        token: cart.token,
        status: cart.status || CART_STATUS.PENDING,
        totalVnd: cart.totalVnd,
        payload: cart.status === CART_STATUS.OPEN ? payload : null,
      },
      payload: serviceCartQrPayload(cart.token),
      customer: {
        fullName: customer.fullName,
        customerCode: customer.customerCode,
      },
    });
  } catch (e) {
    console.error("[pickleball/book]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Book failed" },
      { status: 500 }
    );
  }
}
