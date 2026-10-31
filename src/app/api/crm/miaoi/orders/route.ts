import { NextRequest, NextResponse } from "next/server";
import { requireDeskZone } from "@/lib/auth";
import {
  applyDeskRedeemUnits,
  type RedeemableLine,
} from "@/lib/desk-point-redeem";
import {
  deskEventMeta,
  isOpenEmptyDeskShell,
} from "@/lib/desk-walkin-shell";
import { isMiaOiMembershipVoucher } from "@/lib/hhg-vouchers";
import { getMiaOiItem } from "@/lib/miaoi-menu";
import { quoteMiaOiVipDiscount } from "@/lib/olympic-membership";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import { awardPurchasePoints, redeemPoints } from "@/lib/points";
import {
  consumeDeskBillVoucher,
  deskVoucherNote,
  quoteDeskBillVoucher,
  voucherErrorStatus,
} from "@/lib/voucher-redeem";

export const dynamic = "force-dynamic";

type CartLine = { itemId: string; qty: number; useAltPrice?: boolean };

const eventMeta = deskEventMeta;

/**
 * Chỉ finalize đúng lần quét được chỉ định.
 * Có scanEventId mà không còn trống → null (không cướp Tạo đơn khác).
 */
async function findOpenShellToFinalize(opts: {
  customerId: string;
  scanEventId?: string;
  preferLatestWalkIn?: boolean;
}) {
  if (opts.scanEventId) {
    const named = await prisma.appServiceEvent.findFirst({
      where: {
        id: opts.scanEventId,
        customerId: opts.customerId,
        eventType: "SERVICE_USE",
      },
    });
    return named && isOpenEmptyDeskShell(named) ? named : null;
  }
  if (!opts.preferLatestWalkIn) return null;
  const scans = await prisma.appServiceEvent.findMany({
    where: {
      customerId: opts.customerId,
      eventType: "SERVICE_USE",
      operationalStatus: "NEW",
      createdAt: { gte: new Date(Date.now() - 18 * 60 * 60 * 1000) },
    },
    orderBy: { createdAt: "desc" },
    take: 8,
  });
  const shells = scans.filter(isOpenEmptyDeskShell);
  const walkIn = shells.find(
    (scan) => eventMeta(scan.metadata).source === "desk_walkin_order"
  );
  return walkIn || shells[0] || null;
}

