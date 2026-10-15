import { prisma } from "./prisma";
import { CART_STATUS } from "./cart-status";

export type CartCourtRef = {
  resourceId: string | null;
  bookingId: string | null;
  bookingCode: string | null;
  courtName: string | null;
};

/** Parse court hold in cart item note: resourceId:…|bookingId:…|code:… */
export function parseCartCourtRef(items: unknown): CartCourtRef {
  const empty: CartCourtRef = {
    resourceId: null,
    bookingId: null,
    bookingCode: null,
    courtName: null,
  };
  if (!Array.isArray(items)) return empty;
  for (const raw of items) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as Record<string, unknown>;
    const id = String(item.id || "");
    const note = String(item.note || "");
    const nameVi = String(item.nameVi || "");
    if (!id.startsWith("court-") && !note.includes("resourceId:")) continue;

    return {
      resourceId:
        (typeof item.resourceId === "string" && item.resourceId) ||
        note.match(/resourceId:([^|]+)/)?.[1]?.trim() ||
        null,
      bookingId:
        (typeof item.bookingId === "string" && item.bookingId) ||
        note.match(/bookingId:([^|]+)/)?.[1]?.trim() ||
        null,
      bookingCode: note.match(/code:([^|]+)/)?.[1]?.trim() || null,
      courtName: nameVi || null,
    };
  }
  return empty;
}

/** Staff scanned Pickleball cart QR → court OCCUPIED + cart USED. */
export async function activatePickleballCourt(opts: {
  cartId: string;
  customerId: string;
  items: unknown;
  cartStatus: string;
  guestName?: string | null;
  guestPhone?: string | null;
}) {
  const ref = parseCartCourtRef(opts.items);
  if (!ref.resourceId) return { activated: false as const, ref };

  const resource = await prisma.appResource.findUnique({
    where: { id: ref.resourceId },
    include: { service: { select: { serviceCode: true } } },
  });
  if (!resource || resource.service.serviceCode !== "PICKLEBALL") {
    return { activated: false as const, ref };
  }

  const existing = await prisma.appResourceSession.findFirst({
    where: { resourceId: resource.id, status: "OCCUPIED" },
  });
  if (existing) {
    if (
      opts.cartStatus === CART_STATUS.OPEN ||
      opts.cartStatus === CART_STATUS.PENDING
    ) {
      await prisma.appServiceCart.updateMany({
        where: {
          id: opts.cartId,
          status: { in: [CART_STATUS.OPEN, CART_STATUS.PENDING] },
        },
        data: { status: CART_STATUS.USED },
      });
    }
    if (ref.bookingId) {
      await prisma.appBooking.updateMany({
        where: {
          id: ref.bookingId,
          status: {
            in: ["PENDING", "CONFIRMED", "ARRIVED", "CHECKED_IN"],
          },
        },
        data: { status: "IN_SERVICE" },
      });
    }
    return {
      activated: true as const,
      already: true as const,
      ref,
      sessionId: existing.id,
      resource: { id: resource.id, code: resource.code, name: resource.name },
    };
  }

  const displayName = opts.guestName?.trim() || "Khách lẻ";
  const phone = opts.guestPhone?.trim() || "";
  const note = [displayName, phone || null].filter(Boolean).join(" · ");

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
        startAt: new Date(),
        note,
      },
    });
    await tx.appServiceCart.updateMany({
      where: {
        id: opts.cartId,
        status: { in: [CART_STATUS.OPEN, CART_STATUS.PENDING] },
      },
      data: { status: CART_STATUS.USED },
    });
    if (ref.bookingId) {
      await tx.appBooking.updateMany({
        where: {
          id: ref.bookingId,
          status: {
            in: ["PENDING", "CONFIRMED", "ARRIVED", "CHECKED_IN"],
          },
        },
        data: { status: "IN_SERVICE" },
      });
    }
    return s;
  });

  return {
    activated: true as const,
    already: false as const,
    ref,
    sessionId: session.id,
    resource: { id: resource.id, code: resource.code, name: resource.name },
  };
}
