import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ENDING_SOON_MIN, type CourtVisualStatus } from "@/lib/pickleball";

export const dynamic = "force-dynamic";
export const preferredRegion = "sin1";

function visualStatus(opts: {
  resourceStatus: string;
  sessionEndAt: Date | null;
  now: Date;
}): CourtVisualStatus {
  const occupied =
    opts.resourceStatus === "OCCUPIED" ||
    (opts.sessionEndAt && opts.sessionEndAt.getTime() > opts.now.getTime());

  if (!occupied && opts.resourceStatus !== "OCCUPIED") {
    // also treat CLEANING/BLOCKED as occupied-ish for booking UI? show occupied red for BLOCKED
    if (opts.resourceStatus === "BLOCKED" || opts.resourceStatus === "CLEANING") {
      return "occupied";
    }
    return "available";
  }

  if (opts.sessionEndAt) {
    const mins =
      (opts.sessionEndAt.getTime() - opts.now.getTime()) / (60 * 1000);
    if (mins > 0 && mins <= ENDING_SOON_MIN) return "ending_soon";
  }
  return "occupied";
}

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
        },
        bookings: {
          where: {
            startAt: { lt: dayEnd },
            endAt: { gt: dayStart },
            status: {
              in: [
                "PENDING",
                "CONFIRMED",
                "ARRIVED",
                "CHECKED_IN",
                "IN_SERVICE",
              ],
            },
          },
          orderBy: { startAt: "asc" },
        },
      },
    });

    const payload = courts.map((c) => {
      const session = c.sessions[0] || null;
      // Estimate session end from linked booking end, else +90min from start
      let sessionEndAt: Date | null = null;
      if (session) {
        const linked = c.bookings.find((b) => b.id === session.bookingId);
        sessionEndAt =
          linked?.endAt ||
          session.endAt ||
          new Date(session.startAt.getTime() + 90 * 60 * 1000);
      }
      const status = visualStatus({
        resourceStatus: c.status,
        sessionEndAt,
        now,
      });

      return {
        id: c.id,
        code: c.code,
        name: c.name,
        shortLabel: c.name.replace(/^Sân\s*/i, "") || c.code.replace("COURT_", ""),
        status,
        resourceStatus: c.status,
        session: session
          ? {
              id: session.id,
              startAt: session.startAt.toISOString(),
              endAt: sessionEndAt?.toISOString() || null,
            }
          : null,
        bookings: c.bookings.map((b) => ({
          id: b.id,
          startAt: b.startAt.toISOString(),
          endAt: b.endAt.toISOString(),
          status: b.status,
        })),
      };
    });

    return NextResponse.json({
      ok: true,
      date: dayKey,
      courts: payload,
    });
  } catch (e) {
    console.error("[pickleball/courts]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}
