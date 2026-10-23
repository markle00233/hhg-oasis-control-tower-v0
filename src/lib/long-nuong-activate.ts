import { prisma } from "./prisma";

export type CartTableRef = {
  resourceId: string | null;
  bookingId: string | null;
  bookingCode: string | null;
  tableName: string | null;
};

/** Parse table hold encoded in cart item note: resourceId:…|bookingId:…|code:… */
export function parseCartTableRef(items: unknown): CartTableRef {
  const empty: CartTableRef = {
    resourceId: null,
    bookingId: null,
    bookingCode: null,
    tableName: null,
  };
  if (!Array.isArray(items)) return empty;
  for (const raw of items) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as Record<string, unknown>;
    const id = String(item.id || "");
    const note = String(item.note || "");
    const nameVi = String(item.nameVi || "");
    if (
      !id.startsWith("table-") &&
      !note.includes("resourceId:") &&
      !note.includes("bookingId:")
    ) {
      continue;
    }

    const resourceId =
      (typeof item.resourceId === "string" && item.resourceId) ||
      note.match(/resourceId:([^|]+)/)?.[1]?.trim() ||
      null;
    const bookingId =
      (typeof item.bookingId === "string" && item.bookingId) ||
      note.match(/bookingId:([^|]+)/)?.[1]?.trim() ||
      null;
    const bookingCode =
      note.match(/code:([^|]+)/)?.[1]?.trim() || null;

    return {
      resourceId,
      bookingId,
      bookingCode,
      tableName: nameVi || null,
    };
  }
  return empty;
}

const ARRIVED_BOOKING = [
  "PENDING",
  "CONFIRMED",
  "ARRIVED",
  "CHECKED_IN",
] as const;

function cartIsLive(status: string) {
  return status === "OPEN" || status === "PENDING_APPROVAL";
}

/** Quét QR = khách đã tới. Đóng yêu cầu dù chưa gắn bàn. */
async function markLongNuongArrived(opts: {
  cartId: string;
  cartStatus: string;
  bookingId: string | null;
}) {
  if (!cartIsLive(opts.cartStatus)) return false;
  await prisma.appServiceCart.updateMany({
    where: {
      id: opts.cartId,
      status: { in: ["OPEN", "PENDING_APPROVAL"] },
    },
    data: { status: "USED" },
  });
  if (opts.bookingId) {
    await prisma.appBooking.updateMany({
      where: { id: opts.bookingId, status: { in: [...ARRIVED_BOOKING] } },
      data: { status: "IN_SERVICE" },
    });
  }
  return true;
}

/** Staff scanned guest QR at LONG_NUONG → table goes live (OCCUPIED). */
export async function activateLongNuongTable(opts: {
  cartId: string;
  customerId: string;
  items: unknown;
  cartStatus: string;
}) {
  const ref = parseCartTableRef(opts.items);
  if (!ref.resourceId) {
    const arrived = await markLongNuongArrived({
      cartId: opts.cartId,
      cartStatus: opts.cartStatus,
      bookingId: ref.bookingId,
    });
    if (!arrived) return { activated: false as const, ref };
    return {
      activated: true as const,
      already: false as const,
      ref,
      sessionId: null,
      resource: null,
    };
  }

  const resource = await prisma.appResource.findUnique({
    where: { id: ref.resourceId },
    include: { service: { select: { serviceCode: true } } },
  });
  if (!resource || resource.service.serviceCode !== "LONG_NUONG") {
    return { activated: false as const, ref };
  }

  const existing = await prisma.appResourceSession.findFirst({
    where: { resourceId: resource.id, status: "OCCUPIED" },
  });
  if (existing) {
    await markLongNuongArrived({
      cartId: opts.cartId,
      cartStatus: opts.cartStatus,
      bookingId: ref.bookingId,
    });
    return {
      activated: true as const,
      already: true as const,
      ref,
      sessionId: existing.id,
      resource: { id: resource.id, code: resource.code, name: resource.name },
    };
  }

  const session = await prisma.$transaction(async (tx) => {
    await tx.appResource.update({
      where: { id: resource.id },
      data: { status: "OCCUPIED" },
    });
    const s = await tx.appResourceSession.create({
      data: {
        resourceId: resource.id,
        customerId: opts.customerId,
        bookingId: ref.bookingId,
        status: "OCCUPIED",
      },
    });
    if (cartIsLive(opts.cartStatus)) {
      await tx.appServiceCart.updateMany({
        where: {
          id: opts.cartId,
          status: { in: ["OPEN", "PENDING_APPROVAL"] },
        },
        data: { status: "USED" },
      });
    }
    if (ref.bookingId) {
      await tx.appBooking.updateMany({
        where: {
          id: ref.bookingId,
          status: { in: [...ARRIVED_BOOKING] },
        },
        data: { status: "IN_SERVICE" },
      });
    }
    return s;
  });

  // Điểm chỉ cộng ở Mía Ơi + Hồ Olympic — Lòng Nướng không cộng.

  return {
    activated: true as const,
    already: false as const,
    ref,
    sessionId: session.id,
    resource: { id: resource.id, code: resource.code, name: resource.name },
  };
}

