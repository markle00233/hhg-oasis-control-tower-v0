import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { requireDeskZone } from "@/lib/auth";
import { hashPassword } from "@/lib/password";
import { normalizePhone, phoneShortId } from "@/lib/phone";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

function generateCustomerCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(6);
  let body = "";
  for (let i = 0; i < 6; i++) body += alphabet[bytes[i]! % alphabet.length];
  return `CUS-${body}`;
}

/** Resolve / tạo khách walk-in từ form Bắt đầu (tên + SĐT; trống → Khách lẻ). */
async function resolveWalkInGuest(opts: {
  fullNameRaw: string;
  phoneRaw: string;
}) {
  const fullName = opts.fullNameRaw.trim() || "Khách lẻ";
  const phoneDigits = normalizePhone(opts.phoneRaw);
  const hasPhone = phoneDigits.length >= 9 && phoneDigits.length <= 11;
  const phoneNormalized = hasPhone
    ? phoneDigits
    : `w${Date.now().toString().slice(-10)}`;
  const phoneDisplay = hasPhone
    ? phoneDigits.startsWith("0")
      ? phoneDigits
      : `0${phoneDigits}`
    : null;
  const shortId = phoneShortId(phoneNormalized);

  const existing = hasPhone
    ? await prisma.appCustomer.findFirst({ where: { phoneNormalized } })
    : null;

  if (existing) {
    return prisma.appCustomer.update({
      where: { id: existing.id },
      data: {
        fullName: opts.fullNameRaw.trim() ? fullName : existing.fullName || fullName,
        phone: phoneDisplay || existing.phone,
        phoneLast4: shortId,
        shortId,
        status: "ACTIVE",
      },
    });
  }

  const passwordHash = await hashPassword(
    `desk_${randomBytes(12).toString("base64url")}`
  );
  for (let i = 0; i < 6; i++) {
    const customerCode = generateCustomerCode();
    try {
      return await prisma.appCustomer.create({
        data: {
          customerCode,
          username: customerCode,
          passwordHash,
          status: "ACTIVE",
          fullName,
          phone: phoneDisplay,
          phoneNormalized,
          phoneLast4: shortId,
          shortId,
          segment: "WALK_IN",
          identityToken: `oq_${randomBytes(18).toString("base64url")}`,
          adminConfirmedAt: new Date(),
          adminNote: "Walk-in từ Bắt đầu quầy",
        },
      });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === "P2002"
      ) {
        continue;
      }
      throw e;
    }
  }
  throw new Error("Không tạo được khách walk-in.");
}

/** List resources for a zone desk. */
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

  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);

  const resources = await prisma.appResource.findMany({
    where: { serviceId: service.id, active: true },
    orderBy: { sortOrder: "asc" },
    include: {
      bookings: {
        where: {
          startAt: { gte: dayStart },
          status: {
            in: ["PENDING", "CONFIRMED", "ARRIVED", "CHECKED_IN", "IN_SERVICE"],
          },
        },
        orderBy: { startAt: "asc" },
        take: 5,
        include: {
          customer: {
            select: { id: true, fullName: true, phone: true, shortId: true },
          },
        },
      },
      sessions: {
        where: { status: "OCCUPIED" },
        take: 1,
        orderBy: { startAt: "desc" },
        include: {
          customer: {
            select: { id: true, fullName: true, phone: true, shortId: true },
          },
        },
      },
    },
  });

  return NextResponse.json({
    ok: true,
    zone,
    resources: resources.map((r) => ({
      id: r.id,
      type: r.type,
      code: r.code,
      name: r.name,
      capacity: r.capacity,
      status: r.status,
      sortOrder: r.sortOrder,
      activeSession: r.sessions[0]
        ? {
            id: r.sessions[0].id,
            startAt: r.sessions[0].startAt,
            note: r.sessions[0].note,
            customer: r.sessions[0].customer,
          }
        : null,
      upcomingBookings: r.bookings.map((b) => ({
        id: b.id,
        bookingCode: b.bookingCode,
        startAt: b.startAt,
        endAt: b.endAt,
        partySize: b.partySize,
        status: b.status,
        customerName: b.customer?.fullName || b.customerNameSnapshot,
        phone: b.customer?.phone || b.phone,
      })),
    })),
  });
}

