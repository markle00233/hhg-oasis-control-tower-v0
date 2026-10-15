import { NextRequest, NextResponse } from "next/server";
import { requireDeskZone, requireAuth, isSystemAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { normalizePhone } from "@/lib/phone";
import { writeAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

/**
 * Ingest booking from Oasis-Sport (or Sheets export).
 * Auth: SYSTEM_ADMIN or PICKLEBALL / OLYMPIC_POOL desk staff.
 *
 * Body example:
 * { zone:"PICKLEBALL", courtCode:"COURT_03", customerName, phone, startAt, endAt, partySize, payment? }
 */
export async function POST(req: NextRequest) {
  const userGate = await requireAuth();
  if ("error" in userGate) return userGate.error;
  const user = userGate.user;

  const body = await req.json().catch(() => ({}));
  const zone = String(body.zone || "PICKLEBALL").trim().toUpperCase();

  if (!isSystemAdmin(user)) {
    const zoneGate = await requireDeskZone(zone);
    if ("error" in zoneGate) return zoneGate.error;
  }

  const service = await prisma.appService.findUnique({
    where: { serviceCode: zone },
  });
  if (!service) {
    return NextResponse.json({ error: "Unknown zone" }, { status: 400 });
  }

  const startAt = new Date(body.startAt);
  const endAt = new Date(body.endAt);
  if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) {
    return NextResponse.json({ error: "Invalid times" }, { status: 400 });
  }

  let resourceId: string | null = null;
  const courtCode = String(body.courtCode || body.resourceCode || "").trim().toUpperCase();
  if (courtCode) {
    const resource = await prisma.appResource.findFirst({
      where: { serviceId: service.id, code: courtCode, active: true },
    });
    resourceId = resource?.id || null;
  }

  const phoneRaw = String(body.phone || "").trim();
  const phoneNormalized = phoneRaw ? normalizePhone(phoneRaw) : null;
  let customerId: string | null = null;
  if (phoneNormalized) {
    const c = await prisma.appCustomer.findUnique({ where: { phoneNormalized } });
    customerId = c?.id || null;
  }

  const booking = await prisma.appBooking.create({
    data: {
      bookingCode: `OS-${Date.now().toString(36).toUpperCase()}`,
      customerId,
      customerNameSnapshot: String(body.customerName || "").trim() || null,
      phone: phoneRaw || null,
      phoneNormalized,
      serviceId: service.id,
      resourceId,
      startAt,
      endAt,
      partySize: Math.min(Math.max(Number(body.partySize) || 1, 1), 20),
      status: "CONFIRMED",
      notes: String(body.notes || body.payment || "").slice(0, 500) || null,
      source: "OASIS_SPORT",
      createdByType: "STAFF",
      createdById: user.id,
    },
  });

  await writeAudit({
    actorType: "STAFF",
    actorId: user.id,
    action: "OASIS_SPORT_INGEST",
    entityType: "AppBooking",
    entityId: booking.id,
    zoneCode: zone,
  });

  return NextResponse.json({ ok: true, booking });
}
