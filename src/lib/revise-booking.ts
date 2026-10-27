import { Prisma } from "@prisma/client";
import { writeAudit } from "./audit";
import { prisma } from "./prisma";
import { LONG_NUONG_DONE_NOTE } from "./long-nuong-activate";
import {
  PICKLEBALL_CLOSE_MIN,
  PICKLEBALL_OPEN_MIN,
  priceForRange,
} from "./pickleball";

const LIVE_BOOKING = [
  "PENDING",
  "CONFIRMED",
  "ARRIVED",
  "CHECKED_IN",
  "IN_SERVICE",
] as const;

const CLOSED_CART = new Set(["REJECTED", "CANCELLED", "NO_SHOW", "EXPIRED"]);
const CLOSED_BOOKING = new Set(["COMPLETED", "CANCELLED", "NO_SHOW"]);

const LN_OPEN_MIN = 10 * 60;
const LN_CLOSE_MIN = 22 * 60;
const LN_SESSION_MS = 3 * 60 * 60 * 1000;

export type ReviseZone = "LONG_NUONG" | "PICKLEBALL";

export function reviseZone(raw: string): ReviseZone | null {
  const z = String(raw || "").trim().toUpperCase();
  if (z === "LONG_NUONG" || z === "PICKLEBALL") return z;
  return null;
}

function fail(status: number, error: string): never {
  const err = new Error(error) as Error & { status: number };
  err.status = status;
  throw err;
}

function vnClock(d: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(d);
  const get = (type: string) =>
    parts.find((p) => p.type === type)?.value || "";
  let hour = Number(get("hour") || 0);
  if (hour === 24) hour = 0;
  return {
    day: `${get("year")}-${get("month")}-${get("day")}`,
    minutes: hour * 60 + Number(get("minute") || 0),
  };
}

