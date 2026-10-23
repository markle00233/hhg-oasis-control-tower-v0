import { prisma } from "./prisma";
import {
  customerCanCancelOrder,
  isFinalizedOrderStatus,
  isHistoryOrderStatus,
} from "./cancel-order";

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
  /** ok | warn | bad — màu badge */
  statusTone?: "ok" | "warn" | "bad" | "mute";
  accent: string;
  href: string;
  showQrHint: boolean;
  /** Service-cart token so "Hiện QR" opens a scannable /q/{token}, not the identity QR. */
  qrToken?: string | null;
  remainingLabel: string | null;
  referenceId: string;
  bucket: "active" | "upcoming" | "history";
  bookingCode?: string | null;
  /** Chi tiết món / gói */
  detailLines?: string[];
  /** Voucher / đổi điểm */
  promoLabel?: string | null;
  totalLabel?: string | null;
  /** Khách huỷ được khi đơn chưa được NV xác nhận (PENDING/SUBMITTED, hôm nay). */
  canCancel?: boolean;
  /** Epoch ms for timeline sort. */
  sortAt?: number;
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

function vnDayKey(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function hm(d: Date) {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function calendarDate(d: Date) {
  return d.toLocaleDateString("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function dateLabel(d: Date, absolute = false) {
  if (absolute) return calendarDate(d);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const that = new Date(d);
  that.setHours(0, 0, 0, 0);
  const diff = Math.round((that.getTime() - today.getTime()) / 86400000);
  if (diff === 0) return "Hôm nay";
  if (diff === 1) return "Ngày mai";
  if (diff === -1) return "Hôm qua";
  return calendarDate(d);
}

function bookingStatusLabel(status: string, zone?: string): string {
  if (zone === "LONG_NUONG") {
    if (status === "PENDING") return "Chờ gọi xác nhận";
    if (status === "CONFIRMED") return "Đã gọi xác nhận";
    if (status === "IN_SERVICE" || status === "CHECKED_IN" || status === "ARRIVED") {
      return "Đang dùng";
    }
    if (status === "COMPLETED") return "Đã dùng";
  }
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
    case "PREPARING":
      return "Đang làm";
    case "ACCEPTED":
    case "READY":
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

function orderStatusTone(
  status: string
): "ok" | "warn" | "bad" | "mute" {
  if (status === "CANCELLED") return "bad";
  if (isFinalizedOrderStatus(status)) return "ok";
  if (["PENDING", "SUBMITTED", "PREPARING"].includes(status)) return "warn";
  return "mute";
}

function spaVisitDone(note?: string | null) {
  return (note || "").trim() === "Đã dùng";
}

function spaZone(zoneCode?: string) {
  const z = (zoneCode || "").toUpperCase();
  return z === "SPA" || z === "SAUNA";
}

function visitInUseZone(zoneCode?: string) {
  const z = (zoneCode || "").toUpperCase();
  return spaZone(z) || z === "LONG_NUONG";
}

/** Trạng thái yêu cầu QR dịch vụ: tạo mã → duyệt → NV xác nhận / từ chối. */
function cartStatusLabel(
  status: string,
  zoneCode?: string,
  adminNote?: string | null
): string {
  const z = (zoneCode || "").toUpperCase();
  switch (status) {
    case "PENDING_APPROVAL":
      return "Đã tạo mã · chờ quầy duyệt";
    case "OPEN":
      return z === "MIA_OI"
        ? "Đã duyệt · chờ NV xác nhận thanh toán"
        : "Đã duyệt · chờ NV quét / xác nhận";
    case "USED":
      if (visitInUseZone(z) && !spaVisitDone(adminNote)) return "Đang dùng";
      if (visitInUseZone(z)) return "Đã dùng";
      return z === "MIA_OI"
        ? "NV đã xác nhận TT · hoàn tất"
        : "NV đã xác nhận · hoàn tất";
    case "REJECTED":
      return "Quầy từ chối yêu cầu";
    case "CANCELLED":
      return "Khách đã huỷ";
    case "NO_SHOW":
      return "Không tới (no-show)";
    case "EXPIRED":
      return "Hết hạn";
    default:
      return status;
  }
}

function cartStatusTone(status: string): "ok" | "warn" | "bad" | "mute" {
  if (status === "USED") return "ok";
  if (status === "PENDING_APPROVAL" || status === "OPEN") return "warn";
  if (status === "REJECTED" || status === "CANCELLED" || status === "NO_SHOW")
    return "bad";
  return "mute";
}

function sameBillZone(a: string, b: string) {
  const norm = (z: string) => {
    const u = z.toUpperCase();
    if (u === "OLYMPIC" || u === "OLYMPIC_POOL") return "OLYMPIC_POOL";
    if (u === "RESORT" || u === "RESORT_POOL") return "RESORT_POOL";
    return u;
  };
  return norm(a) === norm(b);
}

/** USED cart already represented by the desk order created from it. */
function usedCartCoveredByOrder(
  cart: { id: string; zoneCode: string; createdAt: Date; status: string },
  carts: { id: string; zoneCode: string; status: string; createdAt: Date }[],
  orders: { createdAt: Date; service: { serviceCode: string } | null }[]
) {
  const zoneOrders = orders.filter(
    (o) =>
      o.service?.serviceCode &&
      sameBillZone(o.service.serviceCode, cart.zoneCode) &&
      o.createdAt.getTime() >= cart.createdAt.getTime() - 60_000 &&
      o.createdAt.getTime() - cart.createdAt.getTime() < 12 * 60 * 60 * 1000
  );
  const zoneCarts = carts.filter(
    (c) => c.status === "USED" && sameBillZone(c.zoneCode, cart.zoneCode)
  );
  return zoneOrders.length === 1 && zoneCarts.length === 1;
}

function bookingIdsInCartItems(items: unknown): string[] {
  if (!Array.isArray(items)) return [];
  const ids: string[] = [];
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const note = String((item as { note?: unknown }).note || "");
    const match = note.match(/bookingId:([A-Za-z0-9_-]+)/);
    if (match) ids.push(match[1]);
  }
  return ids;
}

function cartTokenForBooking(
  bookingId: string,
  carts: { token: string; status: string; items: unknown }[]
) {
  for (const cart of carts) {
    if (cart.status !== "PENDING_APPROVAL" && cart.status !== "OPEN") continue;
    if (bookingIdsInCartItems(cart.items).includes(bookingId)) return cart.token;
  }
  return null;
}

function cartBucket(
  status: string,
  zoneCode?: string,
  adminNote?: string | null
): "active" | "upcoming" | "history" {
  if (status === "PENDING_APPROVAL" || status === "OPEN") return "active";
  if (status === "USED" && visitInUseZone(zoneCode) && !spaVisitDone(adminNote)) {
    return "active";
  }
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

function parseCartPromoLines(items: unknown): {
  itemLines: string[];
  promoLabel: string | null;
  hasVoucher: boolean;
  hasPoints: boolean;
} {
  if (!Array.isArray(items)) {
    return {
      itemLines: [],
      promoLabel: null,
      hasVoucher: false,
      hasPoints: false,
    };
  }
  const itemLines: string[] = [];
  let hasVoucher = false;
  let pointsTier: number | null = null;
  let pointsCost = 0;
  for (const row of items) {
    if (!row || typeof row !== "object") continue;
    const r = row as {
      id?: string;
      nameVi?: string;
      qty?: number;
      priceVnd?: number;
    };
    const id = String(r.id || "");
    if (id.startsWith("voucher-")) {
      hasVoucher = true;
      continue;
    }
    if (id.startsWith("points-redeem-")) {
      const t = Math.round(Number(id.replace("points-redeem-", "")) || 0);
      if (t === 50 || t === 100) {
        pointsTier = t;
        const units = Math.max(1, Math.round(Number(r.qty) || 1));
        pointsCost = t * units;
      }
      continue;
    }
    if (!r.nameVi) continue;
    const qty = Math.max(1, Number(r.qty) || 1);
    const price = Math.max(0, Number(r.priceVnd) || 0);
    itemLines.push(
      price > 0
        ? `${qty}× ${r.nameVi} · ${formatVnd(price * qty)}`
        : `${qty}× ${r.nameVi}`
    );
  }
  const parts: string[] = [];
  if (hasVoucher) parts.push("Có voucher");
  if (pointsTier) parts.push(`Đổi ${pointsCost} điểm`);
  return {
    itemLines,
    promoLabel: parts.length ? parts.join(" · ") : null,
    hasVoucher,
    hasPoints: !!pointsTier,
  };
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

/** Activity timeline buckets. History is newest → oldest. */
export async function buildActivityCards(customerId: string) {
  const now = new Date();
  const cards = await collectCards(customerId, now, { historyLimit: 40 });
  const oldestFirst = (a: ServiceCardViewModel, b: ServiceCardViewModel) =>
    (a.sortAt ?? 0) - (b.sortAt ?? 0);
  const newestFirst = (a: ServiceCardViewModel, b: ServiceCardViewModel) =>
    (b.sortAt ?? 0) - (a.sortAt ?? 0);
  return {
    active: cards.filter((c) => c.bucket === "active").sort(oldestFirst),
    upcoming: cards.filter((c) => c.bucket === "upcoming").sort(oldestFirst),
    history: cards.filter((c) => c.bucket === "history").sort(newestFirst),
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

  const sinceHistory = new Date(
    now.getTime() - (opts.historyLimit > 0 ? 14 : 2) * 24 * 60 * 60 * 1000
  );
  const [bookings, sessions, openOrders, carts, recentUses, payLinks] =
    await Promise.all([
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
            "CONFIRMED",
            "DONE",
            "CANCELLED",
          ],
        },
        createdAt: {
          gte: new Date(
            now.getTime() -
              (opts.historyLimit > 0 ? 14 : 1) * 24 * 60 * 60 * 1000
          ),
        },
      },
      orderBy: { createdAt: "desc" },
      take: opts.historyLimit > 0 ? 25 : 10,
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
              : ["PENDING_APPROVAL", "OPEN", "USED"],
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
    prisma.appServiceEvent.findMany({
      where: {
        customerId,
        createdAt: { gte: sinceHistory },
        eventType: { in: ["SERVICE_USE", "MIA_OI_ORDER"] },
      },
      orderBy: { createdAt: "desc" },
      take: 40,
      select: { metadata: true },
    }),
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
      statusLabel: zone === "LONG_NUONG" ? "Đang dùng" : "Đang sử dụng",
      statusTone: "ok",
      accent: accentFor(zone),
      href: s.bookingId
        ? `/activity/booking/${s.bookingId}`
        : "/activity",
      showQrHint: false,
      remainingLabel: end ? remainingBetween(end, now) : null,
      referenceId: s.id,
      bucket: "active",
      bookingCode: s.booking?.bookingCode || null,
      detailLines: s.resource.name ? [`Tài nguyên: ${s.resource.name}`] : [],
      sortAt: s.startAt.getTime(),
    });
  }

  const cartTokenByBookingId = new Map<string, string>();
  for (const cart of carts) {
    if (cart.status !== "PENDING_APPROVAL" && cart.status !== "OPEN") continue;
    for (const bookingId of bookingIdsInCartItems(cart.items)) {
      if (!cartTokenByBookingId.has(bookingId)) {
        cartTokenByBookingId.set(bookingId, cart.token);
      }
    }
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
      subtitle:
        resourceName ||
        (zone === "LONG_NUONG" ? `${b.partySize} khách` : b.bookingCode),
      dateLabel: dateLabel(b.startAt, bucket === "history"),
      timeLabel: `${hm(b.startAt)} – ${hm(b.endAt)}`,
      resourceName,
      partySize: b.partySize,
      status: b.status,
      statusLabel: bookingStatusLabel(b.status, zone),
      statusTone: (["CANCELLED", "NO_SHOW"].includes(b.status)
        ? "bad"
        : ["COMPLETED"].includes(b.status)
          ? "ok"
          : ["PENDING"].includes(b.status)
            ? "warn"
            : "ok") as "ok" | "warn" | "bad" | "mute",
      accent: accentFor(zone),
      href: `/activity/booking/${b.id}`,
      showQrHint:
        zone === "LONG_NUONG"
          ? false
          : ["PENDING", "CONFIRMED"].includes(b.status),
      qrToken:
        zone === "LONG_NUONG"
          ? null
          : cartTokenByBookingId.get(b.id) || null,
      remainingLabel:
        bucket === "active" ? remainingBetween(b.endAt, now) : null,
      referenceId: b.id,
      bucket,
      bookingCode: b.bookingCode,
      sortAt: b.startAt.getTime(),
    });
  }

  for (const o of openOrders) {
    const zone = o.service?.serviceCode || "MIA_OI";
    const done = isHistoryOrderStatus(o.status);
    if (opts.historyLimit === 0 && done) continue;
    const detailLines = (o.items || []).map(
      (it) =>
        `${it.qty}× ${it.nameVi}${
          it.unitPriceVnd
            ? ` · ${formatVnd(it.unitPriceVnd * it.qty)}`
            : ""
        }`
    );
    const note = String(o.note || "");
    const promoParts: string[] = [];
    if (/voucher/i.test(note)) promoParts.push("Có voucher");
    const pointsMatch = note.match(/đổi\s*(\d+)\s*điểm/i) || note.match(/(\d+)\s*điểm/i);
    if (pointsMatch) {
      promoParts.push(`Đổi ${pointsMatch[1]} điểm`);
    } else if (/điểm|đổi/i.test(note)) {
      promoParts.push("Đổi điểm");
    }
    cards.push({
      id: `order-${o.id}`,
      type: "ORDER",
      zoneCode: zone,
      zoneName: o.service?.serviceName || "Mía Ơi",
      title: o.service?.serviceName || "Mía Ơi",
      subtitle: formatVnd(o.totalVnd),
      dateLabel: dateLabel(o.createdAt, done),
      timeLabel: hm(o.createdAt),
      resourceName: null,
      partySize: null,
      status: o.status,
      statusLabel: orderStatusLabel(o.status),
      statusTone: orderStatusTone(o.status),
      accent: accentFor(zone),
      href: "/activity",
      showQrHint: false,
      remainingLabel: null,
      referenceId: o.id,
      bucket: done ? "history" : "active",
      detailLines,
      promoLabel: promoParts.length ? promoParts.join(" · ") : null,
      totalLabel: formatVnd(o.totalVnd),
      canCancel: customerCanCancelOrder({
        status: o.status,
        zone,
        createdAt: o.createdAt,
        now,
      }),
      sortAt: o.createdAt.getTime(),
    });
  }

  const shownOrderIds = new Set(openOrders.map((o) => o.id));
  const paidCartTokens = new Set<string>();
  for (const e of payLinks) {
    const meta =
      e.metadata && typeof e.metadata === "object"
        ? (e.metadata as Record<string, unknown>)
        : {};
    const token = typeof meta.cartToken === "string" ? meta.cartToken : "";
    const orderId = typeof meta.orderId === "string" ? meta.orderId : "";
    const cancelledOrderId =
      typeof meta.cancelledOrderId === "string" ? meta.cancelledOrderId : "";
    if (
      token &&
      ((orderId && shownOrderIds.has(orderId)) ||
        (cancelledOrderId && shownOrderIds.has(cancelledOrderId)))
    ) {
      paidCartTokens.add(token);
    }
  }

  for (const cart of carts) {
    if (
      (cart.status === "USED" || cart.status === "CANCELLED") &&
      paidCartTokens.has(cart.token)
    ) {
      continue;
    }
    if (
      cart.status === "USED" &&
      !paidCartTokens.has(cart.token) &&
      usedCartCoveredByOrder(cart, carts, openOrders)
    ) {
      continue;
    }
    const zone = cart.zoneCode;
    if (zone === "LONG_NUONG" && bookingIdsInCartItems(cart.items).length) {
      continue;
    }
    const promo = parseCartPromoLines(cart.items);
    const bill =
      promo.itemLines.join(", ") || formatVnd(cart.totalVnd);
    const bucket = cartBucket(cart.status, zone, cart.adminNote);
    if (opts.historyLimit === 0 && bucket === "history") continue;
    const detailLines = [...promo.itemLines];
    if (cart.adminNote && cart.status === "REJECTED") {
      detailLines.push(`Lý do: ${cart.adminNote}`);
    }
    cards.push({
      id: `cart-${cart.id}`,
      type: "TICKET",
      zoneCode: zone,
      zoneName: cart.zoneName || zone,
      title: cart.zoneName || zone,
      subtitle: bill,
      dateLabel: dateLabel(cart.createdAt, bucket === "history"),
      timeLabel: hm(cart.createdAt),
      resourceName: null,
      partySize: null,
      status: cart.status,
      statusLabel: cartStatusLabel(cart.status, zone, cart.adminNote),
      statusTone: cartStatusTone(cart.status),
      accent: accentFor(zone),
      href:
        cart.status === "OPEN" || cart.status === "PENDING_APPROVAL"
          ? `/q/${cart.token}`
          : "/activity",
      showQrHint: cart.status === "OPEN" || cart.status === "PENDING_APPROVAL",
      remainingLabel: null,
      referenceId: cart.token,
      bucket,
      detailLines,
      promoLabel: promo.promoLabel,
      totalLabel: formatVnd(cart.totalVnd),
      sortAt: cart.createdAt.getTime(),
    });
  }

  for (const e of recentUses) {
    const zone = e.service.serviceCode;
    const meta =
      e.metadata && typeof e.metadata === "object"
        ? (e.metadata as Record<string, unknown>)
        : {};
    const metaItems = Array.isArray(meta.items)
      ? (meta.items as { name?: string; qty?: number; unitPriceVnd?: number }[])
      : [];
    const detailLines = metaItems.map((i) => {
      const qty = Number(i.qty) || 1;
      const price = Number(i.unitPriceVnd) || 0;
      return price > 0
        ? `${qty}× ${i.name || "món"} · ${formatVnd(price * qty)}`
        : `${qty}× ${i.name || "món"}`;
    });
    const totalVnd =
      typeof meta.totalVnd === "number" ? meta.totalVnd : null;
    cards.push({
      id: `use-${e.id}`,
      type: "SERVICE_USE",
      zoneCode: zone,
      zoneName: e.service.serviceName,
      title: e.service.serviceName,
      subtitle:
        detailLines[0] ||
        (totalVnd != null ? formatVnd(totalVnd) : "Check-in"),
      dateLabel: dateLabel(e.createdAt, true),
      timeLabel: hm(e.createdAt),
      resourceName: null,
      partySize: null,
      status: e.operationalStatus,
      statusLabel:
        e.operationalStatus === "COMPLETED"
          ? "Đã sử dụng"
          : e.operationalStatus === "CANCELLED"
            ? "Đã huỷ"
            : e.operationalStatus,
      statusTone:
        e.operationalStatus === "COMPLETED"
          ? "ok"
          : e.operationalStatus === "CANCELLED"
            ? "bad"
            : "mute",
      accent: accentFor(zone),
      href: "/activity",
      showQrHint: false,
      remainingLabel: null,
      referenceId: e.id,
      bucket: "history",
      detailLines,
      totalLabel: totalVnd != null ? formatVnd(totalVnd) : null,
      sortAt: e.createdAt.getTime(),
    });
  }

  const rank = { active: 0, upcoming: 1, history: 2 };
  cards.sort((a, b) => {
    const br = rank[a.bucket] - rank[b.bucket];
    if (br !== 0) return br;
    return (a.sortAt ?? 0) - (b.sortAt ?? 0);
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
    statusLabel: bookingStatusLabel(b.status, b.service.serviceCode),
    notes: b.notes,
    source: b.source,
    createdAt: b.createdAt.toISOString(),
    bucket,
    remainingLabel:
      bucket === "active" ? remainingBetween(b.endAt, now) : null,
    showQrHint:
      b.service.serviceCode === "LONG_NUONG"
        ? false
        : ["PENDING", "CONFIRMED"].includes(b.status),
    qrToken:
      b.service.serviceCode === "LONG_NUONG"
        ? null
        : await cartTokenForBookingId(customerId, b.id),
  };
}

async function cartTokenForBookingId(customerId: string, bookingId: string) {
  const carts = await prisma.appServiceCart.findMany({
    where: {
      customerId,
      status: { in: ["PENDING_APPROVAL", "OPEN"] },
    },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: { token: true, status: true, items: true },
  });
  return cartTokenForBooking(bookingId, carts);
}
