import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { requireDeskZone } from "@/lib/auth";
import { getPoolItem } from "@/lib/olympic-pool-menu";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type CartLine = { itemId: string; qty: number };

async function olympicService() {
  return prisma.appService.findUnique({
    where: { serviceCode: "OLYMPIC_POOL" },
    select: { id: true },
  });
}

/**
 * Xác thực vé Hồ Olympic gắn vào 1 lần quét (SERVICE_USE).
 * Không tạo thêm dòng lịch sử — cập nhật metadata của scan đó.
 */
export async function POST(req: NextRequest) {
  const gate = await requireDeskZone("OLYMPIC_POOL");
  if ("error" in gate) return gate.error;

  try {
    const body = await req.json().catch(() => ({}));
    const customerId = String(body.customerId || "").trim();
    const scanEventId = String(body.scanEventId || "").trim();
    const lines = Array.isArray(body.items) ? (body.items as CartLine[]) : [];
    const note = String(body.note || "").trim().slice(0, 300);

    if (!customerId || !scanEventId) {
      return NextResponse.json(
        { error: "Thiếu customerId hoặc lần quét." },
        { status: 400 }
      );
    }
    if (!lines.length) {
      return NextResponse.json(
        { error: "Chọn ít nhất 1 vé." },
        { status: 400 }
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
      const item = getPoolItem(String(line.itemId || ""));
      if (!item) continue;
      totalVnd += item.priceVnd * qty;
      orderItems.push({
        itemId: item.id,
        nameVi: item.nameVi,
        nameEn: item.nameEn || null,
        unitPriceVnd: item.priceVnd,
        qty,
      });
    }
    if (!orderItems.length) {
      return NextResponse.json(
        { error: "Danh sách vé không hợp lệ." },
        { status: 400 }
      );
    }

    const service = await olympicService();
    if (!service) {
      return NextResponse.json(
        { error: "Chưa cấu hình dịch vụ OLYMPIC_POOL." },
        { status: 500 }
      );
    }

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
          serviceId: service.id,
          eventType: "SERVICE_USE",
        },
      });
      if (!scan) {
        throw Object.assign(new Error("Không tìm thấy lần quét này."), {
          status: 404,
        });
      }

      const prevMeta =
        scan.metadata && typeof scan.metadata === "object"
          ? (scan.metadata as Record<string, unknown>)
          : {};
      if (prevMeta.ticketVerified === true || prevMeta.orderId) {
        throw Object.assign(new Error("Lần quét này đã xác thực vé rồi."), {
          status: 409,
        });
      }

      const verifiedAt = new Date();
      const order = await tx.appOrder.create({
        data: {
          customerId: customer.id,
          serviceId: service.id,
          status: "CONFIRMED",
          totalVnd,
          note: note || `Xác thực lúc quét ${scan.createdAt.toISOString()}`,
          items: { create: orderItems },
        },
        include: { items: true },
      });

      const metaItems = orderItems.map((i) => ({
        name: i.nameVi,
        qty: i.qty,
        unitPriceVnd: i.unitPriceVnd,
        itemId: i.itemId,
      }));

      await tx.appServiceEvent.update({
        where: { id: scan.id },
        data: {
          metadata: {
            ...prevMeta,
            ticketVerified: true,
            verifiedAt: verifiedAt.toISOString(),
            entryAt: scan.createdAt.toISOString(),
            orderId: order.id,
            totalVnd,
            placedBy: "desk",
            verifiedByUserId: gate.user.id,
            items: metaItems,
          },
        },
      });

      return { customer, scan, order, metaItems, totalVnd };
    });

    return NextResponse.json({
      ok: true,
      scanEventId: result.scan.id,
      entryAt: result.scan.createdAt,
      customer: {
        fullName: result.customer.fullName,
        phone: result.customer.phone,
        shortId: result.customer.phoneLast4 || result.customer.shortId,
      },
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
    });
  } catch (e) {
    const status =
      e && typeof e === "object" && "status" in e
        ? Number((e as { status: number }).status) || 500
        : 500;
    if (status < 500) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "Order failed" },
        { status }
      );
    }
    console.error("[crm/pool/orders POST]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Order failed" },
      { status: 500 }
    );
  }
}

/** Undo xác thực vé — gỡ metadata + hủy đơn gắn với lần quét. */
export async function DELETE(req: NextRequest) {
  const gate = await requireDeskZone("OLYMPIC_POOL");
  if ("error" in gate) return gate.error;

  try {
    const body = await req.json().catch(() => ({}));
    const customerId = String(body.customerId || "").trim();
    const scanEventId = String(body.scanEventId || "").trim();
    if (!customerId || !scanEventId) {
      return NextResponse.json(
        { error: "Thiếu customerId hoặc lần quét." },
        { status: 400 }
      );
    }

    const service = await olympicService();
    if (!service) {
      return NextResponse.json(
        { error: "Chưa cấu hình dịch vụ OLYMPIC_POOL." },
        { status: 500 }
      );
    }

    await prisma.$transaction(async (tx) => {
      const scan = await tx.appServiceEvent.findFirst({
        where: {
          id: scanEventId,
          customerId,
          serviceId: service.id,
          eventType: "SERVICE_USE",
        },
      });
      if (!scan) {
        throw Object.assign(new Error("Không tìm thấy lần quét này."), {
          status: 404,
        });
      }

      const meta =
        scan.metadata && typeof scan.metadata === "object"
          ? (scan.metadata as Record<string, unknown>)
          : {};
      const orderId = typeof meta.orderId === "string" ? meta.orderId : null;
      if (!meta.ticketVerified && !orderId) {
        throw Object.assign(new Error("Lần quét chưa xác thực."), {
          status: 400,
        });
      }

      if (orderId) {
        await tx.appOrderItem.deleteMany({ where: { orderId } });
        await tx.appOrder.deleteMany({
          where: { id: orderId, customerId },
        });
      }

      const cleaned: Record<string, unknown> = { ...meta };
      for (const key of [
        "ticketVerified",
        "verifiedAt",
        "entryAt",
        "orderId",
        "totalVnd",
        "placedBy",
        "verifiedByUserId",
        "items",
      ]) {
        delete cleaned[key];
      }

      await tx.appServiceEvent.update({
        where: { id: scan.id },
        data: {
          metadata: cleaned as Prisma.InputJsonValue,
        },
      });
    });

    return NextResponse.json({ ok: true, scanEventId, undone: true });
  } catch (e) {
    const status =
      e && typeof e === "object" && "status" in e
        ? Number((e as { status: number }).status) || 500
        : 500;
    if (status < 500) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "Undo failed" },
        { status }
      );
    }
    console.error("[crm/pool/orders DELETE]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Undo failed" },
      { status: 500 }
    );
  }
}
