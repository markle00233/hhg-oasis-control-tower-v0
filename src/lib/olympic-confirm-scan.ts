import { packageIdFromVipPlanLabel } from "@/lib/hhg-vouchers";
import {
  applyOlympicMembership,
  isOlympicMembershipActive,
  labelForOlympicPackage,
  pickPrimaryOlympicPackage,
} from "@/lib/olympic-membership";
import {
  applyDeskRedeemUnits,
  isDeskRedeemTicket,
} from "@/lib/desk-point-redeem";
import {
  deskEventMeta,
  deskScanAlreadyFinalized,
} from "@/lib/desk-walkin-shell";
import { awardPurchasePoints, redeemPoints } from "@/lib/points";
import { computePoolPricing } from "@/lib/pool-pricing";
import { isPoolDayTicket } from "@/lib/olympic-pool-menu";
import { prisma } from "@/lib/prisma";
import { isSameDayMembershipEligible } from "@/lib/same-day-membership";
import { consumePoolSwimBonus } from "@/lib/swim-goi-bonus";
import {
  consumeDeskBillVoucher,
  deskVoucherNote,
  quoteDeskBillVoucher,
  voucherErrorStatus,
} from "@/lib/voucher-redeem";

export type PoolCartLine = { itemId: string; qty: number };

const asMeta = deskEventMeta;
const scanAlreadyVerified = deskScanAlreadyFinalized;

/** Product lines on a cart. Discount, voucher, and staff stamps are not a second purchase. */
function sellableCartQty(items: unknown) {
  const qty = new Map<string, number>();
  if (!Array.isArray(items)) return qty;
  for (const row of items) {
    if (!row || typeof row !== "object") continue;
    const rec = row as { id?: string; qty?: number };
    const id = String(rec.id || "");
    if (
      !id ||
      id.startsWith("__") ||
      id.startsWith("disc-") ||
      id.startsWith("voucher-") ||
      id.startsWith("points-redeem-")
    ) {
      continue;
    }
    const q = Math.max(0, Math.round(Number(rec.qty) || 0));
    if (q <= 0) continue;
    qty.set(id, (qty.get(id) || 0) + q);
  }
  return qty;
}

/** Vé khách đã đổi trên QR — không đốt điểm lần nữa ở quầy. */
function coverPoolCartPoints(
  orderItems: {
    itemId: string;
    qty: number;
    unitPriceVnd: number;
    pointsDiscountVnd: number;
    pointsRedeemTier: number | null;
  }[],
  cartItems: unknown
) {
  if (!Array.isArray(cartItems)) return;
  const byId = new Map<string, number>();
  let explicit = 0;
  let legacy = 0;
  for (const row of cartItems) {
    if (!row || typeof row !== "object") continue;
    const rec = row as { id?: string; qty?: number; pointsRedeemQty?: number };
    const id = String(rec.id || "");
    if (id.startsWith("points-redeem-100")) {
      legacy = Math.max(legacy, Math.round(Number(rec.qty) || 1));
      continue;
    }
    const qty = Math.max(0, Math.round(Number(rec.qty) || 0));
    const redeemed = Math.min(
      qty,
      Math.max(0, Math.round(Number(rec.pointsRedeemQty) || 0))
    );
    if (redeemed > 0 && isDeskRedeemTicket(id)) {
      byId.set(id, (byId.get(id) || 0) + redeemed);
      explicit += redeemed;
    }
  }
  if (explicit > 0) {
    for (const line of orderItems) {
      const want = byId.get(line.itemId) || 0;
      if (want <= 0 || line.unitPriceVnd <= 0) continue;
      const take = Math.min(line.qty, want);
      line.pointsDiscountVnd = take * line.unitPriceVnd;
      line.pointsRedeemTier = 100;
      byId.set(line.itemId, want - take);
    }
    return;
  }
  let left = legacy;
  for (const line of orderItems) {
    if (left <= 0) break;
    if (!isDeskRedeemTicket(line.itemId) || line.unitPriceVnd <= 0) continue;
    const take = Math.min(line.qty, left);
    line.pointsDiscountVnd = take * line.unitPriceVnd;
    line.pointsRedeemTier = 100;
    left -= take;
  }
}

