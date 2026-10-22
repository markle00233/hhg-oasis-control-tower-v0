import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionCustomer } from "@/lib/session";
import { ensureLongNuongService } from "@/lib/ensure-long-nuong";
import { LONG_NUONG_SESSION_HOURS } from "@/lib/long-nuong";
import { isValidPhone, normalizePhone, phoneShortId } from "@/lib/phone";
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
 * Yêu cầu đặt bàn: tên, SĐT, giờ đến, số khách.
 * Không chọn bàn, không QR. Quầy gọi xác nhận.
 */
export async function POST(req: NextRequest) {
  try {
    const customer = await getSessionCustomer();
    if (!customer) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const resourceId = String(body.resourceId || "").trim();
    const guestName = String(body.guestFullName || body.fullName || "").trim();
    const guestPhone = String(body.guestPhone || body.phone || "").trim();
    const partySize = Math.min(Math.max(Number(body.partySize) || 0, 0), 20);
    const startAt = new Date(body.startAt);
    let endAt = new Date(body.endAt);

    if (guestName.length < 2) {
      return NextResponse.json({ error: "Nhập họ tên." }, { status: 400 });
    }
    if (!isValidPhone(guestPhone)) {
      return NextResponse.json(
        { error: "Số điện thoại không hợp lệ." },
        { status: 400 }
      );
    }
    if (partySize < 1) {
      return NextResponse.json({ error: "Nhập số khách." }, { status: 400 });
    }
    if (Number.isNaN(startAt.getTime())) {
      return NextResponse.json({ error: "Chọn giờ đến." }, { status: 400 });
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

    const service = await ensureLongNuongService();

    const phoneNormalized = normalizePhone(guestPhone);
    const phoneLast4 = phoneShortId(phoneNormalized);
    const clash = await prisma.appCustomer.findFirst({
      where: {
        phoneNormalized,
        id: { not: customer.id },
        status: "ACTIVE",
      },
      select: { id: true },
    });
    if (clash) {
      return NextResponse.json(
        {
          error:
            "SĐT này đã gắn tài khoản khác. Đăng nhập đúng SĐT hoặc dùng số khác.",
        },
        { status: 409 }
      );
    }
    await prisma.appCustomer.update({
      where: { id: customer.id },
      data: {
        fullName: guestName.slice(0, 120),
        phone: guestPhone,
        phoneNormalized,
        phoneLast4,
        shortId: phoneLast4,
      },
    });

    let table: {
      id: string;
      code: string;
      name: string;
      status: string;
      sessions: { id: string }[];
    } | null = null;
    if (resourceId) {
      table = await prisma.appResource.findFirst({
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
    }

    const arriveLabel = startAt.toLocaleString("vi-VN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    const now = Date.now();
    const overlapsNow = startAt.getTime() <= now && endAt.getTime() > now;

    const booking = await prisma.$transaction(async (tx) => {
      if (table && overlapsNow) {
        await tx.appResource.update({
          where: { id: table.id },
          data: { status: "RESERVED" },
        });
      }
      return tx.appBooking.create({
        data: {
          bookingCode: bookingCode(),
          customerId: customer.id,
          customerNameSnapshot: guestName,
          phone: guestPhone,
          phoneNormalized,
          serviceId: service.id,
          resourceId: table?.id ?? null,
          startAt,
          endAt,
          partySize,
          status: table ? "CONFIRMED" : "PENDING",
          notes: table
            ? `Đặt bàn · đến ${arriveLabel}`
            : `Yêu cầu bàn · đến ${arriveLabel} · ${partySize} khách`,
          source: "CUSTOMER",
          createdByType: "CUSTOMER",
          createdById: customer.id,
        },
      });
    });

    const items = table
      ? [
          {
            id: `table-${table.code}`,
            nameVi: `${table.name} · ${arriveLabel}`,
            qty: 1,
            priceVnd: 0,
            note: `resourceId:${table.id}|bookingId:${booking.id}|code:${booking.bookingCode}`,
          },
        ]
      : [
          {
            id: "ln-request",
            nameVi: `Yêu cầu bàn · ${arriveLabel} · ${partySize} khách`,
            qty: 1,
            priceVnd: 0,
            note: `bookingId:${booking.id}|code:${booking.bookingCode}|noQr:1`,
          },
        ];

    const ttlHours = Math.max(
      48,
      Math.ceil((endAt.getTime() - Date.now() + 6 * 60 * 60 * 1000) / 3600000)
    );
    const { cart, payload } = await createServiceCart({
      customerId: customer.id,
      zoneCode: "LONG_NUONG",
      zoneName: "Lòng Nướng Chí Phèo",
      items,
      ttlHours,
    });

    return NextResponse.json({
      ok: true,
      booking: {
        id: booking.id,
        bookingCode: booking.bookingCode,
        startAt: booking.startAt,
        endAt: booking.endAt,
        tableName: table?.name ?? null,
        tableCode: table?.code ?? null,
        partySize,
      },
      cart: {
        token: cart.token,
        status: cart.status || CART_STATUS.PENDING,
        totalVnd: cart.totalVnd,
        payload:
          table && cart.status === CART_STATUS.OPEN ? payload : null,
      },
      payload: table ? serviceCartQrPayload(cart.token) : null,
      customer: {
        fullName: guestName,
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
