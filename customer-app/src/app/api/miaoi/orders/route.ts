import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionCustomer } from "@/lib/session";
import { getMiaOiItem } from "@/lib/miaoi-menu";

export const preferredRegion = "sin1";
export const dynamic = "force-dynamic";

type CartLine = { itemId: string; qty: number; useAltPrice?: boolean };

const RECENT_CHECKIN_MS = 4 * 60 * 60 * 1000; // must have checked in Mía Ơi within 4h

/**
 * Customer self-order for Mía Ơi (same AppOrder model as staff desk).
 * Requires session + recent SERVICE_USE at MIA_OI.
 */
export async function POST(req: NextRequest) {
  try {
    const customer = await getSessionCustomer();
    if (!customer) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const lines = Array.isArray(body.items) ? (body.items as CartLine[]) : [];
    const note = String(body.note || "").trim().slice(0, 300);
    const idempotencyKey = String(
      body.idempotencyKey || req.headers.get("idempotency-key") || ""
    )
      .trim()
      .slice(0, 120);

    if (!lines.length) {
      return NextResponse.json({ error: "Chọn ít nhất 1 món." }, { status: 400 });
    }

    if (idempotencyKey) {
      const existing = await prisma.appOrder.findUnique({
        where: { idempotencyKey },
        include: { items: true },
      });
      if (existing && existing.customerId === customer.id) {
        return NextResponse.json({ ok: true, duplicate: true, order: existing });
      }
    }

    const service = await prisma.appService.findUnique({
      where: { serviceCode: "MIA_OI" },
    });
    if (!service) {
      return NextResponse.json({ error: "Khu Mía Ơi chưa cấu hình." }, { status: 500 });
    }

    const since = new Date(Date.now() - RECENT_CHECKIN_MS);
    const recentUse = await prisma.appServiceEvent.findFirst({
      where: {
        customerId: customer.id,
        serviceId: service.id,
        eventType: "SERVICE_USE",
        createdAt: { gte: since },
        operationalStatus: { notIn: ["CANCELLED", "WRONG_SCAN"] },
      },
      orderBy: { createdAt: "desc" },
    });
    if (!recentUse) {
      return NextResponse.json(
        {
          error:
            "Bạn cần quét QR Mía Ơi và check-in trước khi gọi món trên app.",
        },
        { status: 403 }
      );
    }

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
        serviceId: service.id,
        serviceUseId: recentUse.id,
        status: "SUBMITTED",
        totalVnd,
        note: note || null,
        createdByType: "CUSTOMER",
        createdById: customer.id,
        source: "CUSTOMER_APP",
        idempotencyKey: idempotencyKey || null,
        items: { create: orderItems },
      },
      include: { items: true },
    });

    await prisma.appServiceEvent.create({
      data: {
        customerId: customer.id,
        serviceId: service.id,
        deviceId: recentUse.deviceId,
        eventType: "MIA_OI_ORDER",
        operationalStatus: "ACKNOWLEDGED",
        metadata: {
          orderId: order.id,
          totalVnd,
          placedBy: "customer",
          items: orderItems.map((i) => ({
            name: i.nameVi,
            qty: i.qty,
            unitPriceVnd: i.unitPriceVnd,
          })),
        },
      },
    });

    return NextResponse.json({
      ok: true,
      order: {
        id: order.id,
        status: order.status,
        totalVnd: order.totalVnd,
        createdAt: order.createdAt,
        items: order.items,
      },
    });
  } catch (e) {
    console.error("[customer miaoi/orders]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Order failed" },
      { status: 500 }
    );
  }
}
