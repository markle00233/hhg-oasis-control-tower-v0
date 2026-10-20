import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { requireDeskZone } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { settlePointsOnCancel } from "@/lib/points-refund";

export const dynamic = "force-dynamic";

const ALLOWED = new Set(["PENDING", "PREPARING", "DONE", "CANCELLED"]);

function metaOrderId(metadata: unknown) {
  if (!metadata || typeof metadata !== "object") return null;
  const id = (metadata as { orderId?: unknown }).orderId;
  return typeof id === "string" ? id : null;
}

function metaCartToken(metadata: unknown) {
  if (!metadata || typeof metadata !== "object") return null;
  const token = (metadata as { cartToken?: unknown }).cartToken;
  return typeof token === "string" ? token : null;
}

const STRIP_KEYS = [
  "ticketVerified",
  "verifiedAt",
  "entryAt",
  "orderId",
  "totalVnd",
  "subtotalVnd",
  "paidAt",
  "items",
  "usedCartIds",
];

function vnDayStart(now = new Date()) {
  const day = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  return new Date(`${day}T00:00:00+07:00`);
}

function stripOrderMeta(metadata: unknown): Prisma.InputJsonValue {
  const raw =
    metadata && typeof metadata === "object"
      ? { ...(metadata as Record<string, unknown>) }
      : {};
  const orderId = typeof raw.orderId === "string" ? raw.orderId : "";
  for (const key of STRIP_KEYS) delete raw[key];
  if (orderId) raw.cancelledOrderId = orderId;
  raw.orderCancelled = true;
  return raw as Prisma.InputJsonValue;
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const gate = await requireDeskZone("MIA_OI");
  if ("error" in gate) return gate.error;

  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const status = String(body.status || "").toUpperCase();
  if (!ALLOWED.has(status)) {
    return NextResponse.json({ error: "Trạng thái không hợp lệ." }, { status: 400 });
  }

  const existing = await prisma.appOrder.findUnique({
    where: { id },
    select: { id: true, status: true, customerId: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Không tìm thấy đơn." }, { status: 404 });
  }

  let pointsBalance: number | null = null;
  let pointsRefunded = 0;
  let pointsClawed = 0;
  if (status === "CANCELLED" && existing.status !== "CANCELLED") {
    const events = await prisma.appServiceEvent.findMany({
      where: {
        customerId: existing.customerId,
        createdAt: { gte: vnDayStart() },
      },
      select: { id: true, metadata: true },
    });
    const linked = events.filter((event) => metaOrderId(event.metadata) === id);
    const tokens = new Set<string>();
    const cartIdSet = new Set<string>();
    for (const event of linked) {
      const token = metaCartToken(event.metadata);
      if (token) tokens.add(token);
      const used = (event.metadata as { usedCartIds?: unknown } | null)
        ?.usedCartIds;
      if (Array.isArray(used)) {
        for (const cartId of used) {
          if (typeof cartId === "string" && cartId) cartIdSet.add(cartId);
        }
      }
    }
    const cartOr: { token?: { in: string[] }; id?: { in: string[] } }[] = [];
    if (tokens.size) cartOr.push({ token: { in: [...tokens] } });
    if (cartIdSet.size) cartOr.push({ id: { in: [...cartIdSet] } });
    const carts = cartOr.length
      ? await prisma.appServiceCart.findMany({
          where: { customerId: existing.customerId, OR: cartOr },
          select: { id: true },
        })
      : [];
    const settled = await settlePointsOnCancel({
      customerId: existing.customerId,
      refIds: [
        id,
        `mia-extra:${id}`,
        `redeem:${id}`,
        ...carts.map((c) => c.id),
      ],
      note: "Hoàn điểm · huỷ đơn Mía Ơi",
    });
    pointsBalance = settled.balance;
    pointsRefunded = settled.refunded;
    pointsClawed = settled.clawed;
    if (carts.length) {
      await prisma.appServiceCart.updateMany({
        where: {
          id: { in: carts.map((c) => c.id) },
          customerId: existing.customerId,
          status: { in: ["USED", "OPEN", "PENDING_APPROVAL"] },
        },
        data: { status: "CANCELLED", adminNote: "Quầy huỷ đơn" },
      });
    }
    for (const event of linked) {
      await prisma.appServiceEvent.update({
        where: { id: event.id },
        data: {
          operationalStatus: "NEW",
          metadata: stripOrderMeta(event.metadata),
        },
      });
    }
  }

  const order = await prisma.appOrder.update({
    where: { id },
    data: { status },
    include: {
      items: true,
      customer: {
        select: {
          fullName: true,
          phone: true,
          customerCode: true,
        },
      },
    },
  });

  return NextResponse.json({
    ok: true,
    order,
    pointsBalance,
    pointsRefunded,
    pointsClawed,
  });
}
