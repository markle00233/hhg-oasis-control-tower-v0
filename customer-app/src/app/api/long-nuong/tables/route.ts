import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { TableVisualStatus } from "@/lib/long-nuong";
import { localDayKey, tableShortLabel } from "@/lib/long-nuong";

export const dynamic = "force-dynamic";
export const preferredRegion = "sin1";

function visualStatusNow(opts: {
  resourceStatus: string;
  hasActiveSession: boolean;
  bookingOverlapsNow: boolean;
}): TableVisualStatus {
  if (
    opts.hasActiveSession ||
    opts.resourceStatus === "OCCUPIED" ||
    opts.resourceStatus === "BLOCKED" ||
    opts.resourceStatus === "CLEANING"
  ) {
    return "occupied";
  }
  if (opts.resourceStatus === "RESERVED" || opts.bookingOverlapsNow) {
    return "held";
  }
  return "available";
}

/** Live table board + bookings for a day (để kiểm tra khung giờ). */
export async function GET(req: NextRequest) {
  try {
    const dayKey =
      req.nextUrl.searchParams.get("date") || localDayKey(new Date());
    const [y, m, d] = dayKey.split("-").map(Number);
    const dayStart = new Date(y, m - 1, d, 0, 0, 0, 0);
    const dayEnd = new Date(y, m - 1, d + 1, 0, 0, 0, 0);
    const now = new Date();

    const service = await prisma.appService.findUnique({
      where: { serviceCode: "LONG_NUONG" },
    });
    if (!service) {
      return NextResponse.json(
        { error: "Lòng Nướng chưa cấu hình." },
        { status: 404 }
      );
    }

    const tables = await prisma.appResource.findMany({
      where: { serviceId: service.id, type: "TABLE", active: true },
      orderBy: { sortOrder: "asc" },
      take: 30,
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

    const payload = tables.map((t) => {
      const session = t.sessions[0] || null;
      const bookingOverlapsNow = t.bookings.some(
        (b) => b.startAt <= now && b.endAt > now
      );
      const status = visualStatusNow({
        resourceStatus: t.status,
        hasActiveSession: !!session,
        bookingOverlapsNow,
      });

      return {
        id: t.id,
        code: t.code,
        name: t.name,
        shortLabel: tableShortLabel(t.name, t.code),
        status,
        resourceStatus: t.status,
        session: session
          ? {
              id: session.id,
              startAt: session.startAt.toISOString(),
            }
          : null,
        bookings: t.bookings.map((b) => ({
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
      tables: payload,
      count: payload.length,
    });
  } catch (e) {
    console.error("[long-nuong/tables]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}
