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
    if (!id.startsWith("table-") && !note.includes("resourceId:")) continue;

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

/** Staff scanned guest QR at LONG_NUONG → table goes live (OCCUPIED). */
export async function activateLongNuongTable(opts: {
  cartId: string;
  customerId: string;
  items: unknown;
  cartStatus: string;
}) {
  const ref = parseCartTableRef(opts.items);
  if (!ref.resourceId) return { activated: false as const, ref };

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
    if (opts.cartStatus === "OPEN") {
      await prisma.appServiceCart.updateMany({
        where: { id: opts.cartId, status: "OPEN" },
        data: { status: "USED" },
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
    if (opts.cartStatus === "OPEN" || opts.cartStatus === "PENDING_APPROVAL") {
      await tx.appServiceCart.update({
        where: { id: opts.cartId },
        data: { status: "USED" },
      });
    }
    if (ref.bookingId) {
      await tx.appBooking.updateMany({
        where: { id: ref.bookingId },
        data: { status: "IN_SERVICE" },
      });
    }
    return s;
  });

  if (opts.cartStatus === "OPEN" || opts.cartStatus === "PENDING_APPROVAL") {
    const raw = Array.isArray(opts.items) ? opts.items : [];
    const subtotal = raw
      .filter((i) => i && !String((i as { id?: string }).id || "").startsWith("voucher-"))
      .reduce((s, i) => {
        const row = i as { qty?: number; priceVnd?: number };
        return s + Math.max(0, Number(row.priceVnd) || 0) * Math.max(1, Number(row.qty) || 1);
      }, 0);
    const { awardPurchasePoints } = await import("@/lib/points");
    await awardPurchasePoints({
      customerId: opts.customerId,
      refType: "SERVICE_CART",
      refId: opts.cartId,
      subtotalVnd: subtotal,
      note: `Lòng Nướng · ${subtotal}đ trước giảm`,
    }).catch((err) => console.error("[long-nuong points]", err));
  }

  return {
    activated: true as const,
    already: false as const,
    ref,
    sessionId: session.id,
    resource: { id: resource.id, code: resource.code, name: resource.name },
  };
}

/** Free reserved table when request rejected / cancelled. */
export async function releaseLongNuongTableHold(items: unknown) {
  const ref = parseCartTableRef(items);
  if (!ref.resourceId) return;

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

  const active = await prisma.appResourceSession.findFirst({
    where: { resourceId: ref.resourceId, status: "OCCUPIED" },
  });
  if (active) return;

  await prisma.appResource.updateMany({
    where: { id: ref.resourceId, status: "RESERVED" },
    data: { status: "AVAILABLE" },
  });
}
