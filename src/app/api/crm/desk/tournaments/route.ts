import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requireTournamentDesk,
  tournamentCheckInUrl,
  tournamentDbError,
} from "@/lib/tournament-desk";
import { closeMissedAthletes, syncTournamentStatuses } from "@/lib/tournament-roster";
import {
  DEFAULT_VOUCHER_DISCOUNT_VND,
  newCheckInToken,
  parseCourt,
  parseEventTime,
  scheduleFields,
  tournamentDayLabel,
  tournamentStatusAt,
  vnCivilDayKey,
  vnDayBounds,
} from "@/lib/tournament";

export const dynamic = "force-dynamic";

function money(raw: unknown, fallback: number) {
  const n = Math.round(Number(raw));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(5_000_000, Math.max(0, n));
}

function voucherAmount(body: Record<string, unknown>) {
  return money(body.discountVnd, DEFAULT_VOUCHER_DISCOUNT_VND);
}

export async function GET(req: NextRequest) {
  const gate = await requireTournamentDesk();
  if ("error" in gate) return gate.error;
  if (new URL(req.url).searchParams.get("summary") === "1") {
    try {
      const pendingCount = await prisma.appTournamentCheckIn.count({
        where: { attendance: "PENDING" },
      });
      return NextResponse.json({ ok: true, pendingCount });
    } catch (err) {
      return tournamentDbError(err, "Không đếm được đăng ký chờ duyệt.");
    }
  }
  try {
    await closeMissedAthletes();
    await syncTournamentStatuses();
    const [rows, voucherCounts, pendingCounts, waiting] = await Promise.all([
      prisma.appTournament.findMany({
        orderBy: { startsAt: "desc" },
        select: {
          id: true,
          name: true,
          court: true,
          eventTime: true,
          summary: true,
          startsAt: true,
          endsAt: true,
          originalStartsAt: true,
          originalEventTime: true,
          discountVnd: true,
          _count: { select: { checkIns: true } },
        },
      }),
      prisma.appTournamentVoucher.groupBy({
        by: ["tournamentId", "status"],
        _count: { _all: true },
      }),
      prisma.appTournamentCheckIn.groupBy({
        by: ["tournamentId"],
        where: { attendance: "PENDING" },
        _count: { _all: true },
      }),
      prisma.appTournamentCheckIn.findMany({
        where: { attendance: "PENDING" },
        orderBy: { createdAt: "desc" },
        take: 40,
        select: {
          id: true,
          tournamentId: true,
          createdAt: true,
          customer: { select: { fullName: true, phone: true } },
          tournament: { select: { name: true, startsAt: true } },
        },
      }),
    ]);
    const pendingByTournament = new Map(
      pendingCounts.map((row) => [row.tournamentId, row._count._all])
    );
    const vouchers = new Map<string, { issued: number; used: number }>();
    for (const row of voucherCounts) {
      const slot = vouchers.get(row.tournamentId) || { issued: 0, used: 0 };
      if (row.status === "ISSUED") slot.issued = row._count._all;
      if (row.status === "REDEEMED") slot.used = row._count._all;
      vouchers.set(row.tournamentId, slot);
    }
    return NextResponse.json({
      ok: true,
      pending: waiting.map((row) => ({
        id: row.id,
        tournamentId: row.tournamentId,
        tournamentName: row.tournament.name,
        dayLabel: tournamentDayLabel(row.tournament.startsAt),
        fullName: row.customer.fullName || "Khách",
        phone: row.customer.phone,
        createdAt: row.createdAt.toISOString(),
      })),
      tournaments: rows.map((row) => {
        const count = vouchers.get(row.id);
        return {
          id: row.id,
          name: row.name,
          court: row.court,
          eventTime: row.eventTime,
          summary: row.summary,
          dayLabel: tournamentDayLabel(row.startsAt),
          day: vnCivilDayKey(row.startsAt),
          startsAt: row.startsAt.toISOString(),
          endsAt: row.endsAt.toISOString(),
          status: tournamentStatusAt(row.startsAt, row.endsAt, row.eventTime),
          ...scheduleFields({
            originalStartsAt: row.originalStartsAt,
            originalEventTime: row.originalEventTime,
            startsAt: row.startsAt,
            eventTime: row.eventTime,
          }),
          discountVnd: row.discountVnd,
          checkInCount: row._count.checkIns,
          pendingCount: pendingByTournament.get(row.id) || 0,
          voucherUsedCount: count?.used || 0,
          voucherOpenCount: count?.issued || 0,
        };
      }),
    });
  } catch (err) {
    return tournamentDbError(err, "Không tải được danh sách giải.");
  }
}

export async function POST(req: NextRequest) {
  const gate = await requireTournamentDesk();
  if ("error" in gate) return gate.error;
  const body = await req.json().catch(() => ({}));
  const name = String(body.name || "").trim().slice(0, 120);
  const court = parseCourt(body.court);
  const eventTime = parseEventTime(body.eventTime);
  const summary = String(body.summary || "").trim().slice(0, 500);
  const day = String(body.day || "").trim();
  if (eventTime === undefined) {
    return NextResponse.json({ error: "Giờ không hợp lệ." }, { status: 400 });
  }
  if (!name) {
    return NextResponse.json({ error: "Nhập tên giải." }, { status: 400 });
  }
  let window: { startsAt: Date; endsAt: Date };
  try {
    window = vnDayBounds(day);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Ngày giải không hợp lệ." },
      { status: 400 }
    );
  }
  try {
    const row = await prisma.appTournament.create({
      data: {
        name,
        court,
        eventTime,
        summary: summary || null,
        startsAt: window.startsAt,
        endsAt: window.endsAt,
        originalStartsAt: window.startsAt,
        originalEventTime: eventTime,
        status: tournamentStatusAt(window.startsAt, window.endsAt, eventTime),
        checkInToken: newCheckInToken(),
        discountVnd: voucherAmount(body),
      },
    });
    return NextResponse.json({
      ok: true,
      tournament: {
        id: row.id,
        checkInUrl: tournamentCheckInUrl(row.checkInToken),
      },
    });
  } catch (err) {
    return tournamentDbError(err, "Không tạo được giải.");
  }
}