export type OlympicConfirmOk = {
  ok: true;
  already: boolean;
  pointsAwarded: number;
  pointsBalance: number | null;
  scanEventId: string;
  closedScanIds: string[];
  entryAt: Date;
  order: {
    id: string;
    status: string;
    totalVnd: number;
    createdAt: Date;
    items: {
      itemId: string;
      nameVi: string;
      nameEn: string | null;
      unitPriceVnd: number;
      qty: number;
    }[];
  };
  orderSummary: string;
  /** Gói trong đơn đã có trên tài khoản — không tạo đơn trùng. */
  packageAlreadyActive?: boolean;
  membership: {
    planLabel: string;
    expiresAt: Date;
    vouchersGranted: string[];
  } | null;
};

export type OlympicConfirmFail = {
  ok: false;
  error: string;
  status: number;
  membershipLocked?: boolean;
};

/** Xác thực vé Hồ Olympic trên 1 lần quét. Giỏ OPEN mới vẫn chốt được dù hôm nay đã có đơn. */
export async function confirmOlympicPoolScan(opts: {
  customerId: string;
  scanEventId: string;
  items: PoolCartLine[];
  staffUserId: string;
  note?: string;
  /** Giảm tay (VND), sau khuyến mãi vé. Cần note khi > 0. */
  manualDiscountVnd?: number;
  redeemUnits?: number;
  voucherOfferId?: string;
  staffName?: string;
  deskBundleId?: string;
}): Promise<OlympicConfirmOk | OlympicConfirmFail> {
  const customerId = opts.customerId.trim();
  const scanEventId = opts.scanEventId.trim();
  const lines = opts.items;
  const note = String(opts.note || "").trim().slice(0, 200);
  const manualDiscountVnd = Math.max(
    0,
    Math.round(Number(opts.manualDiscountVnd) || 0)
  );

  if (manualDiscountVnd > 0 && !note) {
    return {
      ok: false,
      error: "Nhập ghi chú cho khoản giảm giá.",
      status: 400,
    };
  }

  if (!customerId || !scanEventId) {
    return { ok: false, error: "Thiếu customerId hoặc lần quét.", status: 400 };
  }
  if (!lines.length) {
    return { ok: false, error: "Chọn ít nhất 1 vé.", status: 400 };
  }

  let billLines = lines;
  const requestedPkg = pickPrimaryOlympicPackage(lines.map((line) => line.itemId));
  if (requestedPkg) {
    const holder = await prisma.appCustomer.findUnique({
      where: { id: customerId },
      select: {
        segment: true,
        vipExpiresAt: true,
        vipPlanLabel: true,
      },
    });
    const currentId = packageIdFromVipPlanLabel(holder?.vipPlanLabel);
    if (
      holder &&
      isOlympicMembershipActive({
        segment: holder.segment,
        vipExpiresAt: holder.vipExpiresAt,
      })
    ) {
      if (currentId && currentId !== requestedPkg) {
        const exp = holder.vipExpiresAt
          ? holder.vipExpiresAt.toLocaleDateString("vi-VN")
          : null;
        return {
          ok: false,
          status: 409,
          membershipLocked: true,
          error: exp
            ? `Khách đang dùng ${holder.vipPlanLabel || "gói hội viên"} đến ${exp}. Hết hạn mới được chọn gói mới.`
            : "Khách đang dùng gói hội viên. Hết hạn mới được chọn gói mới.",
        };
      }
      billLines = lines.filter((line) => line.itemId !== requestedPkg);
      if (!billLines.length) {
        return {
          ok: true,
          already: true,
          pointsAwarded: 0,
          pointsBalance: null,
          scanEventId,
          closedScanIds: [],
          entryAt: new Date(),
          packageAlreadyActive: true,
          order: {
            id: "",
            status: "CONFIRMED",
            totalVnd: 0,
            createdAt: new Date(),
            items: [],
          },
          orderSummary: "Gói đã gắn trên tài khoản khách",
          membership: {
            planLabel:
              holder.vipPlanLabel || labelForOlympicPackage(requestedPkg),
            expiresAt: holder.vipExpiresAt || new Date(),
            vouchersGranted: [],
          },
        };
      }
    }
  }

  const sameDayMembership =
    billLines.some((line) => isPoolDayTicket(line.itemId)) ||
    (await isSameDayMembershipEligible(prisma, { id: customerId }));
  const priced = computePoolPricing(billLines, {
    sameDayMembership,
    manualDiscountVnd,
  });
  if (!priced.lines.length) {
    return { ok: false, error: "Danh sách vé không hợp lệ.", status: 400 };
  }
  const orderItems = priced.lines.map((l) => ({
    itemId: l.itemId,
    nameVi: l.nameVi,
    nameEn: l.nameEn,
    unitPriceVnd: l.unitPriceVnd,
    qty: l.qty,
    pointsDiscountVnd: 0,
    pointsRedeemTier: null as number | null,
  }));
  const scanHead = await prisma.appServiceEvent.findFirst({
    where: { id: scanEventId, customerId, eventType: "SERVICE_USE" },
    select: { metadata: true },
  });
  const linkedToken =
    typeof asMeta(scanHead?.metadata).cartToken === "string"
      ? String(asMeta(scanHead?.metadata).cartToken)
      : "";
  const linkedCart = linkedToken
    ? await prisma.appServiceCart.findFirst({
        where: { token: linkedToken, customerId, status: "OPEN" },
        select: { items: true },
      })
    : await prisma.appServiceCart.findFirst({
        where: {
          customerId,
          status: "OPEN",
          zoneCode: { in: ["OLYMPIC_POOL", "OLYMPIC"] },
        },
        orderBy: { createdAt: "desc" },
        select: { items: true },
      });
  coverPoolCartPoints(orderItems, linkedCart?.items);
  const redeemed = applyDeskRedeemUnits(
    orderItems,
    opts.redeemUnits || 0,
    "ticket"
  );
  const redeemNote =
    redeemed.cost > 0
      ? `Sử dụng ${redeemed.cost} điểm · ${redeemed.unitsApplied} vé bơi`
      : "";
  let totalVnd = Math.max(0, priced.totalVnd - redeemed.discountVnd);
  const subtotalVnd = priced.subtotalVnd;
  let voucherNote = "";
  let voucherQuote = { offerId: "", title: "", discountVnd: 0 };
  const voucherOfferId = String(opts.voucherOfferId || "").trim();
  if (voucherOfferId) {
    try {
      voucherQuote = await quoteDeskBillVoucher({
        customerId,
        offerId: voucherOfferId,
        zone: "OLYMPIC_POOL",
        baseVnd: totalVnd,
      });
      totalVnd = Math.max(0, totalVnd - voucherQuote.discountVnd);
      voucherNote = deskVoucherNote(voucherQuote);
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : "Không dùng được voucher.",
        status: voucherErrorStatus(err),
      };
    }
  }

  const service = await prisma.appService.findUnique({
    where: { serviceCode: "OLYMPIC_POOL" },
    select: { id: true },
  });
  if (!service) {
    return { ok: false, error: "Chưa cấu hình dịch vụ OLYMPIC_POOL.", status: 500 };
  }

  if (redeemed.cost > 0) {
    const payer = await prisma.appCustomer.findUnique({
      where: { id: customerId },
      select: { pointsBalance: true, status: true },
    });
    if (!payer || payer.status !== "ACTIVE") {
      return { ok: false, error: "Khách không hợp lệ.", status: 404 };
    }
    if (payer.pointsBalance < redeemed.cost) {
      return {
        ok: false,
        error: `Không đủ điểm (cần ${redeemed.cost}, đang có ${payer.pointsBalance}).`,
        status: 400,
      };
    }
  }

  const pkgIdEarly = pickPrimaryOlympicPackage(orderItems.map((i) => i.itemId));
  if (pkgIdEarly) {
    const existing = await prisma.appCustomer.findUnique({
      where: { id: customerId },
      select: {
        segment: true,
        vipExpiresAt: true,
        vipPlanLabel: true,
        status: true,
      },
    });
    if (!existing || existing.status !== "ACTIVE") {
      return { ok: false, error: "Khách không hợp lệ.", status: 404 };
    }
    if (
      isOlympicMembershipActive({
        segment: existing.segment,
        vipExpiresAt: existing.vipExpiresAt,
      })
    ) {
      const exp = existing.vipExpiresAt
        ? existing.vipExpiresAt.toLocaleDateString("vi-VN")
        : null;
      return {
        ok: false,
        status: 409,
        membershipLocked: true,
        error: exp
          ? `Khách đang dùng ${existing.vipPlanLabel || "gói hội viên"} đến ${exp}. Hết hạn mới được chọn gói mới.`
          : "Khách đang dùng gói hội viên. Hết hạn mới được chọn gói mới.",
      };
    }
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const customer = await tx.appCustomer.findUnique({
        where: { id: customerId },
        select: {
          id: true,
          status: true,
          fullName: true,
          phone: true,
          phoneLast4: true,
          shortId: true,
        },
      });
      if (!customer || customer.status !== "ACTIVE") {
        throw Object.assign(new Error("Khách không hợp lệ."), { status: 404 });
      }

      const scan = await tx.appServiceEvent.findFirst({
        where: {
          id: scanEventId,
          customerId: customer.id,
          eventType: "SERVICE_USE",
        },
      });
      if (!scan) {
        throw Object.assign(new Error("Không tìm thấy lần quét này."), {
          status: 404,
        });
      }
      if (scan.serviceId !== service.id) {
        await tx.appServiceEvent.update({
          where: { id: scan.id },
          data: { serviceId: service.id },
        });
      }

      const prevMeta = asMeta(scan.metadata);
      if (scanAlreadyVerified(prevMeta)) {
        const orderId =
          typeof prevMeta.orderId === "string" ? prevMeta.orderId : "";
        const existingOrder = orderId
          ? await tx.appOrder.findUnique({
              where: { id: orderId },
              include: { items: true },
            })
          : null;
        return { already: true as const, customer, scan, existingOrder, prevMeta };
      }

      const dayStart = new Date();
      dayStart.setHours(0, 0, 0, 0);
      /** Chỉ gộp lần quét hồ cùng dịch vụ còn trống — không đụng đơn Tạo đơn khác. */
      const siblings = await tx.appServiceEvent.findMany({
        where: {
          customerId: customer.id,
          serviceId: service.id,
          eventType: "SERVICE_USE",
          operationalStatus: "NEW",
          id: { not: scan.id },
          createdAt: { gte: dayStart },
        },
        select: { id: true, metadata: true },
      });

      const cartToken =
        typeof prevMeta.cartToken === "string" ? prevMeta.cartToken : null;
      const orderQty = new Map<string, number>();
      for (const item of orderItems) {
        orderQty.set(
          item.itemId,
          (orderQty.get(item.itemId) || 0) + item.qty
        );
      }
      /**
       * A walk-in scan often has its own cart token. That used to leave the
       * customer's approved gói cart OPEN while this order copied the same lines.
       */
      const openCarts = await tx.appServiceCart.findMany({
        where: {
          customerId: customer.id,
          status: "OPEN",
          OR: [
            { zoneCode: { in: ["OLYMPIC_POOL", "OLYMPIC", "MIA_OLYMPIC", "VIP", "VIP_RESORT"] } },
            ...(cartToken ? [{ token: cartToken }] : []),
          ],
        },
        select: { id: true, token: true, items: true },
      });
      const cartsToUse = openCarts.filter((cart) => {
        if (cartToken && cart.token === cartToken) return true;
        const qty = sellableCartQty(cart.items);
        if (qty.size === 0) return false;
        for (const [id, q] of qty) {
          if ((orderQty.get(id) || 0) < q) return false;
        }
        return true;
      });
      const verifiedAt = new Date();
      const discountParts: string[] = [];
      if (priced.accessoryDiscountVnd > 0) {
        discountParts.push(
          `phụ kiện −10% (−${priced.accessoryDiscountVnd.toLocaleString("vi-VN")}đ)`
        );
      }
      if (priced.membershipDiscountVnd > 0) {
        discountParts.push(
          `gói tháng −10% cùng ngày với đơn Olympic (−${priced.membershipDiscountVnd.toLocaleString("vi-VN")}đ)`
        );
      }
      if (priced.manualDiscountVnd > 0) {
        discountParts.push(
          `giảm tay −${priced.manualDiscountVnd.toLocaleString("vi-VN")}đ`
        );
      }
      const discountNote = discountParts.length
        ? ` · ${discountParts.join(" · ")}`
        : "";

      const order = await tx.appOrder.create({
        data: {
          customerId: customer.id,
          serviceId: service.id,
          status: "CONFIRMED",
          createdByType: "STAFF",
          createdById: opts.staffUserId,
          totalVnd,
          note:
            (note || `Xác thực lúc quét ${scan.createdAt.toISOString()}`) +
            discountNote +
            (redeemNote ? ` · ${redeemNote}` : "") +
            (voucherNote ? ` · ${voucherNote}` : ""),
          items: {
            create: orderItems.map((i) => ({
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

      const metaItems = redeemed.items.map((i) => ({
        name: i.nameVi,
        qty: i.qty,
        unitPriceVnd: i.unitPriceVnd,
        itemId: i.itemId,
        pointsDiscountVnd: i.pointsDiscountVnd || 0,
        pointsRedeemTier: i.pointsRedeemTier || null,
      }));
      const usedCartIds = cartsToUse.map((c) => c.id);

      await tx.appServiceEvent.update({
        where: { id: scan.id },
        data: {
          operationalStatus: "ACKNOWLEDGED",
          metadata: {
            ...prevMeta,
            ticketVerified: true,
            verifiedAt: verifiedAt.toISOString(),
            entryAt: scan.createdAt.toISOString(),
            orderId: order.id,
            usedCartIds,
            totalVnd,
            subtotalVnd,
            pointsRedeemUnits: redeemed.unitsApplied,
            pointsRedeemCost: redeemed.cost,
            accessoryDiscountVnd: priced.accessoryDiscountVnd,
            membershipDiscountVnd: priced.membershipDiscountVnd,
            manualDiscountVnd: priced.manualDiscountVnd,
            ...(priced.manualDiscountVnd > 0 && note
              ? { manualDiscountNote: note }
              : {}),
            placedBy: "desk",
            verifiedByUserId: opts.staffUserId,
            ...(opts.staffName && opts.staffName !== "desk"
              ? { staffName: opts.staffName }
              : {}),
            ...(opts.deskBundleId ? { deskBundleId: opts.deskBundleId } : {}),
            items: metaItems,
          },
        },
      });

      if (usedCartIds.length) {
        await tx.appServiceCart.updateMany({
          where: { id: { in: usedCartIds } },
          data: { status: "USED" },
        });
      }

      await consumePoolSwimBonus(tx, {
        customerId: customer.id,
        items: orderItems,
        refId: order.id,
        staffId: opts.staffUserId,
      });

      const closedScanIds = [scan.id];
      for (const sib of siblings) {
        const sibMeta = asMeta(sib.metadata);
        if (scanAlreadyVerified(sibMeta)) continue;
        /** Không đụng Tạo đơn khác — mỗi lần Tạo đơn là 1 visit riêng. */
        if (sibMeta.source === "desk_walkin_order") continue;
        /** Gộp lần quét QR/shared trống trùng ngày, tránh dòng "Chưa có order" thừa. */
        const empty =
          !Array.isArray(sibMeta.items) || sibMeta.items.length === 0;
        await tx.appServiceEvent.update({
          where: { id: sib.id },
          data: {
            operationalStatus: "ACKNOWLEDGED",
            metadata: {
              ...sibMeta,
              ...(empty
                ? {
                    walkInConsumed: true,
                    consumedByOrderId: order.id,
                    mergedIntoScanId: scan.id,
                  }
                : {
                    ticketVerified: true,
                    mergedIntoScanId: scan.id,
                    verifiedAt: verifiedAt.toISOString(),
                    orderId: order.id,
                    totalVnd,
                    items: metaItems,
                    ...(opts.deskBundleId
                      ? { deskBundleId: opts.deskBundleId }
                      : {}),
                  }),
            },
          },
        });
        closedScanIds.push(sib.id);
      }

      return {
        already: false as const,
        customer,
        scan,
        order,
        metaItems,
        totalVnd,
        subtotalVnd,
        accessoryDiscountVnd: priced.accessoryDiscountVnd,
        membershipDiscountVnd: priced.membershipDiscountVnd,
        manualDiscountVnd: priced.manualDiscountVnd,
        packageItemIds: orderItems.map((i) => i.itemId),
        closedScanIds,
      };
    });

    if (result.already) {
      const order = result.existingOrder;
      const items = order?.items || [];
      const summaryFromMeta = Array.isArray(result.prevMeta.items)
        ? (result.prevMeta.items as { qty?: number; name?: string }[])
            .map((i) => `${i.qty || 1}× ${i.name || "vé"}`)
            .join(", ")
        : "";
      return {
        ok: true,
        already: true,
        pointsAwarded: 0,
        pointsBalance: null,
        scanEventId: result.scan.id,
        closedScanIds: [result.scan.id],
        entryAt: result.scan.createdAt,
        order: order
          ? {
              id: order.id,
              status: order.status,
              totalVnd: order.totalVnd,
              createdAt: order.createdAt,
              items: items.map((i) => ({
                itemId: i.itemId,
                nameVi: i.nameVi,
                nameEn: i.nameEn,
                unitPriceVnd: i.unitPriceVnd,
                qty: i.qty,
              })),
            }
          : {
              id: "",
              status: "CONFIRMED",
              totalVnd: 0,
              createdAt: result.scan.createdAt,
              items: [],
            },
        orderSummary:
          summaryFromMeta ||
          items.map((i) => `${i.qty}× ${i.nameVi}`).join(", "),
        membership: null,
      };
    }

    const pkgId = pickPrimaryOlympicPackage(result.packageItemIds);
    let membership: OlympicConfirmOk["membership"] = null;
    if (pkgId) {
      const applied = await applyOlympicMembership(prisma, {
        customerId: result.customer.id,
        packageId: pkgId,
        from: result.order.createdAt,
      }).catch((err) => {
        console.error("[olympic-confirm membership]", err);
        return null;
      });
      if (applied && !applied.alreadyActive) {
        membership = {
          planLabel: applied.vipPlanLabel,
          expiresAt: applied.vipExpiresAt,
          vouchersGranted: applied.offerIds,
        };
      }
    }

    if (voucherQuote.offerId) {
      await consumeDeskBillVoucher({
        customerId: result.customer.id,
        offerId: voucherQuote.offerId,
        zone: "OLYMPIC_POOL",
        staffUserId: opts.staffUserId,
        staffName: opts.staffName || "desk",
        baseVnd: totalVnd + voucherQuote.discountVnd,
        note: voucherNote,
      }).catch((err) => {
        console.error("[olympic-confirm voucher]", err);
      });
    }

    if (redeemed.cost > 0) {
      await redeemPoints({
        customerId: result.customer.id,
        cost: redeemed.cost,
        refType: "APP_ORDER",
        refId: `redeem:${result.order.id}`,
        note: redeemNote,
      });
    }

    const pts = await awardPurchasePoints({
      customerId: result.customer.id,
      refType: "APP_ORDER",
      refId: result.order.id,
      subtotalVnd: totalVnd,
      note: `Hồ Olympic · ${totalVnd}đ sau giảm`,
    }).catch((err) => {
      console.error("[olympic-confirm points]", err);
      return null;
    });

    return {
      ok: true,
      already: false,
      pointsAwarded: pts?.delta ?? 0,
      pointsBalance: pts?.balance ?? null,
      scanEventId: result.scan.id,
      closedScanIds: result.closedScanIds,
      entryAt: result.scan.createdAt,
      order: {
        id: result.order.id,
        status: result.order.status,
        totalVnd: result.order.totalVnd,
        createdAt: result.order.createdAt,
        items: result.order.items.map((i) => ({
          itemId: i.itemId,
          nameVi: i.nameVi,
          nameEn: i.nameEn,
          unitPriceVnd: i.unitPriceVnd,
          qty: i.qty,
        })),
      },
      orderSummary: result.metaItems
        .map((i) => `${i.qty}× ${i.name}`)
        .join(", "),
      membership,
    };
  } catch (e) {
    const status =
      e && typeof e === "object" && "status" in e
        ? Number((e as { status: number }).status) || 500
        : 500;
    return {
      ok: false,
      status,
      error: e instanceof Error ? e.message : "Không xác thực được",
    };
  }
}
