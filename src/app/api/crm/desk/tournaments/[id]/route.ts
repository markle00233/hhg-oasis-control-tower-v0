import { NextRequest, NextResponse } from "next/server";
import { parseBillPhoto } from "@/lib/bill-photo";
import { prisma } from "@/lib/prisma";
import {
  requireTournamentDesk,
  tournamentCheckInUrl,
  tournamentDbError,
} from "@/lib/tournament-desk";
import { closeMissedAthletes, syncTournamentStatuses } from "@/lib/tournament-roster";
import {
  ASSET_KIND,
  ZONE_LABEL,
  assertGalleryUrl,
  attendanceAfterWindow,
  parseCourt,
  parseEventTime,
  parseVoucherZone,
  rescheduleNote,
  tournamentDayLabel,
  tournamentStatusAt,
  vnCivilDayKey,
  vnDayBounds,
} from "@/lib/tournament";

export const dynamic = "force-dynamic";

async function loadTournament(id: string) {
  return prisma.appTournament.findUnique({
    where: { id },
    include: {
      checkIns: {
        orderBy: { checkedInAt: "desc" },
        include: {
          customer: { select: { id: true, fullName: true, phone: true } },
        },
      },
      vouchers: true,
      assets: true,
    },
  });
}

function present(
  row: NonNullable<Awaited<ReturnType<typeof loadTournament>>>
) {
  const voucherByCustomer = new Map(row.vouchers.map((v) => [v.customerId, v]));
  const results = row.assets.find((a) => a.kind === ASSET_KIND.RESULTS_IMAGE);
  const gallery = row.assets.find((a) => a.kind === ASSET_KIND.GALLERY_LINK);
  return {
    id: row.id,
    name: row.name,
    court: row.court,
    eventTime: row.eventTime,
    summary: row.summary,
    status: tournamentStatusAt(row.startsAt, row.endsAt, row.eventTime),
    rescheduleNote: rescheduleNote({
      originalStartsAt: row.originalStartsAt,
      originalEventTime: row.originalEventTime,
      startsAt: row.startsAt,
      eventTime: row.eventTime,
    }),
    dayLabel: tournamentDayLabel(row.startsAt),
    day: vnCivilDayKey(row.startsAt),
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    discountVnd: row.discountVnd,
    checkInUrl: tournamentCheckInUrl(row.checkInToken),
    resultsImage: results?.url || null,
    galleryUrl: gallery?.url || null,
    athletes: row.checkIns.map((c) => {
      const voucher = voucherByCustomer.get(c.customerId);
      const zone = parseVoucherZone(voucher?.redeemedZone || "");
      const zoneLabel = zone ? ZONE_LABEL[zone] : null;
      return {
        id: c.id,
        customerId: c.customerId,
        fullName: c.customer.fullName || "Vận động viên",
        phone: c.customer.phone,
        source: c.source,
        attendance: attendanceAfterWindow(c.attendance, row.endsAt),
        checkedInAt: c.checkedInAt ? c.checkedInAt.toISOString() : null,
        createdAt: c.createdAt.toISOString(),
        checkedByName: c.checkedByName,
        voucherStatus: voucher?.status || null,
        redeemedZone: zone || null,
        zoneLabel,
        redeemedVnd: voucher?.redeemedVnd ?? null,
      };
    }),
  };
}

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const gate = await requireTournamentDesk();
  if ("error" in gate) return gate.error;
  const { id } = await ctx.params;
  try {
    await closeMissedAthletes();
    await syncTournamentStatuses();
    const row = await loadTournament(id);
    if (!row) {
      return NextResponse.json({ error: "Không thấy giải." }, { status: 404 });
    }
    return NextResponse.json({ ok: true, tournament: present(row) });
  } catch (err) {
    return tournamentDbError(err, "Không tải được giải.");
  }
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const gate = await requireTournamentDesk();
  if ("error" in gate) return gate.error;
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  try {
    const existing = await prisma.appTournament.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Không thấy giải." }, { status: 404 });
    }

    const data: {
      court?: string | null;
      eventTime?: string | null;
      startsAt?: Date;
      endsAt?: Date;
    } = {};

    if (body.court !== undefined) {
      data.court = parseCourt(body.court);
    }
    if (body.eventTime !== undefined) {
      const eventTime = parseEventTime(body.eventTime);
      if (eventTime === undefined) {
        return NextResponse.json({ error: "Giờ không hợp lệ." }, { status: 400 });
      }
      data.eventTime = eventTime;
    }
    if (body.day !== undefined) {
      try {
        const window = vnDayBounds(String(body.day || "").trim());
        data.startsAt = window.startsAt;
        data.endsAt = window.endsAt;
      } catch (err) {
        return NextResponse.json(
          { error: err instanceof Error ? err.message : "Ngày giải không hợp lệ." },
          { status: 400 }
        );
      }
    }
    if (Object.keys(data).length) {
      await prisma.appTournament.update({ where: { id }, data });
    }

    if (body.galleryUrl !== undefined) {
      const raw = String(body.galleryUrl || "").trim();
      if (!raw) {
        await prisma.appTournamentAsset.deleteMany({
          where: { tournamentId: id, kind: ASSET_KIND.GALLERY_LINK },
        });
      } else {
        let url = "";
        try {
          url = assertGalleryUrl(raw);
        } catch (err) {
          return NextResponse.json(
            { error: err instanceof Error ? err.message : "Link ảnh không hợp lệ." },
            { status: 400 }
          );
        }
        await prisma.appTournamentAsset.upsert({
          where: {
            tournamentId_kind: { tournamentId: id, kind: ASSET_KIND.GALLERY_LINK },
          },
          create: { tournamentId: id, kind: ASSET_KIND.GALLERY_LINK, url },
          update: { url },
        });
      }
    }

    if (body.resultsImage !== undefined) {
      if (!body.resultsImage) {
        await prisma.appTournamentAsset.deleteMany({
          where: { tournamentId: id, kind: ASSET_KIND.RESULTS_IMAGE },
        });
      } else {
        const url = parseBillPhoto(body.resultsImage);
        if (!url) {
          return NextResponse.json(
            { error: "Ảnh bảng kết quả phải là JPEG, PNG hoặc WebP, đã thu nhỏ." },
            { status: 400 }
          );
        }
        await prisma.appTournamentAsset.upsert({
          where: {
            tournamentId_kind: {
              tournamentId: id,
              kind: ASSET_KIND.RESULTS_IMAGE,
            },
          },
          create: { tournamentId: id, kind: ASSET_KIND.RESULTS_IMAGE, url },
          update: { url },
        });
      }
    }

    await syncTournamentStatuses();
    const row = await loadTournament(id);
    if (!row) {
      return NextResponse.json({ error: "Không thấy giải." }, { status: 404 });
    }
    return NextResponse.json({ ok: true, tournament: present(row) });
  } catch (err) {
    return tournamentDbError(err, "Không lưu được giải.");
  }
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const gate = await requireTournamentDesk();
  if ("error" in gate) return gate.error;
  const { id } = await ctx.params;
  try {
    const row = await prisma.appTournament.findUnique({
      where: { id },
      include: { _count: { select: { checkIns: true } } },
    });
    if (!row) {
      return NextResponse.json({ error: "Không thấy giải." }, { status: 404 });
    }
    if (row._count.checkIns > 0) {
      return NextResponse.json(
        { error: "Giải đã có vận động viên, không xoá." },
        { status: 400 }
      );
    }
    await prisma.appTournament.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return tournamentDbError(err, "Không xoá được giải.");
  }
}