/** Update resource status / start-complete session. */
export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const zone = String(body.zone || "").trim().toUpperCase();
  const gate = await requireDeskZone(zone);
  if ("error" in gate) return gate.error;

  const resourceId = String(body.resourceId || "").trim();
  const action = String(body.action || "").trim().toUpperCase();
  if (!resourceId || !action) {
    return NextResponse.json({ error: "Missing resourceId/action" }, { status: 400 });
  }

  const resource = await prisma.appResource.findUnique({
    where: { id: resourceId },
    include: { service: true },
  });
  if (!resource || resource.service.serviceCode !== zone) {
    return NextResponse.json({ error: "Resource not in zone" }, { status: 404 });
  }

  if (action === "SET_STATUS") {
    const status = String(body.status || "").toUpperCase();
    const allowed = ["AVAILABLE", "RESERVED", "OCCUPIED", "CLEANING", "BLOCKED"];
    if (!allowed.includes(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }
    const updated = await prisma.appResource.update({
      where: { id: resourceId },
      data: { status },
    });
    await writeAudit({
      actorType: "STAFF",
      actorId: gate.user.id,
      action: "RESOURCE_SET_STATUS",
      entityType: "AppResource",
      entityId: resourceId,
      zoneCode: zone,
      payload: { status },
    });
    return NextResponse.json({ ok: true, resource: updated });
  }

  if (action === "START_SESSION") {
    let customerId = String(body.customerId || "").trim() || null;
    const guestName = String(body.guestName || body.fullName || "").trim();
    const guestPhone = String(body.guestPhone || body.phone || "").trim();
    const partySize = Math.min(
      Math.max(Number(body.partySize) || 1, 1),
      Math.max(resource.capacity || 20, 1)
    );
    let bookingId = String(body.bookingId || "").trim() || null;
    // Chỉ gắn booking đang trong cửa sổ ±30 phút — không lấy khung "Next" tương lai.
    if (bookingId) {
      const booking = await prisma.appBooking.findUnique({
        where: { id: bookingId },
        select: { id: true, startAt: true, endAt: true, customerId: true },
      });
      const now = Date.now();
      const near =
        booking &&
        booking.startAt.getTime() - 30 * 60 * 1000 <= now &&
        booking.endAt.getTime() + 15 * 60 * 1000 >= now;
      if (!near) bookingId = null;
      else if (!customerId && booking?.customerId) {
        customerId = booking.customerId;
      }
    }

    if (!customerId) {
      const guest = await resolveWalkInGuest({
        fullNameRaw: guestName,
        phoneRaw: guestPhone,
      });
      customerId = guest.id;
    }

    const startedAt = new Date();
    const displayName = guestName || "Khách lẻ";
    const noteParts = [
      displayName,
      guestPhone || null,
      `${partySize} người`,
    ].filter(Boolean);

    const session = await prisma.$transaction(async (tx) => {
      await tx.appResource.update({
        where: { id: resourceId },
        data: { status: "OCCUPIED" },
      });
      const s = await tx.appResourceSession.create({
        data: {
          resourceId,
          customerId,
          bookingId,
          status: "OCCUPIED",
          startAt: startedAt,
          note: noteParts.join(" · "),
        },
      });
      await tx.appServiceEvent.create({
        data: {
          customerId,
          serviceId: resource.serviceId,
          eventType: "SERVICE_USE",
          operationalStatus: "ACKNOWLEDGED",
          metadata: {
            source: "desk_start_session",
            resourceId,
            resourceName: resource.name,
            sessionId: s.id,
            guestName: displayName,
            guestPhone: guestPhone || null,
            partySize,
            startedAt: startedAt.toISOString(),
          },
        },
      });
      return s;
    });
    if (bookingId) {
      await prisma.appBooking.update({
        where: { id: bookingId },
        data: { status: "IN_SERVICE", partySize },
      });
    }
    await writeAudit({
      actorType: "STAFF",
      actorId: gate.user.id,
      action: "RESOURCE_START_SESSION",
      entityType: "AppResourceSession",
      entityId: session.id,
      zoneCode: zone,
      payload: {
        resourceId,
        customerId,
        bookingId,
        guestName: displayName,
        guestPhone: guestPhone || null,
        partySize,
      },
    });
    return NextResponse.json({
      ok: true,
      session,
      customerId,
      startedAt: startedAt.toISOString(),
    });
  }

  if (action === "COMPLETE_SESSION") {
    const sessionId = String(body.sessionId || "").trim();
    /** Pickleball: Kết thúc = reset sân trống ngay (AVAILABLE). Khác khu → CLEANING. */
    const nextStatus = zone === "PICKLEBALL" ? "AVAILABLE" : "CLEANING";

    const session = await prisma.$transaction(async (tx) => {
      let bookingId: string | null = null;
      if (sessionId) {
        const s = await tx.appResourceSession.update({
          where: { id: sessionId },
          data: { status: "COMPLETED", endAt: new Date() },
        });
        bookingId = s.bookingId;
      } else {
        const active = await tx.appResourceSession.findFirst({
          where: { resourceId, status: "OCCUPIED" },
          orderBy: { startAt: "desc" },
        });
        await tx.appResourceSession.updateMany({
          where: { resourceId, status: "OCCUPIED" },
          data: { status: "COMPLETED", endAt: new Date() },
        });
        bookingId = active?.bookingId || null;
      }
      await tx.appResource.update({
        where: { id: resourceId },
        data: { status: nextStatus },
      });
      if (bookingId) {
        await tx.appBooking.updateMany({
          where: {
            id: bookingId,
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
          data: { status: "COMPLETED" },
        });
      }
      return { bookingId };
    });

    if (session.bookingId && zone === "PICKLEBALL") {
      const openCarts = await prisma.appServiceCart.findMany({
        where: {
          zoneCode: "PICKLEBALL",
          status: { in: ["OPEN", "PENDING_APPROVAL"] },
        },
        take: 40,
        orderBy: { createdAt: "desc" },
      });
      const bookingTag = `bookingId:${session.bookingId}`;
      for (const c of openCarts) {
        const items = Array.isArray(c.items) ? c.items : [];
        const hit = items.some(
          (it) =>
            it &&
            typeof it === "object" &&
            String((it as { note?: string }).note || "").includes(bookingTag)
        );
        if (hit) {
          await prisma.appServiceCart.update({
            where: { id: c.id },
            data: { status: "USED" },
          });
        }
      }
    }

    await writeAudit({
      actorType: "STAFF",
      actorId: gate.user.id,
      action: "RESOURCE_COMPLETE_SESSION",
      entityType: "AppResource",
      entityId: resourceId,
      zoneCode: zone,
      payload: { nextStatus, bookingId: session.bookingId },
    });
    return NextResponse.json({ ok: true, status: nextStatus });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
