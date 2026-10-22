import { NextRequest, NextResponse } from "next/server";
import { requireDeskZone } from "@/lib/auth";
import { getSpaItem } from "@/lib/spa-menu";
import { consumeGoiBonus } from "@/lib/swim-goi-bonus";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type CartLine = { itemId: string; qty: number; useAltPrice?: boolean };

type SpaOrderLine = {
  itemId: string;
  nameVi: string;
  nameEn: string | null;
  unitPriceVnd: number;
  qty: number;
};

/** Staff changed the customer's QR order — write the same lines onto the cart and any scan/order already tied to it. */
async function reviseSpaGuestCart(args: {
  cartToken: string;
  customerId: string;
  orderItems: SpaOrderLine[];
  finalize?: boolean;
  staffId?: string;
  serviceId?: string | null;
}) {
  const cart = await prisma.appServiceCart.findUnique({
    where: { token: args.cartToken },
  });
  if (!cart || cart.customerId !== args.customerId) {
    return NextResponse.json({ error: "Không thấy đơn QR." }, { status: 404 });
  }
  if (cart.zoneCode !== "SPA" && cart.zoneCode !== "SAUNA") {
    return NextResponse.json(
      { error: "Đơn không thuộc Oasis Spa." },
      { status: 400 }
    );
  }
  const visitDone = (cart.adminNote || "").trim() === "Đã dùng";
  const canRevise =
    cart.status === "OPEN" ||
    cart.status === "PENDING_APPROVAL" ||
    (cart.status === "USED" && !visitDone);
  if (!canRevise) {
    return NextResponse.json(
      { error: "Đơn đã chốt, không sửa được." },
      { status: 409 }
    );
  }

  const prev = Array.isArray(cart.items)
    ? (cart.items as Record<string, unknown>[])
    : [];
  const kept = prev.filter((row) => {
    const id = String(row.id || "");
    return id.startsWith("voucher-") || id.startsWith("points-redeem-");
  });
  const serviceLines = args.orderItems.map((line) => {
    const menu = getSpaItem(line.itemId);
    return {
      id: line.itemId,
      nameVi: line.nameVi,
      qty: line.qty,
      priceVnd: line.unitPriceVnd,
      ...(menu?.note ? { note: menu.note } : {}),
    };
  });
  const items = [...serviceLines, ...kept];
  const keptTotal = kept.reduce((sum, row) => {
    const qty = Math.max(1, Number(row.qty) || 1);
    const price = Math.max(0, Number(row.priceVnd) || 0);
    return sum + price * qty;
  }, 0);
  const totalVnd =
    args.orderItems.reduce((sum, line) => sum + line.unitPriceVnd * line.qty, 0) +
    keptTotal;

  const linkedByToken = await prisma.appServiceEvent.findMany({
    where: {
      customerId: args.customerId,
      metadata: { path: ["cartToken"], equals: args.cartToken },
    },
  });
  const orderIds = [
    ...new Set(
      linkedByToken
        .map((event) => {
          const meta =
            event.metadata && typeof event.metadata === "object"
              ? (event.metadata as Record<string, unknown>)
              : {};
          return typeof meta.orderId === "string" ? meta.orderId : "";
        })
        .filter(Boolean)
    ),
  ];
  const linkedByOrder = orderIds.length
    ? await prisma.appServiceEvent.findMany({
        where: {
          customerId: args.customerId,
          OR: orderIds.map((orderId) => ({
            metadata: { path: ["orderId"], equals: orderId },
          })),
        },
      })
    : [];
  const events = new Map<string, (typeof linkedByToken)[number]>();
  for (const event of [...linkedByToken, ...linkedByOrder]) {
    events.set(event.id, event);
  }

  const metaItems = serviceLines.map((line) => ({
    name: line.nameVi,
    qty: line.qty,
    unitPriceVnd: line.priceVnd,
    itemId: line.id,
  }));

  const liveOrderIds: string[] = [];
  await prisma.$transaction(async (tx) => {
    await tx.appServiceCart.update({
      where: { id: cart.id },
      data: {
        items,
        totalVnd,
        ...(args.finalize ? { status: "USED" } : {}),
      },
    });
    for (const orderId of orderIds) {
      const order = await tx.appOrder.findUnique({ where: { id: orderId } });
      if (!order || order.status === "CANCELLED") continue;
      liveOrderIds.push(orderId);
      await tx.appOrderItem.deleteMany({ where: { orderId } });
      await tx.appOrder.update({
        where: { id: orderId },
        data: {
          totalVnd,
          ...(args.finalize ? { status: "CONFIRMED" } : {}),
          items: {
            create: args.orderItems.map((line) => ({
              itemId: line.itemId,
              nameVi: line.nameVi,
              nameEn: line.nameEn,
              unitPriceVnd: line.unitPriceVnd,
              qty: line.qty,
            })),
          },
        },
      });
    }
    if (args.finalize && liveOrderIds.length === 0) {
      const created = await tx.appOrder.create({
        data: {
          customerId: args.customerId,
          serviceId: args.serviceId || null,
          status: "CONFIRMED",
          totalVnd,
          createdByType: "STAFF",
          createdById: args.staffId || null,
          source: "ZONE_DESK",
          items: {
            create: args.orderItems.map((line) => ({
              itemId: line.itemId,
              nameVi: line.nameVi,
              nameEn: line.nameEn,
              unitPriceVnd: line.unitPriceVnd,
              qty: line.qty,
            })),
          },
        },
      });
      liveOrderIds.push(created.id);
      if (args.serviceId) {
        await tx.appServiceEvent.create({
          data: {
            customerId: args.customerId,
            serviceId: args.serviceId,
            eventType: "SPA_ORDER",
            operationalStatus: "ACKNOWLEDGED",
            metadata: {
              orderId: created.id,
              totalVnd,
              placedBy: "desk",
              cartToken: args.cartToken,
              ticketVerified: true,
              items: metaItems,
            },
          },
        });
      }
    }
    const confirmedOrderId = liveOrderIds[0] || null;
    if (args.finalize) {
      await consumeGoiBonus(tx, {
        customerId: args.customerId,
        items: args.orderItems,
        refId: args.cartToken,
        staffId: args.staffId,
      });
    }
    for (const event of events.values()) {
      const prevMeta =
        event.metadata && typeof event.metadata === "object"
          ? (event.metadata as Record<string, unknown>)
          : {};
      await tx.appServiceEvent.update({
        where: { id: event.id },
        data: {
          ...(args.finalize ? { operationalStatus: "ACKNOWLEDGED" } : {}),
          metadata: {
            ...prevMeta,
            cartToken: args.cartToken,
            totalVnd,
            items: metaItems,
            ...(args.finalize
              ? {
                  ticketVerified: true,
                  ...(confirmedOrderId ? { orderId: confirmedOrderId } : {}),
                }
              : {}),
          },
        },
      });
    }
  });

  return NextResponse.json({
    ok: true,
    revised: true,
    finalized: !!args.finalize,
    pointsAwarded: 0,
    pointsBalance: null,
    totalVnd,
    items,
    order: liveOrderIds[0]
      ? { id: liveOrderIds[0], status: "ACCEPTED", totalVnd }
      : null,
  });
}

