import { CART_STATUS } from "@/lib/cart-status";
import { getMiaOiItem } from "@/lib/miaoi-menu";
import {
  REDEEM_DRINK_MAX_VND,
  REDEEM_TIER_DRINK,
  awardPurchasePoints,
  redeemPoints,
} from "@/lib/points";
import { prisma } from "@/lib/prisma";

type CartItem = {
  id?: string;
  nameVi?: string;
  qty?: number;
  priceVnd?: number;
};

type ExtraLine = { itemId?: string; qty?: number; useAltPrice?: boolean };

type OrderLine = {
  itemId: string;
  nameVi: string;
  nameEn: string | null;
  unitPriceVnd: number;
  qty: number;
  pointsDiscountVnd?: number;
  pointsRedeemTier?: number | null;
};

type ExtraRedeem = { tier?: number; itemId?: string; useAltPrice?: boolean };

/** Confirm Mía Ơi cart payment → AppOrder + cart USED. Extras are added on top. */
export async function confirmMiaOiCartPayment(opts: {
  token: string;
  staffUserId: string;
  extraItems?: ExtraLine[];
  /** 50 điểm cho 1 món gọi thêm ≤ 50.000đ. */
  pointsRedeem?: ExtraRedeem | null;
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
  let cartRedeemTier = 0;
  const orderItems: OrderLine[] = [];
  for (const i of rawItems) {
    if (!i) continue;
    const id = String(i.id || "");
    if (id.startsWith("voucher-")) continue;
    if (id.startsWith("points-redeem-")) {
      const tier = Math.round(Number(id.slice("points-redeem-".length)) || 0);
      if (tier === 50 || tier === 100) cartRedeemTier = tier;
      continue;
    }
    orderItems.push({
      itemId: id || "item",
      nameVi: String(i.nameVi || "Món"),
      nameEn: null,
      unitPriceVnd: Math.max(0, Math.round(Number(i.priceVnd) || 0)),
      qty: Math.min(Math.max(Number(i.qty) || 1, 1), 99),
    });
  }
  if (cartRedeemTier === REDEEM_TIER_DRINK) {
    const hit = orderItems.find(
      (l) => l.unitPriceVnd > 0 && l.unitPriceVnd <= REDEEM_DRINK_MAX_VND
    );
    if (hit) {
      hit.pointsRedeemTier = REDEEM_TIER_DRINK;
      hit.pointsDiscountVnd = Math.min(
        hit.unitPriceVnd * hit.qty,
        (hit.pointsDiscountVnd || 0) + hit.unitPriceVnd
      );
    }
  }

  if (!orderItems.length) {
    return { ok: false as const, error: "Giỏ trống.", status: 400 };
  }

  const extras: OrderLine[] = [];
  for (const line of opts.extraItems || []) {
    const qty = Math.min(Math.max(Number(line.qty) || 0, 0), 99);
    if (qty < 1) continue;
    const item = getMiaOiItem(String(line.itemId || ""));
    if (!item) continue;
    const unit =
      line.useAltPrice && item.priceAltVnd ? item.priceAltVnd : item.priceVnd;
    extras.push({
      itemId: item.id,
      nameVi: item.nameVi,
      nameEn: item.nameEn,
      unitPriceVnd: unit,
      qty,
    });
  }
  const merged = new Map<string, OrderLine>();
  for (const line of [...orderItems, ...extras]) {
    const key = `${line.itemId}:${line.unitPriceVnd}`;
    const prev = merged.get(key);
    if (prev) {
      prev.qty += line.qty;
      prev.pointsDiscountVnd =
        (prev.pointsDiscountVnd || 0) + (line.pointsDiscountVnd || 0);
      if (line.pointsRedeemTier) prev.pointsRedeemTier = line.pointsRedeemTier;
    } else merged.set(key, { ...line });
  }
  const finalItems = [...merged.values()];
  const extraTotal = extras.reduce((s, i) => s + i.unitPriceVnd * i.qty, 0);

  let extraPointsOff = 0;
  const redeemTier = Math.round(Number(opts.pointsRedeem?.tier) || 0);
  const redeemItemId = String(opts.pointsRedeem?.itemId || "").trim();
  if (redeemTier || redeemItemId) {
    if (redeemTier !== REDEEM_TIER_DRINK || !redeemItemId) {
      return {
        ok: false as const,
        error: "Đổi điểm cho món gọi thêm chỉ hỗ trợ 50 điểm.",
        status: 400,
      };
    }
    const menuItem = getMiaOiItem(redeemItemId);
    const unit =
      opts.pointsRedeem?.useAltPrice && menuItem?.priceAltVnd
        ? menuItem.priceAltVnd
        : menuItem?.priceVnd || 0;
    const extraHit = extras.find(
      (l) => l.itemId === redeemItemId && l.unitPriceVnd === unit && l.qty >= 1
    );
    if (!menuItem || !extraHit || unit <= 0 || unit > REDEEM_DRINK_MAX_VND) {
      return {
        ok: false as const,
        error: "Chọn một món gọi thêm ≤ 50.000đ để đổi 50 điểm.",
        status: 400,
      };
    }
    const payer = await prisma.appCustomer.findUnique({
      where: { id: cart.customerId },
      select: { pointsBalance: true },
    });
    if ((payer?.pointsBalance ?? 0) < REDEEM_TIER_DRINK) {
      return {
        ok: false as const,
        error: `Không đủ điểm (cần ${REDEEM_TIER_DRINK}, đang có ${payer?.pointsBalance ?? 0}).`,
        status: 400,
      };
    }
    const mergedHit = finalItems.find(
      (l) => l.itemId === redeemItemId && l.unitPriceVnd === unit
    );
    if (mergedHit) {
      const room = mergedHit.unitPriceVnd * mergedHit.qty - (mergedHit.pointsDiscountVnd || 0);
      const cut = Math.min(unit, Math.max(0, room));
      mergedHit.pointsDiscountVnd = (mergedHit.pointsDiscountVnd || 0) + cut;
      mergedHit.pointsRedeemTier = REDEEM_TIER_DRINK;
      extraPointsOff = cut;
    }
  }

  const subtotalBeforeDiscount =
    orderItems.reduce((s, i) => s + i.unitPriceVnd * i.qty, 0) + extraTotal;
  const totalVnd = Math.max(0, cart.totalVnd + extraTotal - extraPointsOff);

  const order = await prisma.$transaction(async (tx) => {
    const created = await tx.appOrder.create({
      data: {
        customerId: cart.customerId,
        serviceId: service?.id || null,
        status: "ACCEPTED",
        source: "ZONE_DESK",
        createdByType: "STAFF",
        createdById: opts.staffUserId,
        totalVnd,
        note: `Thanh toán QR ${cart.token.slice(0, 12)}…`,
        items: {
          create: finalItems.map((i) => ({
            itemId: i.itemId,
            nameVi: i.nameVi,
            nameEn: i.nameEn,
            unitPriceVnd: i.unitPriceVnd,
            qty: i.qty,
          })),
        },
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
            ticketVerified: true,
            cartToken: cart.token,
            orderId: created.id,
            totalVnd,
            subtotalBeforeDiscount,
            paidAt: new Date().toISOString(),
            items: finalItems.map((i) => ({
              name: i.nameVi,
              qty: i.qty,
              unitPriceVnd: i.unitPriceVnd,
              itemId: i.itemId,
              pointsDiscountVnd: i.pointsDiscountVnd || 0,
              pointsRedeemTier: i.pointsRedeemTier || null,
            })),
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

  let pointsBalance = pts?.balance ?? null;
  if (extraPointsOff > 0) {
    const burned = await redeemPoints({
      customerId: cart.customerId,
      cost: REDEEM_TIER_DRINK,
      refType: "APP_ORDER",
      refId: `mia-extra:${order.id}`,
      note: `Đổi 50 điểm · món gọi thêm · ${redeemItemId}`,
    });
    pointsBalance = burned.balance;
  }

  return {
    ok: true as const,
    already: false as const,
    paid: true as const,
    cart: {
      token: cart.token,
      status: CART_STATUS.USED,
      totalVnd,
    },
    order,
    customer: cart.customer,
    pointsAwarded: pts?.delta ?? 0,
    pointsBalance,
    message: "Đã xác nhận thanh toán — được làm món.",
  };
}
