import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { requireDeskZone } from "@/lib/auth";
import {
  applyOlympicMembership,
  isOlympicMembershipActive,
  pickPrimaryOlympicPackage,
} from "@/lib/olympic-membership";
import { computePoolPricing } from "@/lib/pool-pricing";
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
    const manualDiscountVnd = Math.max(
      0,
      Math.round(Number(body.manualDiscountVnd) || 0)
    );

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

    const priced = computePoolPricing(lines, { manualDiscountVnd });
    if (!priced.lines.length) {
      return NextResponse.json(
        { error: "Danh sách vé không hợp lệ." },
        { status: 400 }
      );
    }
    const orderItems = priced.lines.map((l) => ({
      itemId: l.itemId,
      nameVi: l.nameVi,
      nameEn: l.nameEn,
      unitPriceVnd: l.unitPriceVnd,
      qty: l.qty,
    }));
    const totalVnd = priced.totalVnd;
    const subtotalVnd = priced.subtotalVnd;

    const service = await olympicService();
    if (!service) {
      return NextResponse.json(
        { error: "Chưa cấu hình dịch vụ OLYMPIC_POOL." },
        { status: 500 }
      );
    }

    const pkgIdEarly = pickPrimaryOlympicPackage(
      orderItems.map((i) => i.itemId)
    );
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
        return NextResponse.json(
          { error: "Khách không hợp lệ." },
          { status: 404 }
        );
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
        return NextResponse.json(
          {
            error: exp
              ? `Khách đang dùng ${existing.vipPlanLabel || "gói hội viên"} đến ${exp}. Hết hạn mới được chọn gói mới.`
              : "Khách đang dùng gói hội viên. Hết hạn mới được chọn gói mới.",
            membershipLocked: true,
          },
          { status: 409 }
        );
      }
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
      const discountParts: string[] = [];
      if (priced.accessoryDiscountVnd > 0) {
        discountParts.push(
          `phụ kiện −10% (−${priced.accessoryDiscountVnd.toLocaleString("vi-VN")}đ)`
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
          totalVnd,
          note:
            (note || `Xác thực lúc quét ${scan.createdAt.toISOString()}`) +
            discountNote,
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
          operationalStatus: "ACKNOWLEDGED",
          metadata: {
            ...prevMeta,
            ticketVerified: true,
            verifiedAt: verifiedAt.toISOString(),
            entryAt: scan.createdAt.toISOString(),
            orderId: order.id,
            totalVnd,
            subtotalVnd,
            accessoryDiscountVnd: priced.accessoryDiscountVnd,
            manualDiscountVnd: priced.manualDiscountVnd,
            placedBy: "desk",
            verifiedByUserId: gate.user.id,
            items: metaItems,
          },
        },
      });

      // Mark guest cart QR as used (chống trôi — đã check-in)
      const cartToken =
        typeof prevMeta.cartToken === "string" ? prevMeta.cartToken : null;
      if (cartToken) {
        await tx.appServiceCart.updateMany({
          where: {
            token: cartToken,
            customerId: customer.id,
            status: "OPEN",
          },
          data: { status: "USED" },
        });
      } else {
        await tx.appServiceCart.updateMany({
          where: {
            customerId: customer.id,
            status: "OPEN",
            zoneCode: { in: ["OLYMPIC_POOL", "OLYMPIC"] },
          },
          data: { status: "USED" },
        });
      }

      return {
        customer,
        scan,
        order,
        metaItems,
        totalVnd,
        subtotalVnd,
        accessoryDiscountVnd: priced.accessoryDiscountVnd,
        manualDiscountVnd: priced.manualDiscountVnd,
        packageItemIds: orderItems.map((i) => i.itemId),
      };
    });

    const pkgId = pickPrimaryOlympicPackage(result.packageItemIds);
    let membership: {
      vipPlanLabel: string;
      vipExpiresAt: Date;
      offerIds: string[];
    } | null = null;
    if (pkgId) {
      const applied = await applyOlympicMembership(prisma, {
        customerId: result.customer.id,
        packageId: pkgId,
      }).catch((err) => {
        console.error("[pool/orders membership]", err);
        return null;
      });
      if (applied && !applied.alreadyActive) {
        membership = applied;
      }
    }

    const { awardPurchasePoints } = await import("@/lib/points");
    const pts = await awardPurchasePoints({
      customerId: result.customer.id,
      refType: "APP_ORDER",
      refId: result.order.id,
      subtotalVnd: result.subtotalVnd,
      note: `Hồ Olympic · ${result.subtotalVnd}đ trước giảm`,
    }).catch((err) => {
      console.error("[pool/orders points]", err);
      return null;
    });

    return NextResponse.json({
      ok: true,
      pointsAwarded: pts?.delta ?? 0,
      pointsBalance: pts?.balance ?? null,
      scanEventId: result.scan.id,
      entryAt: result.scan.createdAt,
      pricing: {
        subtotalVnd: result.subtotalVnd,
        accessoryDiscountVnd: result.accessoryDiscountVnd,
        manualDiscountVnd: result.manualDiscountVnd,
        totalVnd: result.totalVnd,
      },
      membership: membership
        ? {
            planLabel: membership.vipPlanLabel,
            expiresAt: membership.vipExpiresAt,
            vouchersGranted: membership.offerIds,
          }
        : null,
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
