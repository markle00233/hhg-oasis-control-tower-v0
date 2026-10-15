import { CART_STATUS } from "@/lib/cart-status";
import { awardPurchasePoints } from "@/lib/points";
import { prisma } from "@/lib/prisma";

type CartItem = {
  id?: string;
  nameVi?: string;
  qty?: number;
  priceVnd?: number;
};

/** Confirm Mía Ơi cart payment → AppOrder + cart USED. */
export async function confirmMiaOiCartPayment(opts: {
  token: string;
  staffUserId: string;
}) {
  const token = opts.token.trim().replace(/^.*\/q\//, "");
  const cart = await prisma.appServiceCart.findUnique({
    where: { token },
    include: {
      customer: {
        select: {
          id: true,
          fullName: true,
          phone: true,
          phoneLast4: true,
          shortId: true,
          customerCode: true,
        },
      },
    },
  });
  if (!cart || !cart.customer) {
    return { ok: false as const, error: "Không tìm thấy QR.", status: 404 };
  }
  if (cart.zoneCode.toUpperCase() !== "MIA_OI") {
    return {
      ok: false as const,
      error: `QR thuộc khu ${cart.zoneCode}.`,
      status: 403,
    };
  }

  const service = await prisma.appService.findFirst({
    where: { serviceCode: "MIA_OI" },
    select: { id: true },
  });

  if (cart.status === CART_STATUS.USED) {
    const existing = await prisma.appOrder.findFirst({
      where: {
        customerId: cart.customerId,
        ...(service ? { serviceId: service.id } : {}),
        createdAt: { gte: new Date(Date.now() - 6 * 60 * 60 * 1000) },
      },
      orderBy: { createdAt: "desc" },
      include: { items: true },
    });
    return {
      ok: true as const,
      already: true as const,
      paid: true as const,
      cart: { token: cart.token, status: cart.status, totalVnd: cart.totalVnd },
      order: existing,
      customer: cart.customer,
    };
  }

  if (cart.status !== CART_STATUS.OPEN) {
    return {
      ok: false as const,
      error:
        cart.status === CART_STATUS.PENDING
          ? "Chưa duyệt yêu cầu — Duyệt trước khi xác nhận thanh toán."
          : `Không xác nhận được (trạng thái ${cart.status}).`,
      status: 409,
    };
  }

  const rawItems = Array.isArray(cart.items) ? (cart.items as CartItem[]) : [];
  const orderItems = rawItems
    .filter((i) => i && !String(i.id || "").startsWith("voucher-"))
    .map((i) => ({
      itemId: String(i.id || "item"),
      nameVi: String(i.nameVi || "Món"),
      nameEn: null as string | null,
      unitPriceVnd: Math.max(0, Math.round(Number(i.priceVnd) || 0)),
      qty: Math.min(Math.max(Number(i.qty) || 1, 1), 99),
    }));

  if (!orderItems.length) {
    return { ok: false as const, error: "Giỏ trống.", status: 400 };
  }

  const subtotalBeforeDiscount = orderItems.reduce(
    (s, i) => s + i.unitPriceVnd * i.qty,
    0
  );

  const order = await prisma.$transaction(async (tx) => {
    const created = await tx.appOrder.create({
      data: {
        customerId: cart.customerId,
        serviceId: service?.id || null,
        status: "ACCEPTED",
        source: "ZONE_DESK",
        createdByType: "STAFF",
        createdById: opts.staffUserId,
        totalVnd: cart.totalVnd,
        note: `Thanh toán QR ${cart.token.slice(0, 12)}…`,
        items: { create: orderItems },
      },
      include: { items: true },
    });
    await tx.appServiceCart.update({
      where: { id: cart.id },
      data: { status: CART_STATUS.USED },
    });
    if (service) {
      await tx.appServiceEvent.create({
        data: {
          customerId: cart.customerId,
          serviceId: service.id,
          eventType: "MIA_OI_ORDER",
          operationalStatus: "ACKNOWLEDGED",
          metadata: {
            source: "desk_confirm_payment",
            cartToken: cart.token,
            orderId: created.id,
            totalVnd: cart.totalVnd,
            subtotalBeforeDiscount,
            paidAt: new Date().toISOString(),
          },
        },
      });
    }
    return created;
  });

  const pts = await awardPurchasePoints({
    customerId: cart.customerId,
    refType: "SERVICE_CART",
    refId: cart.id,
    subtotalVnd: subtotalBeforeDiscount,
    note: `Mía Ơi · ${subtotalBeforeDiscount}đ trước giảm`,
  }).catch((err) => {
    console.error("[miaoi-confirm points]", err);
    return null;
  });

  return {
    ok: true as const,
    already: false as const,
    paid: true as const,
    cart: {
      token: cart.token,
      status: CART_STATUS.USED,
      totalVnd: cart.totalVnd,
    },
    order,
    customer: cart.customer,
    pointsAwarded: pts?.delta ?? 0,
    pointsBalance: pts?.balance ?? null,
    message: "Đã xác nhận thanh toán — được làm món.",
  };
}
