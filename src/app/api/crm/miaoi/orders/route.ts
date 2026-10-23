import { NextRequest, NextResponse } from "next/server";
import { requireDeskZone } from "@/lib/auth";
import {
  applyDeskRedeemUnits,
  earnableVnd,
  type RedeemableLine,
} from "@/lib/desk-point-redeem";
import { isMiaOiMembershipVoucher } from "@/lib/hhg-vouchers";
import { getMiaOiItem } from "@/lib/miaoi-menu";
import { quoteMiaOiVipDiscount } from "@/lib/olympic-membership";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import { redeemPoints } from "@/lib/points";
import {
  consumeDeskBillVoucher,
  deskVoucherNote,
  quoteDeskBillVoucher,
  voucherErrorStatus,
} from "@/lib/voucher-redeem";

export const dynamic = "force-dynamic";

type CartLine = { itemId: string; qty: number; useAltPrice?: boolean };

/** Live Mía Ơi orders for desk (Mía Ơi zone or SYSTEM_ADMIN). */
export async function GET(req: NextRequest) {
  const gate = await requireDeskZone("MIA_OI");
  if ("error" in gate) return gate.error;

  const hours = Math.min(
    Math.max(Number(req.nextUrl.searchParams.get("hours") || 12) || 12, 1),
    72
  );
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);
  const status = req.nextUrl.searchParams.get("status");

  const orders = await prisma.appOrder.findMany({
    where: {
      createdAt: { gte: since },
      ...(status ? { status } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      items: true,
      customer: {
        select: {
          id: true,
          customerCode: true,
          fullName: true,
          phone: true,
          phoneLast4: true,
          shortId: true,
        },
      },
    },
  });

  return NextResponse.json({
    ok: true,
    hours,
    orders: orders.map((o) => ({
      id: o.id,
      status: o.status,
      totalVnd: o.totalVnd,
      note: o.note,
      createdAt: o.createdAt,
      updatedAt: o.updatedAt,
      customer: {
        id: o.customer.id,
        customerCode: o.customer.customerCode,
        fullName: o.customer.fullName,
        phone: o.customer.phone,
        shortId: o.customer.phoneLast4 || o.customer.shortId,
      },
      items: o.items.map((i) => ({
        id: i.id,
        itemId: i.itemId,
        nameVi: i.nameVi,
        nameEn: i.nameEn,
        unitPriceVnd: i.unitPriceVnd,
        qty: i.qty,
      })),
    })),
  });
}

