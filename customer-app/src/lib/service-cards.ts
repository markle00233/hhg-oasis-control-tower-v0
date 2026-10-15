import { prisma } from "./prisma";

/** UI/read model — source of truth remains Booking / Order / Session / SERVICE_USE. */
export type ServiceCardViewModel = {
  id: string;
  type: "BOOKING" | "ORDER" | "TICKET" | "SESSION" | "SERVICE_USE";
  zoneCode: string;
  zoneName: string;
  title: string;
  subtitle: string;
  dateLabel: string;
  timeLabel: string | null;
  resourceName: string | null;
  partySize: number | null;
  status: string;
  statusLabel: string;
  accent: string;
  href: string;
  showQrHint: boolean;
  remainingLabel: string | null;
  referenceId: string;
  bucket: "active" | "upcoming" | "history";
  bookingCode?: string | null;
};

const ZONE_ACCENT: Record<string, string> = {
  PICKLEBALL: "#3f6212",
  SPA: "#9a3412",
  LONG_NUONG: "#9f1239",
  VIP_RESORT: "#92400e",
  MIA_OI: "#14532d",
  OLYMPIC_POOL: "#1e3a8a",
  RESORT_POOL: "#115e59",
  SAUNA: "#9a3412",
  JACUZZI: "#5b21b6",
};