/** Gắn đơn Mía vào lần quét đã tạo — không tạo thêm dòng lịch sử. */
async function finalizeShellWithMiaOrder(opts: {
  shellId: string;
  orderId: string;
  totalVnd: number;
  items: {
    name: string;
    qty: number;
    unitPriceVnd: number;
    itemId: string;
    pointsDiscountVnd: number;
    pointsRedeemTier: number | null;
  }[];
  pointsRedeemUnits: number;
  pointsRedeemCost: number;
  manualDiscountVnd?: number;
  manualDiscountNote?: string;
}) {
  const shell = await prisma.appServiceEvent.findUnique({
    where: { id: opts.shellId },
  });
  if (!shell) return null;
  const prev = eventMeta(shell.metadata);
  await prisma.appServiceEvent.update({
    where: { id: shell.id },
    data: {
      operationalStatus: "ACKNOWLEDGED",
      metadata: {
        ...prev,
        ticketVerified: true,
        orderId: opts.orderId,
        totalVnd: opts.totalVnd,
        placedBy: "desk",
        deskOrderZone: "MIA_OI",
        items: opts.items,
        pointsRedeemUnits: opts.pointsRedeemUnits,
        pointsRedeemCost: opts.pointsRedeemCost,
        ...(opts.manualDiscountVnd
          ? {
              manualDiscountVnd: opts.manualDiscountVnd,
              ...(opts.manualDiscountNote
                ? { manualDiscountNote: opts.manualDiscountNote }
                : {}),
            }
          : {}),
      },
    },
  });
  return shell.id;
}

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
    const note = String(body.note || "").trim().slice(0, 200);
    const manualRequest = Math.max(
      0,
      Math.round(Number(body.manualDiscountVnd) || 0)
    );
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

    if (manualRequest > 0 && !note) {
      return NextResponse.json(
        { error: "Nhập ghi chú cho khoản giảm giá." },
        { status: 400 }
      );
    }
    const manualDiscountVnd = Math.min(manualRequest, totalVnd);
    totalVnd = Math.max(0, totalVnd - manualDiscountVnd);
    const manualNote =
      manualDiscountVnd > 0
        ? `Giảm tay −${manualDiscountVnd.toLocaleString("vi-VN")}đ${
            note ? ` (${note})` : ""
          }`
        : "";

    const order = await prisma.appOrder.create({
      data: {
        customerId: customer.id,
        serviceId: service?.id || null,
        status: "CONFIRMED",
        totalVnd,
        note:
          [
            manualDiscountVnd > 0 ? manualNote : note,
            redeemNote,
            membershipNote,
            voucherNote,
          ]
            .filter(Boolean)
            .join(" · ") || null,
        createdByType: "STAFF",
        createdById: gate.user.id,
        source: "ZONE_DESK",
        items: {
          create: redeemed.items.map((i) => ({
            itemId: i.itemId,
            nameVi: i.nameVi || "",
            nameEn: i.nameEn ?? null,
            unitPriceVnd: i.unitPriceVnd,
            qty: i.qty,
          })),
        },
      },
      include: { items: true },
    });

    const metaItems = redeemed.items.map((i) => ({
      name: i.nameVi || "",
      qty: i.qty,
      unitPriceVnd: i.unitPriceVnd,
      itemId: i.itemId,
      pointsDiscountVnd: i.pointsDiscountVnd || 0,
      pointsRedeemTier: i.pointsRedeemTier || null,
    }));

    /**
     * - Mía-only: gắn món vào đúng lần Tạo đơn (cùng dòng trên bảng).
     * - Gộp với hồ (deskBundleId): tạo MIA_OI_ORDER + gắn bundle lên lần quét hồ.
     */
    const shellToFinish = deskBundleId
      ? null
      : await findOpenShellToFinalize({
          customerId: customer.id,
          scanEventId,
          preferLatestWalkIn: body.consumeWalkInShell === true && !scanEventId,
        });

    if (shellToFinish) {
      await finalizeShellWithMiaOrder({
        shellId: shellToFinish.id,
        orderId: order.id,
        totalVnd,
        items: metaItems,
        pointsRedeemUnits: redeemed.unitsApplied,
        pointsRedeemCost: redeemed.cost,
        ...(manualDiscountVnd > 0
          ? { manualDiscountVnd, manualDiscountNote: note }
          : {}),
      });
    } else if (service) {
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
            deskOrderZone: "MIA_OI",
            ...(deskBundleId ? { deskBundleId } : {}),
            items: metaItems,
            pointsRedeemUnits: redeemed.unitsApplied,
            pointsRedeemCost: redeemed.cost,
            ...(manualDiscountVnd > 0
              ? { manualDiscountVnd, manualDiscountNote: note }
              : {}),
          },
        },
      });
    }

    if (deskBundleId && scanEventId) {
      const poolScan = await prisma.appServiceEvent.findFirst({
        where: {
          id: scanEventId,
          customerId: customer.id,
          eventType: "SERVICE_USE",
        },
      });
      if (poolScan) {
        const prev = eventMeta(poolScan.metadata);
        await prisma.appServiceEvent.update({
          where: { id: poolScan.id },
          data: {
            metadata: {
              ...prev,
              deskBundleId,
              miaOrderId: order.id,
            },
          },
        });
      }
    }

    const [, , pts] = await Promise.all([
      writeAudit({
        actorType: "STAFF",
        actorId: gate.user.id,
        action: "ORDER_CREATE",
        entityType: "AppOrder",
        entityId: order.id,
        zoneCode: "MIA_OI",
        payload: { totalVnd, source: "ZONE_DESK" },
      }),
      voucherQuote.offerId
        ? consumeDeskBillVoucher({
            customerId: customer.id,
            offerId: voucherQuote.offerId,
            zone: "MIA_OI",
            staffUserId: gate.user.id,
            staffName: gate.user.displayName || gate.user.username,
            baseVnd: totalVnd + voucherQuote.discountVnd,
            note: voucherNote,
          }).catch((err) => {
            console.error("[miaoi/orders voucher]", err);
          })
        : Promise.resolve(null),
      (async () => {
        if (redeemed.cost > 0) {
          await redeemPoints({
            customerId: customer.id,
            cost: redeemed.cost,
            refType: "APP_ORDER" as const,
            refId: `redeem:${order.id}`,
            note: redeemNote,
          });
        }
        return awardPurchasePoints({
          customerId: customer.id,
          refType: "APP_ORDER",
          refId: order.id,
          subtotalVnd: totalVnd,
          note: `Mía Ơi desk · ${totalVnd}đ sau giảm`,
        }).catch((err) => {
          console.error("[miaoi/orders points]", err);
          return null;
        });
      })(),
    ]);

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