function viLabel(d: Date, withDate: boolean) {
  return d.toLocaleString("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    ...(withDate ? { day: "2-digit", month: "2-digit", year: "numeric" } : {}),
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function bookingIdFromCartItems(items: unknown): string | null {
  if (!Array.isArray(items)) return null;
  for (const raw of items) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as Record<string, unknown>;
    if (typeof item.bookingId === "string" && item.bookingId) return item.bookingId;
    const fromNote = String(item.note || "").match(/bookingId:([^|]+)/)?.[1]?.trim();
    if (fromNote) return fromNote;
  }
  return null;
}

function lineMatchesBooking(item: Record<string, unknown>, bookingId: string) {
  if (typeof item.bookingId === "string" && item.bookingId === bookingId) return true;
  return String(item.note || "").includes(`bookingId:${bookingId}`);
}

const CART_PICK = {
  id: true,
  token: true,
  status: true,
  adminNote: true,
  items: true,
  expiresAt: true,
  customerId: true,
  zoneCode: true,
  totalVnd: true,
} as const;

function lockReason(opts: {
  zone: ReviseZone;
  cartStatus?: string | null;
  adminNote?: string | null;
  bookingStatus: string;
  playing: boolean;
}) {
  if (opts.cartStatus && CLOSED_CART.has(opts.cartStatus)) return "Yêu cầu đã đóng.";
  if (CLOSED_BOOKING.has(opts.bookingStatus)) return "Đặt chỗ đã kết thúc.";
  if (opts.zone === "LONG_NUONG") {
    if ((opts.adminNote || "").trim() === LONG_NUONG_DONE_NOTE) {
      return "Đã dùng — không sửa số khách / giờ đến.";
    }
    return null;
  }
  if (
    opts.cartStatus === "USED" ||
    opts.bookingStatus === "IN_SERVICE" ||
    opts.playing
  ) {
    return "Sân đã mở — không sửa giờ / sân.";
  }
  return null;
}

async function syncResourceHold(
  tx: Prisma.TransactionClient,
  resourceId: string | null
) {
  if (!resourceId) return;
  const resource = await tx.appResource.findUnique({
    where: { id: resourceId },
  });
  if (!resource) return;
  if (resource.status === "BLOCKED" || resource.status === "CLEANING") return;
  const occupied = await tx.appResourceSession.findFirst({
    where: { resourceId, status: "OCCUPIED" },
    select: { id: true },
  });
  if (occupied) return;
  if (resource.status === "OCCUPIED") return;
  const now = new Date();
  const hold = await tx.appBooking.findFirst({
    where: {
      resourceId,
      status: { in: [...LIVE_BOOKING] },
      startAt: { lte: now },
      endAt: { gt: now },
    },
    select: { id: true },
  });
  const next = hold ? "RESERVED" : "AVAILABLE";
  if (resource.status !== next) {
    await tx.appResource.update({
      where: { id: resourceId },
      data: { status: next },
    });
  }
}

type Loaded = {
  zone: ReviseZone;
  cart: {
    id: string;
    token: string;
    status: string;
    adminNote: string | null;
    items: unknown;
    expiresAt: Date;
    customerId: string;
    totalVnd: number;
  } | null;
  booking: {
    id: string;
    bookingCode: string;
    startAt: Date;
    endAt: Date;
    partySize: number;
    status: string;
    resourceId: string | null;
    customerId: string | null;
    serviceId: string;
  };
  resource: { id: string; code: string; name: string } | null;
  lockedReason: string | null;
};

async function loadTarget(opts: {
  zone: ReviseZone;
  token?: string;
  bookingId?: string;
}): Promise<Loaded | { missing: true }> {
  const service = await prisma.appService.findUnique({
    where: { serviceCode: opts.zone },
    select: { id: true },
  });
  if (!service) fail(404, "Khu này chưa cấu hình.");

  let cart: Loaded["cart"] = null;
  let bookingId = String(opts.bookingId || "").trim();

  if (opts.token) {
    const row = await prisma.appServiceCart.findUnique({
      where: { token: opts.token.trim() },
      select: CART_PICK,
    });
    if (!row || row.zoneCode.toUpperCase() !== opts.zone) {
      fail(404, "Không thấy yêu cầu này.");
    }
    cart = {
      id: row.id,
      token: row.token,
      status: row.status,
      adminNote: row.adminNote,
      items: row.items,
      expiresAt: row.expiresAt,
      customerId: row.customerId,
      totalVnd: row.totalVnd,
    };
    bookingId = bookingIdFromCartItems(row.items) || bookingId;
  }

  if (!bookingId) return { missing: true as const };

  const booking = await prisma.appBooking.findUnique({
    where: { id: bookingId },
    include: { resource: { select: { id: true, code: true, name: true } } },
  });
  if (!booking || booking.serviceId !== service.id) {
    fail(404, "Không thấy đặt chỗ.");
  }

  if (!cart && booking.customerId) {
    const rows = await prisma.appServiceCart.findMany({
      where: {
        zoneCode: opts.zone,
        customerId: booking.customerId,
        status: { notIn: ["REJECTED", "CANCELLED"] },
      },
      orderBy: { createdAt: "desc" },
      take: 30,
      select: CART_PICK,
    });
    const row = rows.find((c) => bookingIdFromCartItems(c.items) === booking.id);
    if (row) {
      cart = {
        id: row.id,
        token: row.token,
        status: row.status,
        adminNote: row.adminNote,
        items: row.items,
        expiresAt: row.expiresAt,
        customerId: row.customerId,
        totalVnd: row.totalVnd,
      };
    }
  }

  const alreadyLocked = lockReason({
    zone: opts.zone,
    cartStatus: cart?.status,
    adminNote: cart?.adminNote,
    bookingStatus: booking.status,
    playing: false,
  });
  let lockedReason = alreadyLocked;
  if (!lockedReason && opts.zone === "PICKLEBALL") {
    const playing = await prisma.appResourceSession.findFirst({
      where: { bookingId: booking.id, status: "OCCUPIED" },
      select: { id: true },
    });
    if (playing) lockedReason = "Sân đã mở — không sửa giờ / sân.";
  }

  return {
    zone: opts.zone,
    cart,
    booking: {
      id: booking.id,
      bookingCode: booking.bookingCode,
      startAt: booking.startAt,
      endAt: booking.endAt,
      partySize: booking.partySize,
      status: booking.status,
      resourceId: booking.resourceId,
      customerId: booking.customerId,
      serviceId: booking.serviceId,
    },
    resource: booking.resource,
    lockedReason,
  };
}

export async function readReviseBooking(opts: {
  zone: ReviseZone;
  token?: string;
  bookingId?: string;
}) {
  const loaded = await loadTarget(opts);
  if ("missing" in loaded) return { missing: true as const };
  const courts =
    !loaded.lockedReason && loaded.zone === "PICKLEBALL"
      ? await prisma.appResource.findMany({
          where: {
            serviceId: loaded.booking.serviceId,
            type: "COURT",
            active: true,
          },
          orderBy: { code: "asc" },
          select: { id: true, code: true, name: true, status: true },
        })
      : [];
  return {
    editable: !loaded.lockedReason,
    lockedReason: loaded.lockedReason,
    zone: loaded.zone,
    token: loaded.cart?.token || null,
    bookingId: loaded.booking.id,
    bookingCode: loaded.booking.bookingCode,
    startAt: loaded.booking.startAt.toISOString(),
    endAt: loaded.booking.endAt.toISOString(),
    partySize: loaded.booking.partySize,
    resourceId: loaded.resource?.id || null,
    resourceName: loaded.resource?.name || null,
    courts,
  };
}

export async function applyReviseBooking(opts: {
  zone: ReviseZone;
  token?: string;
  bookingId?: string;
  startAt: Date;
  partySize?: number;
  resourceId?: string | null;
  staffId: string;
}) {
  const loaded = await loadTarget(opts);
  if ("missing" in loaded) fail(404, "Yêu cầu này không có đặt chỗ để sửa.");
  if (loaded.lockedReason) fail(409, loaded.lockedReason);

  const startAt = opts.startAt;
  if (Number.isNaN(startAt.getTime())) fail(400, "Giờ đến không hợp lệ.");

  const prevDuration =
    loaded.booking.endAt.getTime() - loaded.booking.startAt.getTime();
  const duration =
    prevDuration > 0
      ? prevDuration
      : loaded.zone === "LONG_NUONG"
        ? LN_SESSION_MS
        : 60 * 60 * 1000;
  const endAt = new Date(startAt.getTime() + duration);

  const moved =
    Math.abs(startAt.getTime() - loaded.booking.startAt.getTime()) > 60 * 1000;
  if (moved && startAt.getTime() < Date.now() - 5 * 60 * 1000) {
    fail(400, "Không chuyển giờ đến về quá khứ.");
  }

  const startClock = vnClock(startAt);
  const endClock = vnClock(endAt);

  let partySize = loaded.booking.partySize;
  let resourceId = loaded.booking.resourceId;
  let resource: { id: string; code: string; name: string } | null =
    loaded.resource;

  if (loaded.zone === "LONG_NUONG") {
    const requested = Math.round(Number(opts.partySize));
    partySize =
      Number.isFinite(requested) && requested > 0
        ? Math.min(20, requested)
        : loaded.booking.partySize;
    if (
      startClock.minutes < LN_OPEN_MIN ||
      startClock.minutes > LN_CLOSE_MIN
    ) {
      fail(400, "Lòng nướng nhận khách từ 10:00 đến 22:00.");
    }
  } else {
    const nextResourceId = String(opts.resourceId || resourceId || "").trim();
    if (!nextResourceId) fail(400, "Chọn sân.");
    const court = await prisma.appResource.findFirst({
      where: {
        id: nextResourceId,
        serviceId: loaded.booking.serviceId,
        type: "COURT",
        active: true,
      },
      select: { id: true, code: true, name: true, status: true },
    });
    if (!court) fail(400, "Sân không hợp lệ.");
    if (
      startClock.minutes < PICKLEBALL_OPEN_MIN ||
      startClock.day !== endClock.day ||
      endClock.minutes > PICKLEBALL_CLOSE_MIN
    ) {
      fail(400, "Sân mở 6:00–21:30. Giờ kết thúc phải trong khung này.");
    }
    resourceId = court.id;
    resource = { id: court.id, code: court.code, name: court.name };
  }

  const unchanged =
    partySize === loaded.booking.partySize &&
    resourceId === loaded.booking.resourceId &&
    Math.abs(startAt.getTime() - loaded.booking.startAt.getTime()) < 1000;
  if (unchanged) {
    return {
      ok: true as const,
      bookingId: loaded.booking.id,
      startAt: loaded.booking.startAt.toISOString(),
      endAt: loaded.booking.endAt.toISOString(),
      partySize: loaded.booking.partySize,
      resourceId: loaded.booking.resourceId,
      resourceName: resource?.name || null,
      totalVnd: loaded.cart?.totalVnd ?? 0,
    };
  }

  const arriveLabel = viLabel(startAt, true);
  const endLabel = viLabel(endAt, false);
  const slotLabel = `${arriveLabel}–${endLabel}`;
  const totalVnd =
    loaded.zone === "PICKLEBALL" ? priceForRange(startAt, endAt) : 0;
  const conflictMessage =
    loaded.zone === "PICKLEBALL"
      ? "Khung giờ này sân đã có người đặt."
      : "Khung giờ này bàn đã có người đặt.";

  const previousResourceId = loaded.booking.resourceId;

  const updated = await prisma.$transaction(async (tx) => {
    const fresh = await tx.appBooking.findUnique({
      where: { id: loaded.booking.id },
      select: { status: true },
    });
    if (!fresh) fail(404, "Không thấy đặt chỗ.");
    const freshCart = loaded.cart
      ? await tx.appServiceCart.findUnique({
          where: { id: loaded.cart.id },
          select: { status: true, adminNote: true },
        })
      : null;
    const playing =
      loaded.zone === "PICKLEBALL"
        ? await tx.appResourceSession.findFirst({
            where: { bookingId: loaded.booking.id, status: "OCCUPIED" },
            select: { id: true },
          })
        : null;
    const blocked = lockReason({
      zone: loaded.zone,
      cartStatus: freshCart?.status ?? loaded.cart?.status,
      adminNote: freshCart?.adminNote ?? loaded.cart?.adminNote,
      bookingStatus: fresh.status,
      playing: !!playing,
    });
    if (blocked) fail(409, blocked);

    if (resourceId) {
      const conflict = await tx.appBooking.findFirst({
        where: {
          id: { not: loaded.booking.id },
          resourceId,
          status: { in: [...LIVE_BOOKING] },
          startAt: { lt: endAt },
          endAt: { gt: startAt },
        },
        select: { id: true },
      });
      if (conflict) fail(409, conflictMessage);
      const overlapsNow =
        startAt.getTime() <= Date.now() && endAt.getTime() > Date.now();
      if (
        overlapsNow &&
        loaded.zone === "PICKLEBALL" &&
        resourceId !== previousResourceId
      ) {
        const playing = await tx.appResourceSession.findFirst({
          where: { resourceId, status: "OCCUPIED" },
          select: { id: true },
        });
        if (playing) fail(409, "Sân đang được sử dụng. Chọn sân hoặc giờ khác.");
      }
    }

    const booking = await tx.appBooking.update({
      where: { id: loaded.booking.id },
      data: {
        startAt,
        endAt,
        partySize,
        resourceId,
      },
    });

    let cartTotal = totalVnd;
    if (loaded.cart) {
      const raw = Array.isArray(loaded.cart.items) ? loaded.cart.items : [];
      let patched = false;
      const nextItems = raw.map((row) => {
        if (!row || typeof row !== "object") return row;
        const item = { ...(row as Record<string, unknown>) };
        if (patched || !lineMatchesBooking(item, booking.id)) return item;
        patched = true;
        if (loaded.zone === "LONG_NUONG") {
          item.nameVi = resource
            ? `${resource.name} · ${arriveLabel} · ${partySize} khách`
            : `Yêu cầu bàn · ${arriveLabel} · ${partySize} khách`;
          item.priceVnd = 0;
          item.note = resource
            ? `resourceId:${resource.id}|bookingId:${booking.id}|code:${booking.bookingCode}`
            : `bookingId:${booking.id}|code:${booking.bookingCode}|noQr:1`;
          if (!resource) item.id = "ln-request";
        } else if (resource) {
          item.id = `court-${resource.code}`;
          item.nameVi = `${resource.name} · ${slotLabel}`;
          item.priceVnd = totalVnd;
          const source = String(item.note || "").match(/source:([^|]+)/)?.[1];
          item.note = `resourceId:${resource.id}|bookingId:${booking.id}|code:${booking.bookingCode}${
            source ? `|source:${source}` : ""
          }`;
        }
        return item;
      });
      cartTotal = nextItems.reduce((sum, row) => {
        if (!row || typeof row !== "object") return sum;
        const item = row as { priceVnd?: number; qty?: number };
        return (
          sum +
          Math.max(0, Number(item.priceVnd) || 0) *
            Math.max(1, Number(item.qty) || 1)
        );
      }, 0);
      const minExpiry = new Date(endAt.getTime() + 6 * 60 * 60 * 1000);
      await tx.appServiceCart.update({
        where: { id: loaded.cart.id },
        data: {
          items: nextItems as Prisma.InputJsonValue,
          totalVnd: cartTotal,
          ...(loaded.cart.expiresAt < minExpiry
            ? { expiresAt: minExpiry }
            : {}),
        },
      });
    }

    if (previousResourceId && previousResourceId !== resourceId) {
      await syncResourceHold(tx, previousResourceId);
    }
    await syncResourceHold(tx, resourceId);

    return { booking, cartTotal };
  });

  await writeAudit({
    actorType: "STAFF",
    actorId: opts.staffId,
    action: "BOOKING_REVISE",
    entityType: "AppBooking",
    entityId: updated.booking.id,
    zoneCode: loaded.zone,
    payload: {
      startAt: startAt.toISOString(),
      endAt: endAt.toISOString(),
      partySize,
      resourceId,
      cartToken: loaded.cart?.token || null,
    },
  });

  return {
    ok: true as const,
    bookingId: updated.booking.id,
    startAt: updated.booking.startAt.toISOString(),
    endAt: updated.booking.endAt.toISOString(),
    partySize: updated.booking.partySize,
    resourceId: updated.booking.resourceId,
    resourceName: resource?.name || null,
    totalVnd: updated.cartTotal,
  };
}
