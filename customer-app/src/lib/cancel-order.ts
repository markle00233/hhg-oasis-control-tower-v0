import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { settlePointsOnCancel } from "./points";

const CANCELLABLE_ZONES = new Set(["MIA_OI", "OLYMPIC_POOL", "OLYMPIC"]);

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
  "mergedIntoScanId",
];

function vnDayKey(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function vnDayStart(now = new Date()) {
  return new Date(`${vnDayKey(now)}T00:00:00+07:00`);
}

function asMeta(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function stripOrderMeta(metadata: unknown): Prisma.InputJsonValue {
  const raw = { ...asMeta(metadata) };
  const orderId = typeof raw.orderId === "string" ? raw.orderId : "";
  for (const key of STRIP_KEYS) delete raw[key];
  if (orderId) raw.cancelledOrderId = orderId;
  raw.orderCancelled = true;
  return raw as Prisma.InputJsonValue;
}

export class CancelOrderError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/** Khách huỷ đơn Mía Ơi / Hồ Olympic đã xác nhận trong hôm nay. Hoàn điểm đã đổi, thu điểm đã cộng. */
export async function cancelCustomerOrder(customerId: string, orderId: string) {
  const order = await prisma.appOrder.findFirst({
    where: { id: orderId, customerId },
    include: { service: { select: { serviceCode: true } } },
  });
  if (!order) {
    throw new CancelOrderError("Không tìm thấy đơn.", 404);
  }
  const zone = String(order.service?.serviceCode || "").toUpperCase();
  if (!CANCELLABLE_ZONES.has(zone)) {
    throw new CancelOrderError(
      "Chỉ huỷ được đơn Mía Ơi hoặc Hồ Olympic.",
      400
    );
  }
  if (order.status === "CANCELLED") {
    const customer = await prisma.appCustomer.findUnique({
      where: { id: customerId },
      select: { pointsBalance: true },
    });
    return {
      already: true as const,
      pointsBalance: customer?.pointsBalance ?? 0,
      pointsRefunded: 0,
      pointsClawed: 0,
    };
  }
  if (vnDayKey(order.createdAt) !== vnDayKey(new Date())) {
    throw new CancelOrderError("Chỉ huỷ được đơn trong hôm nay.", 400);
  }

  const events = await prisma.appServiceEvent.findMany({
    where: { customerId, createdAt: { gte: vnDayStart() } },
    select: { id: true, metadata: true },
  });
  const linked = events.filter(
    (event) => asMeta(event.metadata).orderId === orderId
  );
  const tokens = new Set<string>();
  const cartIdSet = new Set<string>();
  for (const event of linked) {
    const meta = asMeta(event.metadata);
    if (typeof meta.cartToken === "string" && meta.cartToken) {
      tokens.add(meta.cartToken);
    }
    if (Array.isArray(meta.usedCartIds)) {
      for (const id of meta.usedCartIds) {
        if (typeof id === "string" && id) cartIdSet.add(id);
      }
    }
  }
  const cartOr: { token?: { in: string[] }; id?: { in: string[] } }[] = [];
  if (tokens.size) cartOr.push({ token: { in: [...tokens] } });
  if (cartIdSet.size) cartOr.push({ id: { in: [...cartIdSet] } });
  const carts = cartOr.length
    ? await prisma.appServiceCart.findMany({
        where: { customerId, OR: cartOr },
        select: { id: true },
      })
    : [];

  const settled = await settlePointsOnCancel({
    customerId,
    refIds: [
      orderId,
      `mia-extra:${orderId}`,
      `redeem:${orderId}`,
      ...carts.map((c) => c.id),
    ],
    note: "Hoàn điểm · khách huỷ đơn",
  });

  await prisma.appOrder.update({
    where: { id: orderId },
    data: { status: "CANCELLED" },
  });
  if (carts.length) {
    await prisma.appServiceCart.updateMany({
      where: {
        id: { in: carts.map((c) => c.id) },
        customerId,
        status: { in: ["USED", "OPEN", "PENDING_APPROVAL"] },
      },
      data: { status: "CANCELLED", adminNote: "Khách huỷ đơn" },
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

  return {
    already: false as const,
    pointsBalance: settled.balance,
    pointsRefunded: settled.refunded,
    pointsClawed: settled.clawed,
  };
}
