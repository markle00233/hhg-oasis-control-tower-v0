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

function asMeta(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function scanAlreadyVerified(meta: Record<string, unknown>) {
  return meta.ticketVerified === true || typeof meta.orderId === "string";
}

/** Bỏ dòng đổi điểm trên vé mở lại, cộng lại số tiền đã giảm. */
function stripPointRedeem(items: unknown, totalVnd: number) {
  if (!Array.isArray(items)) {
    return { changed: false, items, totalVnd };
  }
  let restore = 0;
  let changed = false;
  const next = [];
  for (const row of items) {
    if (!row || typeof row !== "object") {
      next.push(row);
      continue;
    }
    const id = String((row as { id?: string }).id || "");
    if (!id.startsWith("points-redeem-")) {
      next.push(row);
      continue;
    }
    changed = true;
    const note = String((row as { note?: string }).note || "");
    const match = note.match(/(\d+)\s*đ/);
    if (match) restore += Number(match[1]) || 0;
  }
  return {
    changed,
    items: next,
    totalVnd: Math.max(0, Math.round(totalVnd) + restore),
  };
}

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

      const prevMeta = asMeta(scan.metadata);
      if (scanAlreadyVerified(prevMeta)) {
        throw Object.assign(new Error("Lần quét này đã xác thực vé rồi."), {
          status: 409,
        });
      }

      const dayStart = new Date();
      dayStart.setHours(0, 0, 0, 0);
      const siblings = await tx.appServiceEvent.findMany({
        where: {
          customerId: customer.id,
          serviceId: service.id,
          eventType: "SERVICE_USE",
          id: { not: scan.id },
          createdAt: { gte: dayStart },
        },
        select: { id: true, metadata: true },
      });
      if (siblings.some((e) => scanAlreadyVerified(asMeta(e.metadata)))) {
        throw Object.assign(new Error("Đơn đã xác thực. Không mua thêm."), {
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

      const cartToken =
        typeof prevMeta.cartToken === "string" ? prevMeta.cartToken : null;
      const cartsToUse = await tx.appServiceCart.findMany({
        where: cartToken
          ? { token: cartToken, customerId: customer.id, status: "OPEN" }
          : {
              customerId: customer.id,
              status: "OPEN",
              zoneCode: { in: ["OLYMPIC_POOL", "OLYMPIC"] },
            },
        select: { id: true },
      });
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
            accessoryDiscountVnd: priced.accessoryDiscountVnd,
            manualDiscountVnd: priced.manualDiscountVnd,
            placedBy: "desk",
            verifiedByUserId: gate.user.id,
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

      const closedScanIds = [scan.id];
      for (const sib of siblings) {
        const sibMeta = asMeta(sib.metadata);
        if (scanAlreadyVerified(sibMeta)) continue;
        await tx.appServiceEvent.update({
          where: { id: sib.id },
          data: {
            operationalStatus: "ACKNOWLEDGED",
            metadata: {
              ...sibMeta,
              ticketVerified: true,
              mergedIntoScanId: scan.id,
              verifiedAt: verifiedAt.toISOString(),
              orderId: order.id,
              totalVnd,
              items: metaItems,
            },
          },
        });
        closedScanIds.push(sib.id);
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
        closedScanIds,
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
      closedScanIds: result.closedScanIds,
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

    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const reopened = await prisma.$transaction(async (tx) => {
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

      const stripKeys = [
        "ticketVerified",
        "verifiedAt",
        "entryAt",
        "orderId",
        "totalVnd",
        "subtotalVnd",
        "accessoryDiscountVnd",
        "manualDiscountVnd",
        "placedBy",
        "verifiedByUserId",
        "items",
        "mergedIntoScanId",
        "usedCartIds",
      ];
      const stripMeta = (raw: Record<string, unknown>) => {
        const cleaned: Record<string, unknown> = { ...raw };
        for (const key of stripKeys) delete cleaned[key];
        return cleaned;
      };

      const siblings = await tx.appServiceEvent.findMany({
        where: {
          customerId,
          serviceId: service.id,
          eventType: "SERVICE_USE",
          id: { not: scan.id },
          createdAt: { gte: dayStart },
        },
        select: { id: true, metadata: true },
      });
      const cartIds = new Set<string>();
      const rememberCarts = (raw: unknown) => {
        if (!Array.isArray(raw)) return;
        for (const id of raw) {
          if (typeof id === "string" && id) cartIds.add(id);
        }
      };
      rememberCarts(meta.usedCartIds);
      const linkedSiblings = siblings.filter((sib) => {
        const sibMeta =
          sib.metadata && typeof sib.metadata === "object"
            ? (sib.metadata as Record<string, unknown>)
            : {};
        const sameOrder = !!orderId && sibMeta.orderId === orderId;
        const mergedHere = sibMeta.mergedIntoScanId === scan.id;
        if (!sameOrder && !mergedHere) return false;
        rememberCarts(sibMeta.usedCartIds);
        return true;
      });
      if (cartIds.size) {
        await tx.appServiceCart.updateMany({
          where: {
            id: { in: [...cartIds] },
            customerId,
            status: "USED",
          },
          data: { status: "OPEN" },
        });
      }

      const reopenedScanIds = [scan.id];
      for (const sib of linkedSiblings) {
        const sibMeta =
          sib.metadata && typeof sib.metadata === "object"
            ? (sib.metadata as Record<string, unknown>)
            : {};
        await tx.appServiceEvent.update({
          where: { id: sib.id },
          data: {
            operationalStatus: "NEW",
            metadata: stripMeta(sibMeta) as Prisma.InputJsonValue,
          },
        });
        reopenedScanIds.push(sib.id);
      }

      await tx.appServiceEvent.update({
        where: { id: scan.id },
        data: {
          operationalStatus: "NEW",
          metadata: stripMeta(meta) as Prisma.InputJsonValue,
        },
      });

      return { reopenedScanIds, orderId, cartIds: [...cartIds] };
    });

    if (reopened.cartIds.length) {
      const carts = await prisma.appServiceCart.findMany({
        where: { id: { in: reopened.cartIds }, customerId },
        select: { id: true, items: true, totalVnd: true },
      });
      for (const cart of carts) {
        const stripped = stripPointRedeem(cart.items, cart.totalVnd);
        if (!stripped.changed) continue;
        await prisma.appServiceCart.update({
          where: { id: cart.id },
          data: {
            items: stripped.items as Prisma.InputJsonValue,
            totalVnd: stripped.totalVnd,
          },
        });
      }
    }

    const { settlePointsOnCancel } = await import("@/lib/points-refund");
    const settled = await settlePointsOnCancel({
      customerId,
      refIds: [
        ...(reopened.orderId
          ? [
              reopened.orderId,
              `redeem:${reopened.orderId}`,
              `mia-extra:${reopened.orderId}`,
            ]
          : []),
        ...reopened.cartIds,
      ],
      note: "Hoàn điểm · undo xác thực",
    }).catch((err) => {
      console.error("[pool/orders undo points]", err);
      return null;
    });

    return NextResponse.json({
      ok: true,
      scanEventId,
      undone: true,
      reopenedScanIds: reopened.reopenedScanIds,
      pointsBalance: settled?.balance ?? null,
      pointsRefunded: settled?.refunded ?? 0,
      pointsClawed: settled?.clawed ?? 0,
    });
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
