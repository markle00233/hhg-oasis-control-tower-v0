import { NextRequest, NextResponse } from "next/server";
import { requireDeskZone } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import { normalizePhone } from "@/lib/phone";

export const dynamic = "force-dynamic";

function bookingCode() {
  return `BK-${Date.now().toString(36).toUpperCase()}-${Math.random()
    .toString(36)
    .slice(2, 6)
    .toUpperCase()}`;
}

export async function GET(req: NextRequest) {
  const zone = String(req.nextUrl.searchParams.get("zone") || "")
    .trim()
    .toUpperCase();
  const gate = await requireDeskZone(zone);
  if ("error" in gate) return gate.error;

  const service = await prisma.appService.findUnique({
    where: { serviceCode: zone },
  });
  if (!service) {
    return NextResponse.json({ error: "Zone not found" }, { status: 404 });
  }

  const dateParam = String(req.nextUrl.searchParams.get("date") || "").trim();
  let dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
    const [y, m, d] = dateParam.split("-").map(Number);
    dayStart = new Date(y, m - 1, d, 0, 0, 0, 0);
  }
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);

  const bookings = await prisma.appBooking.findMany({
    where: {
      serviceId: service.id,
      startAt: { gte: dayStart, lt: dayEnd },
      status: { not: "CANCELLED" },
    },
    orderBy: { startAt: "asc" },
    take: 200,
    include: {
      resource: { select: { id: true, code: true, name: true } },
      customer: {
        select: { id: true, fullName: true, phone: true, shortId: true },
      },
    },
  });

  return NextResponse.json({
    ok: true,
    zone,
    date: localDayKeyFrom(dayStart),
    bookings: bookings.map((b) => ({
      id: b.id,
      bookingCode: b.bookingCode,
      startAt: b.startAt,
      endAt: b.endAt,
      partySize: b.partySize,
      status: b.status,
      source: b.source,
      notes: b.notes,
      serviceUseId: b.serviceUseId,
      resource: b.resource,
      customerName: b.customer?.fullName || b.customerNameSnapshot,
      phone: b.customer?.phone || b.phone,
      customerId: b.customerId,
    })),
  });
}

function localDayKeyFrom(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Staff (or Oasis-Sport ingest via ADMIN) create booking. */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const zone = String(body.zone || "").trim().toUpperCase();
  const source = String(body.source || "STAFF").toUpperCase();

  // Oasis-Sport can post with zone + source OASIS_SPORT using admin or zone staff
  const gate = await requireDeskZone(zone);
  if ("error" in gate) return gate.error;

  const service = await prisma.appService.findUnique({
    where: { serviceCode: zone },
  });
  if (!service) {
    return NextResponse.json({ error: "Zone not found" }, { status: 404 });
  }

  const startAt = new Date(body.startAt);
  const endAt = new Date(body.endAt);
  if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime()) || endAt <= startAt) {
    return NextResponse.json({ error: "Invalid startAt/endAt" }, { status: 400 });
  }

  const resourceId = String(body.resourceId || "").trim() || null;
  if (resourceId) {
    const resource = await prisma.appResource.findUnique({ where: { id: resourceId } });
    if (!resource || resource.serviceId !== service.id) {
      return NextResponse.json({ error: "Invalid resource" }, { status: 400 });
    }
    // Conflict: overlapping confirmed bookings on same resource
    const conflict = await prisma.appBooking.findFirst({
      where: {
        resourceId,
        status: { in: ["PENDING", "CONFIRMED", "ARRIVED", "CHECKED_IN", "IN_SERVICE"] },
        startAt: { lt: endAt },
        endAt: { gt: startAt },
      },
    });
    if (conflict) {
      return NextResponse.json(
        { error: "Khung giờ trùng booking khác trên resource này.", conflictId: conflict.id },
        { status: 409 }
      );
    }
  }

  const phoneRaw = String(body.phone || "").trim();
  const phoneNormalized = phoneRaw ? normalizePhone(phoneRaw) : null;
  let customerId = String(body.customerId || "").trim() || null;
  if (!customerId && phoneNormalized) {
    const c = await prisma.appCustomer.findUnique({
      where: { phoneNormalized },
    });
    customerId = c?.id || null;
  }

  const booking = await prisma.appBooking.create({
    data: {
      bookingCode: bookingCode(),
      customerId,
      customerNameSnapshot: String(body.customerName || "").trim() || null,
      phone: phoneRaw || null,
      phoneNormalized,
      serviceId: service.id,
      resourceId,
      startAt,
      endAt,
      partySize: Math.min(Math.max(Number(body.partySize) || 1, 1), 50),
      status: "CONFIRMED",
      notes: String(body.notes || "").trim().slice(0, 500) || null,
      source: ["STAFF", "OASIS_SPORT", "CUSTOMER", "ADMIN"].includes(source)
        ? source
        : "STAFF",
      createdByType: "STAFF",
      createdById: gate.user.id,
    },
  });

  await writeAudit({
    actorType: "STAFF",
    actorId: gate.user.id,
    action: "BOOKING_CREATE",
    entityType: "AppBooking",
    entityId: booking.id,
    zoneCode: zone,
    payload: { source: booking.source, resourceId },
  });

  return NextResponse.json({ ok: true, booking });
}