export const LONG_NUONG_DONE_NOTE = "Đã dùng";

/** Staff bấm Đã dùng — kết thúc lượt, trả bàn, gỡ khỏi «Đang dùng». */
export async function finishLongNuongVisit(opts: {
  cartId: string;
  customerId: string;
  items: unknown;
}) {
  const ref = parseCartTableRef(opts.items);
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.appServiceCart.updateMany({
      where: { id: opts.cartId, status: "USED" },
      data: { adminNote: LONG_NUONG_DONE_NOTE },
    });
    if (ref.bookingId) {
      await tx.appBooking.updateMany({
        where: {
          id: ref.bookingId,
          status: {
            in: ["PENDING", "CONFIRMED", "ARRIVED", "CHECKED_IN", "IN_SERVICE"],
          },
        },
        data: { status: "COMPLETED" },
      });
    }
    const sessionOr = [
      ...(ref.bookingId ? [{ bookingId: ref.bookingId }] : []),
      ...(ref.resourceId ? [{ resourceId: ref.resourceId }] : []),
    ];
    const sessions = sessionOr.length
      ? await tx.appResourceSession.findMany({
          where: {
            status: "OCCUPIED",
            customerId: opts.customerId,
            OR: sessionOr,
          },
          select: { id: true, resourceId: true },
        })
      : [];
    if (sessions.length) {
      await tx.appResourceSession.updateMany({
        where: { id: { in: sessions.map((s) => s.id) } },
        data: { status: "COMPLETED", endAt: now },
      });
      const resourceIds = [
        ...new Set(sessions.map((s) => s.resourceId)),
      ];
      for (const resourceId of resourceIds) {
        const still = await tx.appResourceSession.findFirst({
          where: { resourceId, status: "OCCUPIED" },
          select: { id: true },
        });
        if (!still) {
          await tx.appResource.updateMany({
            where: { id: resourceId, status: "OCCUPIED" },
            data: { status: "AVAILABLE" },
          });
        }
      }
    }
  });
}

/** Free reserved table when request rejected / cancelled. */
export async function releaseLongNuongTableHold(items: unknown) {
  const ref = parseCartTableRef(items);
  if (ref.bookingId) {
    await prisma.appBooking.updateMany({
      where: {
        id: ref.bookingId,
        status: {
          in: ["PENDING", "CONFIRMED", "ARRIVED", "CHECKED_IN"],
        },
      },
      data: { status: "CANCELLED" },
    });
  }
  if (!ref.resourceId) return;

  const active = await prisma.appResourceSession.findFirst({
    where: { resourceId: ref.resourceId, status: "OCCUPIED" },
  });
  if (active) return;

  await prisma.appResource.updateMany({
    where: { id: ref.resourceId, status: "RESERVED" },
    data: { status: "AVAILABLE" },
  });
}
