import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionCustomer } from "@/lib/session";
import {
  LIVE_BOOKING_STATUSES,
  courtLiveState,
  withSessionBooking,
} from "@/lib/pickleball";

const ON_COURT = new Set(["ARRIVED", "CHECKED_IN", "IN_SERVICE"]);

/** Booking the signed-in customer should open from the court board. */
async function currentCustomerBooking(
  customerId: string,
  serviceId: string,
  now: Date
) {
  const rows = await prisma.appBooking.findMany({
    where: {
      customerId,
      serviceId,
      status: { in: [...LIVE_BOOKING_STATUSES] },
      endAt: { gt: new Date(now.getTime() - 2 * 60 * 60 * 1000) },
    },
    orderBy: { startAt: "asc" },
    take: 12,
    select: { id: true, startAt: true, endAt: true, status: true },
  });
  const nowMs = now.getTime();
  const live = rows.find(
    (b) =>
      ON_COURT.has(b.status) ||
      (b.startAt.getTime() <= nowMs && b.endAt.getTime() > nowMs)
  );
  if (live) return live;
  return rows.find((b) => b.endAt.getTime() > nowMs) ?? null;
}

export const dynamic = "force-dynamic";
export const preferredRegion = "sin1";

/** Live court board + slot availability for a day. */
export async function GET(req: NextRequest) {
  try {
    const dayKey =
      req.nextUrl.searchParams.get("date") ||
      new Date().toISOString().slice(0, 10);
    const [y, m, d] = dayKey.split("-").map(Number);
    const dayStart = new Date(y, m - 1, d, 0, 0, 0, 0);
    const dayEnd = new Date(y, m - 1, d + 1, 0, 0, 0, 0);
    const now = new Date();

    const service = await prisma.appService.findUnique({
      where: { serviceCode: "PICKLEBALL" },
    });
    if (!service) {
      return NextResponse.json(
        { error: "Pickleball chưa cấu hình." },
        { status: 404 }
      );
    }

    const courts = await prisma.appResource.findMany({
      where: { serviceId: service.id, type: "COURT", active: true },
      orderBy: { sortOrder: "asc" },
      take: 6,
      include: {
        sessions: {
          where: { status: "OCCUPIED" },
          orderBy: { startAt: "desc" },
          take: 1,
          include: {
            booking: {
              select: { id: true, startAt: true, endAt: true, status: true },
            },
          },
        },
        bookings: {
          where: {
            startAt: { lt: dayEnd },
            endAt: { gt: dayStart },
            status: { in: [...LIVE_BOOKING_STATUSES] },
          },
          orderBy: { startAt: "asc" },
        },
      },
    });

    const payload = courts.map((c) => {
      const session = c.sessions[0] || null;
      const bookings = withSessionBooking(
        c.bookings.map((b) => ({
          id: b.id,
          startAt: b.startAt,
          endAt: b.endAt,
          status: b.status,
        })),
        session?.booking
      );
      const live = courtLiveState({
        resourceStatus: c.status,
        now,
        session: session
          ? {
              startAt: session.startAt,
              endAt: session.endAt,
              bookingId: session.bookingId,
            }
          : null,
        bookings,
      });

      return {
        id: c.id,
        code: c.code,
        name: c.name,
        shortLabel: c.name.replace(/^Sân\s*/i, "") || c.code.replace("COURT_", ""),
        status: live.status,
        resourceStatus: c.status,
        session: session
          ? {
              id: session.id,
              startAt: session.startAt.toISOString(),
              endAt: session.endAt?.toISOString() || null,
            }
          : null,
        bookings: bookings.map((b) => ({
          id: b.id,
          startAt: b.startAt.toISOString(),
          endAt: b.endAt.toISOString(),
          status: b.status,
        })),
      };
    });

    const customer = await getSessionCustomer();
    const mine = customer
      ? await currentCustomerBooking(customer.id, service.id, now)
      : null;

    return NextResponse.json({
      ok: true,
      date: dayKey,
      courts: payload,
      myBooking: mine ? { id: mine.id } : null,
    });
  } catch (e) {
    console.error("[pickleball/courts]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}
