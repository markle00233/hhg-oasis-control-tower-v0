import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { requireDeskZone } from "@/lib/auth";
import { confirmOlympicPoolScan } from "@/lib/olympic-confirm-scan";
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
    const redeemUnits = Math.max(
      0,
      Math.round(Number(body.pointsRedeemUnits) || 0)
    );
    const voucherOfferId = String(body.voucherOfferId || "").trim();

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

    const result = await confirmOlympicPoolScan({
      customerId,
      scanEventId,
      items: lines,
      staffUserId: gate.user.id,
      note,
      redeemUnits,
      voucherOfferId,
      staffName: gate.user.displayName || gate.user.username,
    });
    if (!result.ok) {
      return NextResponse.json(
        {
          error: result.error,
          ...(result.membershipLocked ? { membershipLocked: true } : {}),
        },
        { status: result.status }
      );
    }

    return NextResponse.json({
      ok: true,
      pointsAwarded: result.pointsAwarded,
      pointsBalance: result.pointsBalance,
      scanEventId: result.scanEventId,
      closedScanIds: result.closedScanIds,
      entryAt: result.entryAt,
      membership: result.membership,
      order: result.order,
      orderSummary: result.orderSummary,
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
        "membershipDiscountVnd",
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
