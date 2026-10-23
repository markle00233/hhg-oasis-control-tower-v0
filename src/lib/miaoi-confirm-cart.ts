import { CART_STATUS } from "@/lib/cart-status";
import {
  applyDeskRedeemUnits,
  coverDrinkCartPoints,
  earnableVnd,
} from "@/lib/desk-point-redeem";
import { getMiaOiItem } from "@/lib/miaoi-menu";
import {
  cartHasMiaMembershipDiscount,
  quoteMiaOiVipDiscount,
} from "@/lib/olympic-membership";
import {
  REDEEM_DRINK_MAX_VND,
  REDEEM_TIER_DRINK,
  awardPurchasePoints,
  redeemPoints,
} from "@/lib/points";
import { prisma } from "@/lib/prisma";
import {
  consumeDeskBillVoucher,
  deskVoucherNote,
  quoteDeskBillVoucher,
  voucherErrorStatus,
} from "@/lib/voucher-redeem";
import { isMiaOiMembershipVoucher } from "@/lib/hhg-vouchers";

type CartItem = {
  id?: string;
  nameVi?: string;
  qty?: number;
  priceVnd?: number;
  pointsRedeemQty?: number;
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
  /** Số đồ uống đổi điểm (50, 100, 150…). */
  pointsRedeemUnits?: number;
  voucherOfferId?: string;
  staffName?: string;
  /** Cùng id với vé hồ khi quầy lưu một lần. */
  deskBundleId?: string;
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
          segment: true,
          vipExpiresAt: true,
          vipPlanLabel: true,
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
  let cartRedeemUnits = 0;
  let explicitRedeemUnits = 0;
  const orderItems: OrderLine[] = [];
  for (const i of rawItems) {
    if (!i) continue;
    const id = String(i.id || "");
    if (id.startsWith("voucher-")) continue;
    if (id.startsWith("points-redeem-")) {
      const tier = Math.round(Number(id.slice("points-redeem-".length)) || 0);
      if (tier === 50 || tier === 100) {
        cartRedeemTier = tier;
        cartRedeemUnits = Math.max(
          cartRedeemUnits,
          Math.round(Number(i.qty) || 1)
        );
      }
      continue;
    }
    const qty = Math.min(Math.max(Number(i.qty) || 1, 1), 99);
    const unitPriceVnd = Math.max(0, Math.round(Number(i.priceVnd) || 0));
    const line: OrderLine = {
      itemId: id || "item",
      nameVi: String(i.nameVi || "Món"),
      nameEn: null,
      unitPriceVnd,
      qty,
    };
    const requested = Math.min(
      qty,
      Math.max(0, Math.round(Number(i.pointsRedeemQty) || 0))
    );
    if (
      requested > 0 &&
      unitPriceVnd > 0 &&
      unitPriceVnd <= REDEEM_DRINK_MAX_VND
    ) {
      line.pointsRedeemTier = REDEEM_TIER_DRINK;
      line.pointsDiscountVnd = requested * unitPriceVnd;
      explicitRedeemUnits += requested;
    }
    orderItems.push(line);
  }
  if (explicitRedeemUnits === 0 && cartRedeemTier === REDEEM_TIER_DRINK) {
    let left = Math.max(1, cartRedeemUnits);
    for (const hit of orderItems) {
      if (left <= 0) break;
      if (hit.unitPriceVnd <= 0 || hit.unitPriceVnd > REDEEM_DRINK_MAX_VND) {
        continue;
      }
      const take = Math.min(hit.qty, left);
      hit.pointsRedeemTier = REDEEM_TIER_DRINK;
      hit.pointsDiscountVnd = Math.min(
        hit.unitPriceVnd * hit.qty,
        (hit.pointsDiscountVnd || 0) + take * hit.unitPriceVnd
      );
      left -= take;
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
  let deskRedeemCost = 0;
  let deskRedeemNote = "";
  const deskUnits = Math.max(0, Math.round(Number(opts.pointsRedeemUnits) || 0));
  if (deskUnits > 0) {
    const alreadyOff = finalItems.reduce(
      (s, i) =>
        s + Math.min(i.unitPriceVnd * i.qty, i.pointsDiscountVnd || 0),
      0
    );
    const applied = applyDeskRedeemUnits(finalItems, deskUnits, "drink");
    finalItems.length = 0;
    finalItems.push(...applied.items);
    extraPointsOff = Math.max(0, applied.discountVnd - alreadyOff);
    deskRedeemCost = applied.cost;
    deskRedeemNote = `Sử dụng ${applied.cost} điểm · ${applied.unitsApplied} đồ uống`;
    const payer = await prisma.appCustomer.findUnique({
      where: { id: cart.customerId },
      select: { pointsBalance: true },
    });
    if (applied.cost > 0 && (payer?.pointsBalance ?? 0) < applied.cost) {
      return {
        ok: false as const,
        error: `Không đủ điểm (cần ${applied.cost}, đang có ${payer?.pointsBalance ?? 0}).`,
        status: 400,
      };
    }
  }

  const redeemTier = Math.round(Number(opts.pointsRedeem?.tier) || 0);
  const redeemItemId = String(opts.pointsRedeem?.itemId || "").trim();
  if (!deskUnits && (redeemTier || redeemItemId)) {
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

  // Safety net: ensure QR đổi điểm (pointsRedeemQty / points-redeem-50) is on lines
  // before total / metadata / cộng điểm — phần đổi điểm không được cộng điểm.
  {
    const covered = coverDrinkCartPoints(finalItems, rawItems);
    finalItems.length = 0;
    finalItems.push(...covered);
  }

  const subtotalBeforeDiscount =
    orderItems.reduce((s, i) => s + i.unitPriceVnd * i.qty, 0) + extraTotal;
  let totalVnd = Math.max(0, cart.totalVnd + extraTotal - extraPointsOff);

  // Giỏ đã có dòng giảm gói → chỉ áp thêm trên gọi thêm; QR cũ → áp trên phần còn trả sau đổi điểm.
  const cartMemberDisc = cartHasMiaMembershipDiscount(rawItems);
  const memberBase = cartMemberDisc
    ? Math.max(0, extraTotal)
    : Math.max(
        0,
        subtotalBeforeDiscount -
          finalItems.reduce(
            (s, i) =>
              s + Math.min(i.unitPriceVnd * i.qty, i.pointsDiscountVnd || 0),
            0
          )
      );
  const memberQuote = quoteMiaOiVipDiscount({
    segment: cart.customer.segment,
    vipExpiresAt: cart.customer.vipExpiresAt,
    vipPlanLabel: cart.customer.vipPlanLabel,
    baseVnd: memberBase,
    noteSuffix: cartMemberDisc ? "gọi thêm" : undefined,
  });
  if (memberQuote.discountVnd > 0) {
    totalVnd = Math.max(0, totalVnd - memberQuote.discountVnd);
  }
  const membershipNote = memberQuote.note;

  let voucherNote = "";
  let voucherQuote = { offerId: "", title: "", discountVnd: 0 };
  const voucherOfferId = String(opts.voucherOfferId || "").trim();
  // Bỏ qua voucher Mía % cũ — quyền giảm đã gắn gói VIP.
  if (voucherOfferId && !isMiaOiMembershipVoucher(voucherOfferId)) {
    try {
      voucherQuote = await quoteDeskBillVoucher({
        customerId: cart.customerId,
        offerId: voucherOfferId,
        zone: "MIA_OI",
        baseVnd: totalVnd,
      });
      totalVnd = Math.max(0, totalVnd - voucherQuote.discountVnd);
      voucherNote = deskVoucherNote(voucherQuote);
    } catch (err) {
      return {
        ok: false as const,
        error: err instanceof Error ? err.message : "Không dùng được voucher.",
        status: voucherErrorStatus(err),
      };
    }
  }

  const order = await prisma.$transaction(async (tx) => {
    const created = await tx.appOrder.create({
      data: {
        customerId: cart.customerId,
        serviceId: service?.id || null,
        status: "CONFIRMED",
        source: "ZONE_DESK",
        createdByType: "STAFF",
        createdById: opts.staffUserId,
        totalVnd,
        note: [
          `Thanh toán QR ${cart.token.slice(0, 12)}…`,
          deskRedeemNote,
          membershipNote,
          voucherNote,
        ]
          .filter(Boolean)
          .join(" · "),
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
            ...(opts.deskBundleId ? { deskBundleId: opts.deskBundleId } : {}),
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
      const checkIns = await tx.appServiceEvent.findMany({
        where: {
          customerId: cart.customerId,
          serviceId: service.id,
          eventType: "SERVICE_USE",
          operationalStatus: "NEW",
        },
        orderBy: { createdAt: "desc" },
        take: 10,
      });
      for (const scan of checkIns) {
        const meta =
          scan.metadata &&
          typeof scan.metadata === "object" &&
          !Array.isArray(scan.metadata)
            ? (scan.metadata as Record<string, unknown>)
            : {};
        if (meta.cartToken !== cart.token) continue;
        await tx.appServiceEvent.update({
          where: { id: scan.id },
          data: {
            operationalStatus: "ACKNOWLEDGED",
            metadata: {
              ...meta,
              orderId: created.id,
              cartToken: cart.token,
              ticketVerified: true,
              closedBy: "desk_confirm_payment",
            },
          },
        });
      }
    }
    return created;
  });

  if (voucherQuote.offerId) {
    await consumeDeskBillVoucher({
      customerId: cart.customerId,
      offerId: voucherQuote.offerId,
      zone: "MIA_OI",
      staffUserId: opts.staffUserId,
      staffName: opts.staffName || "desk",
      baseVnd: totalVnd + voucherQuote.discountVnd,
      note: voucherNote,
    }).catch((err) => {
      console.error("[miaoi-confirm voucher]", err);
    });
  }

  const embeddedOfferIds = new Set<string>();
  for (const row of rawItems) {
    const id = String(row?.id || "");
    if (!id.startsWith("voucher-")) continue;
    for (const oid of id.slice("voucher-".length).split("+")) {
      const offerId = oid.trim();
      if (offerId && offerId !== voucherQuote.offerId) embeddedOfferIds.add(offerId);
    }
  }
  if (embeddedOfferIds.size) {
    const { isLimitedMembershipVoucher } = await import("@/lib/hhg-vouchers");
    const { consumeMembershipVoucherUse } = await import(
      "@/lib/membership-voucher-qty"
    );
    for (const offerId of embeddedOfferIds) {
      if (!isLimitedMembershipVoucher(offerId)) continue;
      await consumeMembershipVoucherUse(prisma, {
        customerId: cart.customerId,
        offerId,
      }).catch((err) => {
        console.error("[miaoi-confirm cart voucher]", err);
      });
    }
  }

  // Burn redeem first, then award only on unpaid remainder (đổi điểm không cộng điểm).
  let pointsBalance: number | null = null;
  if (deskRedeemCost > 0) {
    const burned = await redeemPoints({
      customerId: cart.customerId,
      cost: deskRedeemCost,
      refType: "APP_ORDER",
      refId: `redeem:${order.id}`,
      note: deskRedeemNote,
    });
    pointsBalance = burned.balance;
  } else if (extraPointsOff > 0) {
    const burned = await redeemPoints({
      customerId: cart.customerId,
      cost: REDEEM_TIER_DRINK,
      refType: "APP_ORDER",
      refId: `mia-extra:${order.id}`,
      note: `Đổi 50 điểm · món gọi thêm · ${redeemItemId}`,
    });
    pointsBalance = burned.balance;
  }

  const earnable = earnableVnd(finalItems);
  const pts = await awardPurchasePoints({
    customerId: cart.customerId,
    refType: "SERVICE_CART",
    refId: cart.id,
    subtotalVnd: earnable,
    note: `Mía Ơi · ${earnable}đ phần chưa đổi điểm`,
  }).catch((err) => {
    console.error("[miaoi-confirm points]", err);
    return null;
  });
  if (pts && typeof pts.balance === "number") {
    pointsBalance = pts.balance;
  } else if (pointsBalance == null) {
    const c = await prisma.appCustomer.findUnique({
      where: { id: cart.customerId },
      select: { pointsBalance: true },
    });
    pointsBalance = c?.pointsBalance ?? null;
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
    message: "Đã xác nhận thanh toán.",
  };
}
