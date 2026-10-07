import { NextRequest, NextResponse } from "next/server";
import { requireDeskZone } from "@/lib/auth";
import { getMiaOiItem } from "@/lib/miaoi-menu";
import { prisma } from "@/lib/prisma";

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

    const order = await prisma.appOrder.create({
      data: {
        customerId: customer.id,
        serviceId: service?.id || null,
        status: "PENDING",
        totalVnd,
        note: note || null,
        items: { create: orderItems },
      },
      include: { items: true },
    });

    if (service) {
      await prisma.appServiceEvent.create({
        data: {
          customerId: customer.id,
          serviceId: service.id,
          eventType: "MIA_OI_ORDER",
          metadata: {
            orderId: order.id,
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

    return NextResponse.json({
      ok: true,
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
