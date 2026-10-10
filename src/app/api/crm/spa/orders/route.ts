import { NextRequest, NextResponse } from "next/server";
import { requireDeskZone } from "@/lib/auth";
import { getSpaItem } from "@/lib/spa-menu";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type CartLine = { itemId: string; qty: number; useAltPrice?: boolean };

/** Staff books spa service for a customer (desk SPA / SAUNA zone). */
export async function POST(req: NextRequest) {
  const gate = await requireDeskZone("SAUNA");
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
          eventType: "SPA_ORDER",
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
    console.error("[crm/spa/orders POST]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Order failed" },
      { status: 500 }
    );
  }
}