/** Staff places order for a customer (phone only scan+confirm). */
export async function POST(req: NextRequest) {
  const gate = await requireDeskZone("MIA_OI");
  if ("error" in gate) return gate.error;

  try {
    const body = await req.json().catch(() => ({}));
    const customerId = String(body.customerId || "").trim();
    const lines = Array.isArray(body.items) ? (body.items as CartLine[]) : [];
    const note = String(body.note || "").trim().slice(0, 300);
    const deskBundleId = String(body.deskBundleId || "").trim().slice(0, 40);
    const scanEventId = String(body.scanEventId || "").trim();
    const pointsRedeemUnits = Math.max(
      0,
      Math.round(Number(body.pointsRedeemUnits) || 0)
    );
    const voucherOfferId = String(body.voucherOfferId || "").trim();

    if (!customerId) {
      return NextResponse.json({ error: "Thiếu customerId." }, { status: 400 });
    }
    if (!lines.length) {
      return NextResponse.json({ error: "Chọn ít nhất 1 món." }, { status: 400 });
    }

    const customer = await prisma.appCustomer.findUnique({
      where: { id: customerId },
    });
    if (!customer || customer.status !== "ACTIVE") {
      return NextResponse.json({ error: "Khách không hợp lệ." }, { status: 404 });
    }

    const service = await prisma.appService.findUnique({
      where: { serviceCode: "MIA_OI" },
    });

    const orderItems: (RedeemableLine & {
      nameVi: string;
      nameEn: string | null;
    })[] = [];

    let totalVnd = 0;
    for (const line of lines) {
      const qty = Math.min(Math.max(Number(line.qty) || 0, 0), 99);
      if (qty < 1) continue;
      const item = getMiaOiItem(String(line.itemId || ""));
      if (!item) continue;
      const unit =
        line.useAltPrice && item.priceAltVnd ? item.priceAltVnd : item.priceVnd;
      totalVnd += unit * qty;
      orderItems.push({
        itemId: item.id,
        nameVi: item.nameVi,
        nameEn: item.nameEn,
        unitPriceVnd: unit,
        qty,
      });
    }

    if (!orderItems.length) {
      return NextResponse.json({ error: "Giỏ hàng không hợp lệ." }, { status: 400 });
    }

    const redeemed = applyDeskRedeemUnits(
      orderItems,
      pointsRedeemUnits,
      "drink"
    );
    if (redeemed.cost > 0 && customer.pointsBalance < redeemed.cost) {
      return NextResponse.json(
        {
          error: `Không đủ điểm (cần ${redeemed.cost}, đang có ${customer.pointsBalance}).`,
        },
        { status: 400 }
      );
    }
    totalVnd = Math.max(0, totalVnd - redeemed.discountVnd);
    const redeemNote =
      redeemed.cost > 0
        ? `Sử dụng ${redeemed.cost} điểm · ${redeemed.unitsApplied} đồ uống`
        : "";

    const memberQuote = quoteMiaOiVipDiscount({
      segment: customer.segment,
      vipExpiresAt: customer.vipExpiresAt,
      vipPlanLabel: customer.vipPlanLabel,
      baseVnd: totalVnd,
    });
    if (memberQuote.discountVnd > 0) {
      totalVnd = Math.max(0, totalVnd - memberQuote.discountVnd);
    }
    const membershipNote = memberQuote.note;

    let voucherNote = "";
    let voucherQuote = { offerId: "", title: "", discountVnd: 0 };
    if (voucherOfferId && !isMiaOiMembershipVoucher(voucherOfferId)) {
      try {
        voucherQuote = await quoteDeskBillVoucher({
          customerId: customer.id,
          offerId: voucherOfferId,
          zone: "MIA_OI",
          baseVnd: totalVnd,
        });
        totalVnd = Math.max(0, totalVnd - voucherQuote.discountVnd);
        voucherNote = deskVoucherNote(voucherQuote);
      } catch (err) {
        return NextResponse.json(
          {
            error:
              err instanceof Error ? err.message : "Không dùng được voucher.",
          },
          { status: voucherErrorStatus(err) }
        );
      }
    }

    const order = await prisma.appOrder.create({
      data: {
        customerId: customer.id,
        serviceId: service?.id || null,
        status: "CONFIRMED",
        totalVnd,
        note:
          [note, redeemNote, membershipNote, voucherNote]
            .filter(Boolean)
            .join(" · ") || null,
        createdByType: "STAFF",
        createdById: gate.user.id,
        source: "ZONE_DESK",
        items: {
          create: redeemed.items.map((i) => ({
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

    if (service) {
      await prisma.appServiceEvent.create({
        data: {
          customerId: customer.id,
          serviceId: service.id,
          eventType: "MIA_OI_ORDER",
          operationalStatus: "ACKNOWLEDGED",
          metadata: {
            orderId: order.id,
            totalVnd,
            placedBy: "desk",
            ...(deskBundleId ? { deskBundleId } : {}),
            items: redeemed.items.map((i) => ({
              name: i.nameVi,
              qty: i.qty,
              unitPriceVnd: i.unitPriceVnd,
              itemId: i.itemId,
              pointsDiscountVnd: i.pointsDiscountVnd || 0,
              pointsRedeemTier: i.pointsRedeemTier || null,
            })),
            pointsRedeemUnits: redeemed.unitsApplied,
            pointsRedeemCost: redeemed.cost,
          },
        },
      });
    }

    if (scanEventId) {
      const scan = await prisma.appServiceEvent.findFirst({
        where: { id: scanEventId, customerId: customer.id },
      });
      if (scan) {
        const prev =
          scan.metadata && typeof scan.metadata === "object"
            ? (scan.metadata as Record<string, unknown>)
            : {};
        await prisma.appServiceEvent.update({
          where: { id: scan.id },
          data: {
            operationalStatus: "ACKNOWLEDGED",
            metadata: {
              ...prev,
              ticketVerified: true,
              orderId: order.id,
              totalVnd,
              items: redeemed.items.map((i) => ({
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
    }

    await writeAudit({
      actorType: "STAFF",
      actorId: gate.user.id,
      action: "ORDER_CREATE",
      entityType: "AppOrder",
      entityId: order.id,
      zoneCode: "MIA_OI",
      payload: { totalVnd, source: "ZONE_DESK" },
    });

    if (voucherQuote.offerId) {
      await consumeDeskBillVoucher({
        customerId: customer.id,
        offerId: voucherQuote.offerId,
        zone: "MIA_OI",
        staffUserId: gate.user.id,
        staffName: gate.user.displayName || gate.user.username,
        baseVnd: totalVnd + voucherQuote.discountVnd,
        note: voucherNote,
      }).catch((err) => {
        console.error("[miaoi/orders voucher]", err);
      });
    }

    if (redeemed.cost > 0) {
      await redeemPoints({
        customerId: customer.id,
        cost: redeemed.cost,
        refType: "APP_ORDER",
        refId: `redeem:${order.id}`,
        note: redeemNote,
      });
    }

    const { awardPurchasePoints } = await import("@/lib/points");
    const pts = await awardPurchasePoints({
      customerId: customer.id,
      refType: "APP_ORDER",
      refId: order.id,
      subtotalVnd: earnableVnd(redeemed.items),
      note: `Mía Ơi desk · ${earnableVnd(redeemed.items)}đ phần chưa đổi điểm`,
    }).catch((err) => {
      console.error("[miaoi/orders points]", err);
      return null;
    });

    return NextResponse.json({
      ok: true,
      pointsAwarded: pts?.delta ?? 0,
      pointsBalance: pts?.balance ?? null,
      order: {
        id: order.id,
        status: order.status,
        totalVnd: order.totalVnd,
        createdAt: order.createdAt,
        items: order.items.map((i) => ({
          itemId: i.itemId,
          nameVi: i.nameVi,
          nameEn: i.nameEn,
          unitPriceVnd: i.unitPriceVnd,
          qty: i.qty,
        })),
      },
    });
  } catch (e) {
    console.error("[crm/miaoi/orders POST]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Order failed" },
      { status: 500 }
    );
  }
}
