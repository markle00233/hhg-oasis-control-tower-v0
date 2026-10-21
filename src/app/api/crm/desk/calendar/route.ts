import { NextRequest, NextResponse } from "next/server";
import { requireDeskZone } from "@/lib/auth";
import { deskZoneAliases, getDeskZone } from "@/lib/desk-zones";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function pad(n: number) {
  return String(n).padStart(2, "0");
}

/** YYYY-MM-DD theo giờ VN. */
function vnYmd(d: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function vnMonthParts(d = new Date()) {
  const [y, m] = vnYmd(d).split("-").map(Number);
  return { year: y!, month: m! };
}

/** Biên ngày VN → UTC Date. */
function vnDayBounds(ymd: string) {
  const start = new Date(`${ymd}T00:00:00+07:00`);
  const end = new Date(`${ymd}T24:00:00+07:00`);
  return { start, end };
}

function vnMonthBounds(year: number, month: number) {
  const startYmd = `${year}-${pad(month)}-01`;
  const next =
    month === 12
      ? { year: year + 1, month: 1 }
      : { year, month: month + 1 };
  const endYmd = `${next.year}-${pad(next.month)}-01`;
  return {
    start: new Date(`${startYmd}T00:00:00+07:00`),
    end: new Date(`${endYmd}T00:00:00+07:00`),
    startYmd,
  };
}

function daysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}

/**
 * Lịch quầy: khách vào (check-in SERVICE_USE) + khách đặt (booking).
 * GET ?zone=&year=&month=  → tổng theo ngày trong tháng
 * GET ?zone=&date=YYYY-MM-DD → chi tiết 1 ngày
 */
export async function GET(req: NextRequest) {
  const zone = String(req.nextUrl.searchParams.get("zone") || "")
    .trim()
    .toUpperCase();
  if (!zone) {
    return NextResponse.json({ error: "Thiếu zone" }, { status: 400 });
  }
  const gate = await requireDeskZone(zone);
  if ("error" in gate) return gate.error;

  const meta = getDeskZone(zone);
  if (!meta) {
    return NextResponse.json({ error: "Khu không hợp lệ" }, { status: 400 });
  }

  const aliases = deskZoneAliases(zone);
  const services = await prisma.appService.findMany({
    where: { serviceCode: { in: aliases } },
    select: { id: true, serviceCode: true, serviceName: true },
  });
  const serviceIds = services.map((s) => s.id);
  if (!serviceIds.length) {
    return NextResponse.json({
      ok: true,
      zone,
      zoneName: meta.name,
      days: [],
      visits: [],
      bookings: [],
    });
  }

  const dateParam = String(req.nextUrl.searchParams.get("date") || "").trim();

  // ── Chi tiết 1 ngày ──────────────────────────────────────
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
    const { start, end } = vnDayBounds(dateParam);

    const [events, bookings] = await Promise.all([
      prisma.appServiceEvent.findMany({
        where: {
          serviceId: { in: serviceIds },
          eventType: "SERVICE_USE",
          createdAt: { gte: start, lt: end },
        },
        orderBy: { createdAt: "asc" },
        take: 300,
        include: {
          customer: {
            select: {
              id: true,
              fullName: true,
              phone: true,
              shortId: true,
              phoneLast4: true,
              customerCode: true,
            },
          },
          service: { select: { serviceCode: true, serviceName: true } },
        },
      }),
      prisma.appBooking.findMany({
        where: {
          serviceId: { in: serviceIds },
          startAt: { gte: start, lt: end },
          status: { not: "CANCELLED" },
        },
        orderBy: { startAt: "asc" },
        take: 300,
        include: {
          customer: {
            select: {
              id: true,
              fullName: true,
              phone: true,
              shortId: true,
              phoneLast4: true,
            },
          },
          resource: { select: { code: true, name: true } },
        },
      }),
    ]);

    return NextResponse.json({
      ok: true,
      zone,
      zoneName: meta.name,
      date: dateParam,
      visits: events.map((e) => ({
        id: e.id,
        at: e.createdAt,
        operationalStatus: e.operationalStatus,
        serviceCode: e.service.serviceCode,
        serviceName: e.service.serviceName,
        customerName: e.customer.fullName || e.customer.customerCode || "Khách",
        phone: e.customer.phone,
        shortId: e.customer.phoneLast4 || e.customer.shortId,
        customerId: e.customer.id,
      })),
      bookings: bookings.map((b) => ({
        id: b.id,
        bookingCode: b.bookingCode,
        startAt: b.startAt,
        endAt: b.endAt,
        status: b.status,
        partySize: b.partySize,
        source: b.source,
        resourceName: b.resource?.name || b.resource?.code || null,
        customerName:
          b.customer?.fullName || b.customerNameSnapshot || "Khách",
        phone: b.customer?.phone || b.phone,
        shortId: b.customer?.phoneLast4 || b.customer?.shortId || null,
        customerId: b.customerId,
      })),
      visitCount: events.length,
      bookingCount: bookings.length,
    });
  }

  // ── Tổng hợp tháng ───────────────────────────────────────
  const nowVn = vnMonthParts();
  const year = Math.min(
    2100,
    Math.max(
      2020,
      Number(req.nextUrl.searchParams.get("year") || nowVn.year) || nowVn.year
    )
  );
  const month = Math.min(
    12,
    Math.max(
      1,
      Number(req.nextUrl.searchParams.get("month") || nowVn.month) ||
        nowVn.month
    )
  );

  const { start, end } = vnMonthBounds(year, month);
  const nDays = daysInMonth(year, month);

  const [events, bookings] = await Promise.all([
    prisma.appServiceEvent.findMany({
      where: {
        serviceId: { in: serviceIds },
        eventType: "SERVICE_USE",
        createdAt: { gte: start, lt: end },
      },
      select: { createdAt: true },
      take: 5000,
    }),
    prisma.appBooking.findMany({
      where: {
        serviceId: { in: serviceIds },
        startAt: { gte: start, lt: end },
        status: { not: "CANCELLED" },
      },
      select: { startAt: true },
      take: 5000,
    }),
  ]);

  const visitMap = new Map<string, number>();
  const bookMap = new Map<string, number>();
  for (const e of events) {
    const key = vnYmd(e.createdAt);
    visitMap.set(key, (visitMap.get(key) || 0) + 1);
  }
  for (const b of bookings) {
    const key = vnYmd(b.startAt);
    bookMap.set(key, (bookMap.get(key) || 0) + 1);
  }

  const days = [];
  for (let d = 1; d <= nDays; d++) {
    const date = `${year}-${pad(month)}-${pad(d)}`;
    days.push({
      date,
      day: d,
      visits: visitMap.get(date) || 0,
      bookings: bookMap.get(date) || 0,
    });
  }

  const today = vnYmd(new Date());

  return NextResponse.json({
    ok: true,
    zone,
    zoneName: meta.name,
    year,
    month,
    today,
    days,
    totals: {
      visits: events.length,
      bookings: bookings.length,
    },
  });
}
