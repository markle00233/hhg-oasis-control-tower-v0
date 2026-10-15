import { prisma } from "./prisma";

export type JourneyItem = {
  type: "SERVICE_USE" | "ORDER" | "BOOKING" | "PAYMENT" | "TICKET";
  id: string;
  zoneCode: string | null;
  zoneName: string | null;
  occurredAt: string;
  status: string;
  summary: string;
  referenceId: string;
  detail?: Record<string, unknown>;
};

function startOfLocalDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function formatVnd(n: number) {
  return new Intl.NumberFormat("vi-VN").format(n) + "đ";
}

/** Aggregate SERVICE_USE + ORDER (+ future BOOKING) into one timeline. */
export async function buildCustomerJourney(
  customerId: string,
  opts?: { since?: Date; until?: Date; limit?: number }
): Promise<JourneyItem[]> {
  const since = opts?.since;
  const until = opts?.until;
  const limit = opts?.limit ?? 200;

  const createdAt =
    since || until
      ? {
          ...(since ? { gte: since } : {}),
          ...(until ? { lt: until } : {}),
        }
      : undefined;

  const [events, orders] = await Promise.all([
    prisma.appServiceEvent.findMany({
      where: {
        customerId,
        ...(createdAt ? { createdAt } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      include: {
        service: { select: { serviceCode: true, serviceName: true } },
      },
    }),
    prisma.appOrder.findMany({
      where: {
        customerId,
        ...(createdAt ? { createdAt } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      include: {
        service: { select: { serviceCode: true, serviceName: true } },
        items: true,
      },
    }),
  ]);

  const orderIdSet = new Set(orders.map((o) => o.id));
  const items: JourneyItem[] = [];

  for (const e of events) {
    if (e.eventType === "SERVICE_USE") {
      items.push({
        type: "SERVICE_USE",
        id: e.id,
        zoneCode: e.service.serviceCode,
        zoneName: e.service.serviceName,
        occurredAt: e.createdAt.toISOString(),
        status: e.operationalStatus || "NEW",
        summary: `Check-in ${e.service.serviceName}`,
        referenceId: e.id,
        detail: {
          operationalStatus: e.operationalStatus,
          metadata: e.metadata,
        },
      });
      continue;
    }

    // Prefer AppOrder rows; skip desk event duplicates when linked
    if (
      e.eventType === "MIA_OI_ORDER" ||
      e.eventType === "SPA_ORDER" ||
      e.eventType === "POOL_ORDER"
    ) {
      const meta =
        e.metadata && typeof e.metadata === "object"
          ? (e.metadata as Record<string, unknown>)
          : {};
      if (typeof meta.orderId === "string" && orderIdSet.has(meta.orderId)) {
        continue;
      }
      const orderItems = Array.isArray(meta.items)
        ? (meta.items as { name?: string; qty?: number }[])
        : [];
      const bill = orderItems
        .map((i) => `${i.qty || 1}× ${i.name || "item"}`)
        .join(", ");
      items.push({
        type: e.eventType === "POOL_ORDER" ? "TICKET" : "ORDER",
        id: e.id,
        zoneCode: e.service.serviceCode,
        zoneName: e.service.serviceName,
        occurredAt: e.createdAt.toISOString(),
        status: String(meta.status || "RECORDED"),
        summary: bill || e.eventType,
        referenceId: typeof meta.orderId === "string" ? meta.orderId : e.id,
        detail: meta,
      });
    }
  }

  for (const o of orders) {
    const bill = o.items.map((i) => `${i.qty}× ${i.nameVi}`).join(", ");
    items.push({
      type: "ORDER",
      id: o.id,
      zoneCode: o.service?.serviceCode ?? null,
      zoneName: o.service?.serviceName ?? null,
      occurredAt: o.createdAt.toISOString(),
      status: o.status,
      summary: bill
        ? `${bill} · ${formatVnd(o.totalVnd)}`
        : `Đơn · ${formatVnd(o.totalVnd)}`,
      referenceId: o.id,
      detail: {
        totalVnd: o.totalVnd,
        source: o.source,
        createdByType: o.createdByType,
        items: o.items.map((i) => ({
          nameVi: i.nameVi,
          qty: i.qty,
          unitPriceVnd: i.unitPriceVnd,
        })),
      },
    });
  }

  items.sort(
    (a, b) =>
      new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime()
  );

  return items.slice(0, limit);
}

export async function buildTodayAndHistory(customerId: string) {
  const todayStart = startOfLocalDay();
  const all = await buildCustomerJourney(customerId, { limit: 300 });
  const today = all.filter((i) => new Date(i.occurredAt) >= todayStart);
  const history = all.filter((i) => new Date(i.occurredAt) < todayStart);

  const historyByDate: Record<string, JourneyItem[]> = {};
  for (const item of history) {
    const key = new Date(item.occurredAt).toLocaleDateString("vi-VN");
    if (!historyByDate[key]) historyByDate[key] = [];
    historyByDate[key].push(item);
  }

  const now = new Date();
  const bookings = await prisma.appBooking.findMany({
    where: {
      customerId,
      endAt: { gte: now },
      status: {
        in: ["PENDING", "CONFIRMED", "ARRIVED", "CHECKED_IN", "IN_SERVICE"],
      },
    },
    orderBy: { startAt: "asc" },
    take: 50,
    include: { service: { select: { serviceCode: true, serviceName: true } } },
  });

  const upcoming: JourneyItem[] = bookings.map((b) => ({
    type: "BOOKING" as const,
    id: b.id,
    zoneCode: b.service.serviceCode,
    zoneName: b.service.serviceName,
    occurredAt: b.startAt.toISOString(),
    status: b.status,
    summary: `${b.bookingCode} · ${new Date(b.startAt).toLocaleString("vi-VN")} → ${new Date(b.endAt).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })} · ${b.partySize} khách`,
    referenceId: b.id,
    detail: {
      endAt: b.endAt.toISOString(),
      resourceId: b.resourceId,
      partySize: b.partySize,
      source: b.source,
    },
  }));

  return {
    today,
    upcoming,
    historyByDate,
  };
}