function accentFor(zone: string) {
  return ZONE_ACCENT[zone] || "#0b1220";
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function hm(d: Date) {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function dateLabel(d: Date) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const that = new Date(d);
  that.setHours(0, 0, 0, 0);
  const diff = Math.round((that.getTime() - today.getTime()) / 86400000);
  if (diff === 0) return "Hôm nay";
  if (diff === 1) return "Ngày mai";
  if (diff === -1) return "Hôm qua";
  return d.toLocaleDateString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function bookingStatusLabel(status: string): string {
  switch (status) {
    case "PENDING":
      return "Chờ xác nhận";
    case "CONFIRMED":
      return "Đã xác nhận";
    case "ARRIVED":
    case "CHECKED_IN":
      return "Đã đến";
    case "IN_SERVICE":
      return "Đang sử dụng";
    case "COMPLETED":
      return "Hoàn tất";
    case "CANCELLED":
      return "Đã hủy";
    case "NO_SHOW":
      return "Không đến";
    default:
      return status;
  }
}

function orderStatusLabel(status: string): string {
  switch (status) {
    case "PENDING":
    case "SUBMITTED":
      return "Chờ nhận";
    case "ACCEPTED":
      return "NV đã xác nhận";
    case "PREPARING":
      return "Đang làm";
    case "READY":
      return "Sẵn sàng";
    case "SERVED":
    case "DONE":
    case "CONFIRMED":
      return "Hoàn tất";
    case "CANCELLED":
      return "Đã hủy";
    default:
      return status;
  }
}

/** Trạng thái yêu cầu QR dịch vụ: tạo mã → duyệt → NV xác nhận. */
function cartStatusLabel(status: string, zoneCode?: string): string {
  const z = (zoneCode || "").toUpperCase();
  switch (status) {
    case "PENDING_APPROVAL":
      return "Mã tạo thành công · chờ duyệt";
    case "OPEN":
      return z === "MIA_OI"
        ? "Đã duyệt · chờ NV xác nhận TT"
        : "Đã duyệt · chờ NV xác nhận";
    case "USED":
      return "Nhân viên đã xác nhận";
    case "REJECTED":
      return "Quầy từ chối";
    case "CANCELLED":
      return "Đã huỷ";
    case "NO_SHOW":
      return "Không tới";
    case "EXPIRED":
      return "Hết hạn";
    default:
      return status;
  }
}

function cartBucket(status: string): "active" | "upcoming" | "history" {
  if (status === "PENDING_APPROVAL" || status === "OPEN") return "active";
  return "history";
}

function remainingBetween(endAt: Date, now = new Date()) {
  const ms = endAt.getTime() - now.getTime();
  if (ms <= 0) return null;
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `Còn ${mins} phút`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `Còn ${pad(h)}:${pad(m)}`;
}

function formatVnd(n: number) {
  return new Intl.NumberFormat("vi-VN").format(n) + "đ";
}

function bookingBucket(
  status: string,
  startAt: Date,
  endAt: Date,
  now: Date
): "active" | "upcoming" | "history" {
  if (["COMPLETED", "CANCELLED", "NO_SHOW"].includes(status)) return "history";
  if (
    ["IN_SERVICE", "CHECKED_IN", "ARRIVED"].includes(status) ||
    (startAt <= now && endAt > now && status === "CONFIRMED")
  ) {
    return "active";
  }
  if (endAt < now) return "history";
  return "upcoming";
}

/** Home: active + next upcoming only (no full history). */
export async function buildHomeCardSummary(customerId: string) {
  const now = new Date();
  const cards = await collectCards(customerId, now, { historyLimit: 0 });
  const active = cards.filter((c) => c.bucket === "active").slice(0, 3);
  const upcoming = cards.filter((c) => c.bucket === "upcoming").slice(0, 3);
  return { active, upcoming };
}

/** Activity timeline buckets. */
export async function buildActivityCards(customerId: string) {
  const now = new Date();
  const cards = await collectCards(customerId, now, { historyLimit: 40 });
  return {
    active: cards.filter((c) => c.bucket === "active"),
    upcoming: cards.filter((c) => c.bucket === "upcoming"),
    history: cards.filter((c) => c.bucket === "history"),
  };
}

async function collectCards(
  customerId: string,
  now: Date,
  opts: { historyLimit: number }
): Promise<ServiceCardViewModel[]> {
  const activeBookingWhere = {
    customerId,
    status: {
      in: ["PENDING", "CONFIRMED", "ARRIVED", "CHECKED_IN", "IN_SERVICE"],
    },
    endAt: { gte: new Date(now.getTime() - 2 * 60 * 60 * 1000) },
  };

  const [bookings, sessions, openOrders, carts, recentUses] = await Promise.all([
    prisma.appBooking.findMany({
      where:
        opts.historyLimit > 0
          ? {
              customerId,
              OR: [
                activeBookingWhere,
                {
                  status: { in: ["COMPLETED", "CANCELLED", "NO_SHOW"] },
                  endAt: {
                    gte: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
                  },
                },
              ],
            }
          : activeBookingWhere,
      orderBy: { startAt: "desc" },
      take: 60,
      include: {
        service: { select: { serviceCode: true, serviceName: true } },
        resource: { select: { name: true, code: true } },
      },
    }),
    prisma.appResourceSession.findMany({
      where: {
        customerId,
        status: "OCCUPIED",
        OR: [{ endAt: null }, { endAt: { gt: now } }],
      },
      take: 10,
      include: {
        resource: {
          include: {
            service: { select: { serviceCode: true, serviceName: true } },
          },
        },
        booking: { select: { id: true, bookingCode: true, endAt: true } },
      },
    }),
    prisma.appOrder.findMany({
      where: {
        customerId,
        status: {
          in: [
            "PENDING",
            "SUBMITTED",
            "ACCEPTED",
            "PREPARING",
            "READY",
            "SERVED",
          ],
        },
        createdAt: { gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) },
      },
      orderBy: { createdAt: "desc" },
      take: 10,
      include: {
        service: { select: { serviceCode: true, serviceName: true } },
        items: true,
      },
    }),
    prisma.appServiceCart.findMany({
      where: {
        customerId,
        createdAt: { gte: new Date(now.getTime() - 48 * 60 * 60 * 1000) },
        status: {
          in:
            opts.historyLimit > 0
              ? [
                  "PENDING_APPROVAL",
                  "OPEN",
                  "USED",
                  "REJECTED",
                  "CANCELLED",
                  "NO_SHOW",
                  "EXPIRED",
                ]
              : ["PENDING_APPROVAL", "OPEN"],
        },
      },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
    opts.historyLimit > 0
      ? prisma.appServiceEvent.findMany({
          where: {
            customerId,
            eventType: "SERVICE_USE",
            createdAt: {
              gte: new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000),
            },
            operationalStatus: {
              in: ["COMPLETED", "CANCELLED", "WRONG_SCAN"],
            },
          },
          orderBy: { createdAt: "desc" },
          take: opts.historyLimit,
          include: {
            service: { select: { serviceCode: true, serviceName: true } },
          },
        })
      : Promise.resolve([]),
  ]);

  const cards: ServiceCardViewModel[] = [];
  const bookingIdsWithSession = new Set(
    sessions.map((s) => s.bookingId).filter(Boolean) as string[]
  );

  for (const s of sessions) {
    const zone = s.resource.service.serviceCode;
    const end = s.endAt || s.booking?.endAt || null;
    cards.push({
      id: `session-${s.id}`,
      type: "SESSION",
      zoneCode: zone,
      zoneName: s.resource.service.serviceName,
      title: s.resource.service.serviceName,
      subtitle: s.resource.name,
      dateLabel: dateLabel(s.startAt),
      timeLabel: end ? `${hm(s.startAt)} – ${hm(end)}` : hm(s.startAt),
      resourceName: s.resource.name,
      partySize: null,
      status: "IN_SERVICE",
      statusLabel: "Đang sử dụng",
      accent: accentFor(zone),
      href: s.bookingId
        ? `/activity/booking/${s.bookingId}`
        : `/activity/session/${s.id}`,
      showQrHint: false,
      remainingLabel: end ? remainingBetween(end, now) : null,
      referenceId: s.id,
      bucket: "active",
      bookingCode: s.booking?.bookingCode || null,
    });
  }

  for (const b of bookings) {
    if (bookingIdsWithSession.has(b.id) && b.status === "IN_SERVICE") continue;
    const zone = b.service.serviceCode;
    const bucket = bookingBucket(b.status, b.startAt, b.endAt, now);
    if (opts.historyLimit === 0 && bucket === "history") continue;
    const resourceName = b.resource?.name || null;
    cards.push({
      id: `booking-${b.id}`,
      type: "BOOKING",
      zoneCode: zone,
      zoneName: b.service.serviceName,
      title: b.service.serviceName,
      subtitle: resourceName || b.bookingCode,
      dateLabel: dateLabel(b.startAt),
      timeLabel: `${hm(b.startAt)} – ${hm(b.endAt)}`,
      resourceName,
      partySize: b.partySize,
      status: b.status,
      statusLabel: bookingStatusLabel(b.status),
      accent: accentFor(zone),
      href: `/activity/booking/${b.id}`,
      showQrHint: ["PENDING", "CONFIRMED"].includes(b.status),
      remainingLabel:
        bucket === "active" ? remainingBetween(b.endAt, now) : null,
      referenceId: b.id,
      bucket,
      bookingCode: b.bookingCode,
    });
  }

  for (const o of openOrders) {
    const zone = o.service?.serviceCode || "MIA_OI";
    const done = ["SERVED", "DONE", "CONFIRMED"].includes(o.status);
    cards.push({
      id: `order-${o.id}`,
      type: "ORDER",
      zoneCode: zone,
      zoneName: o.service?.serviceName || "Mía Ơi",
      title: o.service?.serviceName || "Mía Ơi",
      subtitle: formatVnd(o.totalVnd),
      dateLabel: dateLabel(o.createdAt),
      timeLabel: hm(o.createdAt),
      resourceName: null,
      partySize: null,
      status: o.status,
      statusLabel: orderStatusLabel(o.status),
      accent: accentFor(zone),
      href: `/activity/order/${o.id}`,
      showQrHint: false,
      remainingLabel: null,
      referenceId: o.id,
      bucket: done ? "history" : "active",
    });
  }

  for (const cart of carts) {
    const zone = cart.zoneCode;
    const items = Array.isArray(cart.items)
      ? (cart.items as { nameVi?: string; qty?: number }[])
      : [];
    const bill = items
      .filter((i) => i && !String((i as { id?: string }).id || "").startsWith("voucher-"))
      .map((i) => `${i.qty || 1}× ${i.nameVi || "món"}`)
      .join(", ");
    const bucket = cartBucket(cart.status);
    if (opts.historyLimit === 0 && bucket === "history") continue;
    cards.push({
      id: `cart-${cart.id}`,
      type: "TICKET",
      zoneCode: zone,
      zoneName: cart.zoneName || zone,
      title: cart.zoneName || zone,
      subtitle: bill || formatVnd(cart.totalVnd),
      dateLabel: dateLabel(cart.createdAt),
      timeLabel: hm(cart.createdAt),
      resourceName: null,
      partySize: null,
      status: cart.status,
      statusLabel: cartStatusLabel(cart.status, zone),
      accent: accentFor(zone),
      href: cart.status === "OPEN" ? `/q/${cart.token}` : "/activity",
      showQrHint: cart.status === "OPEN" || cart.status === "PENDING_APPROVAL",
      remainingLabel: null,
      referenceId: cart.token,
      bucket,
    });
  }

  for (const e of recentUses) {
    const zone = e.service.serviceCode;
    cards.push({
      id: `use-${e.id}`,
      type: "SERVICE_USE",
      zoneCode: zone,
      zoneName: e.service.serviceName,
      title: e.service.serviceName,
      subtitle: "Check-in",
      dateLabel: dateLabel(e.createdAt),
      timeLabel: hm(e.createdAt),
      resourceName: null,
      partySize: null,
      status: e.operationalStatus,
      statusLabel:
        e.operationalStatus === "COMPLETED" ? "Đã sử dụng" : e.operationalStatus,
      accent: accentFor(zone),
      href: `/activity`,
      showQrHint: false,
      remainingLabel: null,
      referenceId: e.id,
      bucket: "history",
    });
  }

  const rank = { active: 0, upcoming: 1, history: 2 };
  cards.sort((a, b) => {
    const br = rank[a.bucket] - rank[b.bucket];
    if (br !== 0) return br;
    return a.dateLabel.localeCompare(b.dateLabel);
  });

  return cards;
}

export async function getBookingCardDetail(customerId: string, bookingId: string) {
  const b = await prisma.appBooking.findFirst({
    where: { id: bookingId, customerId },
    include: {
      service: { select: { serviceCode: true, serviceName: true } },
      resource: { select: { name: true, code: true, type: true } },
    },
  });
  if (!b) return null;
  const now = new Date();
  const bucket = bookingBucket(b.status, b.startAt, b.endAt, now);
  return {
    id: b.id,
    bookingCode: b.bookingCode,
    zoneCode: b.service.serviceCode,
    zoneName: b.service.serviceName,
    resourceName: b.resource?.name || null,
    startAt: b.startAt.toISOString(),
    endAt: b.endAt.toISOString(),
    partySize: b.partySize,
    status: b.status,
    statusLabel: bookingStatusLabel(b.status),
    notes: b.notes,
    source: b.source,
    createdAt: b.createdAt.toISOString(),
    bucket,
    remainingLabel:
      bucket === "active" ? remainingBetween(b.endAt, now) : null,
    showQrHint: ["PENDING", "CONFIRMED"].includes(b.status),
  };
}
