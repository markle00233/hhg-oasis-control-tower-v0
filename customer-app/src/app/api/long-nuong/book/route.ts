import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionCustomer } from "@/lib/session";
import { LONG_NUONG_SESSION_HOURS } from "@/lib/long-nuong";
import {
  CART_STATUS,
  createServiceCart,
  serviceCartQrPayload,
} from "@/lib/service-cart";

export const dynamic = "force-dynamic";
export const preferredRegion = "sin1";

function bookingCode() {
  return `LN-${Date.now().toString(36).toUpperCase()}-${Math.random()
    .toString(36)
    .slice(2, 5)
    .toUpperCase()}`;
}

/**
 * Chỉ đặt bàn: khách chọn bàn + giờ đến → PENDING cart QR.
 * Không gắn đồ ăn / set.
 */
export async function POST(req: NextRequest) {
  try {
    const customer = await getSessionCustomer();
    if (!customer) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const resourceId = String(body.resourceId || "").trim();
    const partySize = Math.min(Math.max(Number(body.partySize) || 4, 1), 20);
    const startAt = new Date(body.startAt);
    let endAt = new Date(body.endAt);

    if (!resourceId || Number.isNaN(startAt.getTime())) {
      return NextResponse.json(
        { error: "Chọn bàn và giờ đến." },
        { status: 400 }
      );
    }
    if (Number.isNaN(endAt.getTime()) || endAt <= startAt) {
      endAt = new Date(
        startAt.getTime() + LONG_NUONG_SESSION_HOURS * 60 * 60 * 1000
      );
    }
    if (startAt.getTime() < Date.now() - 5 * 60 * 1000) {
      return NextResponse.json(
        { error: "Giờ đến đã qua — chọn khung khác." },
        { status: 400 }
      );
    }

    const service = await prisma.appService.findUnique({
      where: { serviceCode: "LONG_NUONG" },
    });
    if (!service) {
      return NextResponse.json(
        { error: "Lòng Nướng chưa cấu hình." },
        { status: 404 }
      );
    }

    const table = await prisma.appResource.findFirst({
      where: {
        id: resourceId,
        serviceId: service.id,
        type: "TABLE",
        active: true,
      },
      include: {
        sessions: {
          where: { status: "OCCUPIED" },
          take: 1,
        },
      },
    });
    if (!table) {
      return NextResponse.json({ error: "Bàn không hợp lệ." }, { status: 404 });
    }
    if (table.status === "BLOCKED") {
      return NextResponse.json(
        { error: "Bàn tạm khoá. Chọn bàn khác." },
        { status: 409 }
      );
    }

    const now = Date.now();
    const overlapsNow = startAt.getTime() <= now && endAt.getTime() > now;
    if (
      overlapsNow &&
      (table.status === "OCCUPIED" ||
        table.status === "CLEANING" ||
        table.sessions.length > 0)
    ) {
      return NextResponse.json(
        { error: "Bàn đang được sử dụng ở khung giờ này." },
        { status: 409 }
      );
    }

    const conflict = await prisma.appBooking.findFirst({
      where: {
        resourceId: table.id,
        status: {
          in: ["PENDING", "CONFIRMED", "ARRIVED", "CHECKED_IN", "IN_SERVICE"],
        },
        startAt: { lt: endAt },
        endAt: { gt: startAt },
      },
    });
    if (conflict) {
      return NextResponse.json(
        { error: "Ngày/giờ này bàn đã có người đặt." },
        { status: 409 }
      );
    }

    const arriveLabel = startAt.toLocaleString("vi-VN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });

    const booking = await prisma.$transaction(async (tx) => {
      if (overlapsNow) {
        await tx.appResource.update({
          where: { id: table.id },
          data: { status: "RESERVED" },
        });
      }
      return tx.appBooking.create({
        data: {
          bookingCode: bookingCode(),
          customerId: customer.id,
          customerNameSnapshot: customer.fullName,
          phone: customer.phone,
          phoneNormalized: customer.phoneNormalized,
          serviceId: service.id,
          resourceId: table.id,
          startAt,
          endAt,
          partySize,
          status: "CONFIRMED",
          notes: `Đặt bàn · đến ${arriveLabel}`,
          source: "CUSTOMER",
          createdByType: "CUSTOMER",
          createdById: customer.id,
        },
      });
    });

    const items = [
      {
        id: `table-${table.code}`,
        nameVi: `${table.name} · ${arriveLabel}`,
        qty: 1,
        priceVnd: 0,
        note: `resourceId:${table.id}|bookingId:${booking.id}|code:${booking.bookingCode}`,
      },
    ];

    const { cart, payload } = await createServiceCart({
      customerId: customer.id,
      zoneCode: "LONG_NUONG",
      zoneName: "Lòng Nướng Chí Phèo",
      items,
      ttlHours: 48,
    });

    return NextResponse.json({
      ok: true,
      booking: {
        id: booking.id,
        bookingCode: booking.bookingCode,
        startAt: booking.startAt,
        endAt: booking.endAt,
        tableName: table.name,
        tableCode: table.code,
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
    console.error("[long-nuong/book]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Book failed" },
      { status: 500 }
    );
  }
}