/** Staff books spa service for a customer (desk SPA / SAUNA zone). */
export async function POST(req: NextRequest) {
  const gate = await requireDeskZone("SAUNA");
  if ("error" in gate) return gate.error;

  try {
    const body = await req.json().catch(() => ({}));
    const customerId = String(body.customerId || "").trim();
    const lines = Array.isArray(body.items) ? (body.items as CartLine[]) : [];
    const note = String(body.note || "").trim().slice(0, 300);
    const scanEventId = String(body.scanEventId || "").trim();
    const cartToken = String(body.cartToken || "").trim();

    if (!customerId) {
      return NextResponse.json({ error: "Thiếu customerId." }, { status: 400 });
    }
    if (!lines.length) {
      return NextResponse.json(
        { error: "Chọn ít nhất 1 dịch vụ." },
        { status: 400 }
      );
    }

    const customer = await prisma.appCustomer.findUnique({
      where: { id: customerId },
    });
    if (!customer || customer.status !== "ACTIVE") {
      return NextResponse.json({ error: "Khách không hợp lệ." }, { status: 404 });
    }

    const service = await prisma.appService.findUnique({
      where: { serviceCode: "SAUNA" },
    });

    const orderItems: {
      itemId: string;
      nameVi: string;
      nameEn: string | null;
      unitPriceVnd: number;
      qty: number;
    }[] = [];

    let totalVnd = 0;
    for (const line of lines) {
      const qty = Math.min(Math.max(Number(line.qty) || 0, 0), 99);
      if (qty < 1) continue;
      const item = getSpaItem(String(line.itemId || ""));
      if (!item) continue;
      const unit =
        line.useAltPrice && item.priceAltVnd ? item.priceAltVnd : item.priceVnd;
      totalVnd += unit * qty;
      orderItems.push({
        itemId: item.id,
        nameVi: item.nameVi,
        nameEn: item.nameEn || null,
        unitPriceVnd: unit,
        qty,
      });
    }

    if (!orderItems.length) {
      return NextResponse.json(
        { error: "Danh sách dịch vụ không hợp lệ." },
        { status: 400 }
      );
    }

    if (cartToken) {
      return reviseSpaGuestCart({
        cartToken,
        customerId: customer.id,
        orderItems,
        finalize: body.finalize === true,
        staffId: gate.user.id,
        serviceId: service?.id || null,
      });
    }

    const order = await prisma.$transaction(async (tx) => {
      const created = await tx.appOrder.create({
        data: {
          customerId: customer.id,
          serviceId: service?.id || null,
          status: "ACCEPTED",
          totalVnd,
          note: note || null,
          createdByType: "STAFF",
          createdById: gate.user.id,
          source: "ZONE_DESK",
          items: { create: orderItems },
        },
        include: { items: true },
      });
      await consumeGoiBonus(tx, {
        customerId: customer.id,
        items: orderItems,
        refId: created.id,
        staffId: gate.user.id,
      });
      if (service) {
        await tx.appServiceEvent.create({
          data: {
            customerId: customer.id,
            serviceId: service.id,
            eventType: "SPA_ORDER",
            metadata: {
              orderId: created.id,
              totalVnd,
              placedBy: "desk",
              items: orderItems.map((i) => ({
                name: i.nameVi,
                qty: i.qty,
                unitPriceVnd: i.unitPriceVnd,
              })),
            },
          },
        });
      }
      if (scanEventId) {
        const scan = await tx.appServiceEvent.findFirst({
          where: { id: scanEventId, customerId: customer.id },
        });
        if (scan) {
          const prev =
            scan.metadata && typeof scan.metadata === "object"
              ? (scan.metadata as Record<string, unknown>)
              : {};
          await tx.appServiceEvent.update({
            where: { id: scan.id },
            data: {
              operationalStatus: "ACKNOWLEDGED",
              metadata: {
                ...prev,
                ticketVerified: true,
                orderId: created.id,
                totalVnd,
                items: orderItems.map((i) => ({
                  name: i.nameVi,
                  qty: i.qty,
                  unitPriceVnd: i.unitPriceVnd,
                  itemId: i.itemId,
                })),
              },
            },
          });
        }
      }
      return created;
    });

    // Điểm chỉ cộng ở Mía Ơi + Hồ Olympic — Spa không cộng.
    return NextResponse.json({
      ok: true,
      pointsAwarded: 0,
      pointsBalance: null,
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
    console.error("[crm/spa/orders POST]", e);
    const status =
      e && typeof e === "object" && "status" in e
        ? Number((e as { status: number }).status) || 500
        : 500;
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Order failed" },
      { status: status >= 400 && status < 600 ? status : 500 }
    );
  }
}
