"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  MIAOI_CATEGORIES,
  MIAOI_MENU,
  formatMenuPrice,
  formatVnd,
  type MiaOiMenuItem,
} from "@/lib/miaoi-menu";
import {
  SPA_CATEGORIES,
  SPA_GOI_BONUS_ID,
  SPA_MENU,
  formatSpaPrice,
  type SpaMenuItem,
} from "@/lib/spa-menu";
import {
  POOL_CATEGORIES,
  POOL_SWIM_BONUS_ID,
  formatPoolPrice,
  getPoolItem,
  isPoolDayTicket,
  poolItemsForService,
  type PoolMenuItem,
} from "@/lib/olympic-pool-menu";
import {
  MIA_MEMBERSHIP_DISC_PREFIX,
  isOlympicPackageId,
  miaOiDiscountPercentForPlanLabel,
  miaOiMembershipDiscountVnd,
  segmentAtTime,
} from "@/lib/olympic-membership";
import { badgeForPlanLabel, deskSegmentLabel, isVipSubscriptionLabel } from "@/lib/desk-segment";
import { ADMIN_PANEL_PASSWORD, ADMIN_PANEL_USERNAME } from "@/lib/admin-panel";
import { computePoolPricing } from "@/lib/pool-pricing";
import { printPoolBill } from "@/lib/pool-bill-print";
import { printDayBillsPdf, type DayBill } from "@/lib/day-bills-print";
import {
  DESK_ZONES,
  MIA_OLYMPIC_LABEL,
  dashboardTitle,
  getDeskZone,
  isOlympicPoolScanCode,
  isSwimLessonDesk,
  isZoneDeskAdmin,
  miaOlympicSector,
  sameDeskSector,
  zoneAdminUsername,
  zoneHasResources,
  type DeskZone,
} from "@/lib/desk-zones";
import { DeskBookingEdit } from "@/components/desk-booking-edit";
import { DeskCourtSchedule } from "@/components/desk-court-schedule";
import { DeskVipSubscribers } from "@/components/desk-vip-subscribers";
import { DeskResourceGrid } from "@/components/desk-resource-grid";
import { DeskQrScanner } from "@/components/DeskQrScanner";
import { DeskSwimStudents } from "@/components/desk-swim-students";
import { DeskCalendar } from "@/components/desk-calendar";
import {
  checkInLabel,
  checkInUiFromCart,
  type CheckInUi,
} from "@/lib/cart-status";
import { parseCartPromo } from "@/lib/cart-promo";
import { pointsFromSubtotal } from "@/lib/points";
import {
  deskOrderStatusLabel,
  isFinalizedOrderStatus,
} from "@/lib/order-status";
import {
  REDEEM_DRINK_MAX_VND,
  foldPointsOntoItems,
  previewCartPointLines,
} from "@/lib/bill-points";
import {
  DESK_REDEEM_DRINK_STEP,
  DESK_REDEEM_SWIM_STEP,
  applyDeskRedeemUnits,
  coverDrinkCartPoints,
  isDeskRedeemDrink,
  isDeskRedeemEligible,
  isDeskRedeemTicket,
  type RedeemableLine,
} from "@/lib/desk-point-redeem";
import { billEvidenceFrozen, zoneRequiresBillPhoto } from "@/lib/bill-photo";
import { deskVoucherCut } from "@/lib/hhg-vouchers";

/** Tạm ẩn nút sơ đồ bàn Lòng Nướng. Đặt true khi mở lại. */
const SHOW_LONG_NUONG_TABLE_MAP = false;
/** Vé hồ trên đơn gộp — không cần dòng quét hồ đang chọn. */
const BOARD_POOL_KEY = "board";

type CatalogItem = MiaOiMenuItem | SpaMenuItem;

type ScanTicketItem = {
  nameVi: string;
  qty: number;
  unitPriceVnd: number;
  itemId?: string;
  pointsDiscountVnd?: number;
  pointsRedeemTier?: number | null;
};

type Scan = {
  id: string;
  at: string;
  eventType: string;
  operationalStatus?: string;
  serviceCode: string;
  serviceName: string;
  orderSummary: string | null;
  ticketVerified?: boolean;
  totalVnd?: number | null;
  orderId?: string | null;
  cartToken?: string | null;
  source?: string | null;
  /** Tạo đơn đã được thay bằng đơn món — không hiện thành dòng riêng. */
  walkInConsumed?: boolean;
  /** Món Mía gắn vào lần quét hồ (finalize Tạo đơn). */
  deskOrderZone?: string | null;
  /** Đơn Mía khi lần quét hồ được lưu cùng một lần (bundle). */
  miaOrderId?: string | null;
  ticketItems?: ScanTicketItem[];
  /** Set when staff saved hồ + mía in one click. */
  deskBundleId?: string | null;
  manualDiscountVnd?: number | null;
  manualDiscountNote?: string | null;
  /** Nhân viên xác thực / mở đơn. */
  staffName?: string | null;
};

type DayOrder = {
  id: string;
  at: string;
  status: string;
  totalVnd: number;
  serviceCode?: string;
  staffName?: string | null;
  items: {
    itemId?: string;
    nameVi: string;
    qty: number;
    unitPriceVnd: number;
  }[];
};

type GuestCartPreview = {
  token: string;
  zoneCode: string;
  zoneName: string | null;
  items: {
    id: string;
    nameVi: string;
    qty: number;
    priceVnd: number;
    pointsRedeemQty?: number;
  }[];
  totalVnd: number;
  status?: string;
  adminNote?: string | null;
  hasBillPhoto?: boolean;
  createdAt?: string;
  expiresAt?: string;
  billText?: string;
  promoLabel?: string | null;
  hasVoucher?: boolean;
  hasPointsRedeem?: boolean;
};

function segmentMarkStyle(segment: string): {
  background: string;
  color: string;
} {
  if (segment === "VIP") return { background: "#fef3c7", color: "#92400e" };
  if (segment === "MEMBER") return { background: "#dbeafe", color: "#1d4ed8" };
  if (segment === "WALK_IN") return { background: "#ffedd5", color: "#9a3412" };
  return { background: "#f1f5f9", color: "#334155" };
}

type Arrival = {
  id: string;
  customerCode: string;
  fullName: string | null;
  phone: string | null;
  shortId: string | null;
  segment: string;
  segmentLabel: string;
  /** Current package start. Orders before this stay Khách. */
  vipStartedAt?: string | null;
  pointsBalance?: number;
  /** Lượt tự chọn còn lại của học viên bơi cùng SĐT. */
  swimBonusLeft?: number | null;
  packageLabel?: string | null;
  packageExpiresAt?: string | null;
  updatedAt: string;
  lastVisitAt: string | null;
  pendingAdmin: boolean;
  needsApproval?: boolean;
  checkedIn?: boolean;
  openCart?: GuestCartPreview | null;
  carts?: GuestCartPreview[];
  cartBillText?: string | null;
  todayScans: Scan[];
  todayOrders: DayOrder[];
  todayPackageVnd: number;
  todayScanCount: number;
  todayOrderCount: number;
};

type CartLine = { itemId: string; qty: number; useAltPrice?: boolean };

type Step = "pick" | "login" | "dashboard";

/** One table row = one cart request (or legacy scan). */
function ticketMoment(t: {
  orderId: string | null;
  scanAt: string | null;
  arrival: { todayOrders?: { id: string; at: string }[] };
}): string | null {
  if (t.orderId) {
    const order = t.arrival.todayOrders?.find((o) => o.id === t.orderId);
    if (order?.at) return order.at;
  }
  return t.scanAt;
}

type DeskTicket = {
  key: string;
  arrival: Arrival;
  cart: GuestCartPreview | null;
  scan: Scan | null;
  orderId: string | null;
  scanAt: string | null;
  orderStatus: "pending" | "ordered";
  orderLabel: string;
  billText: string;
  billTotal: number | null;
  billItems: {
    nameVi: string;
    qty: number;
    priceVnd?: number;
    lineVnd?: number;
    pointsLabel?: string | null;
  }[];
  pendingAdmin: boolean;
  needsApproval: boolean;
  checkInUi: CheckInUi;
  /** Voucher / đổi điểm trên QR */
  promoLabel: string;
  hasVoucher: boolean;
  hasPointsRedeem: boolean;
  /** Điểm cộng từ đơn này (10.000đ sau giảm = 1 điểm) */
  pointsEarned: number;
  /** both = một lần lưu hồ + mía. vip = đơn khu VIP. */
  orderKind?: "both" | "mia" | "olympic" | "vip" | "other";
  /** Đơn đồ uống khi dòng là hồ + mía. Undo vẫn dùng scan hồ. */
  miaOrderId?: string | null;
  /** Cùng lần lưu hồ + mía (client bundle id). */
  deskBundleId?: string | null;
  manualDiscountVnd?: number;
  manualDiscountNote?: string | null;
  staffName?: string | null;
};

type DeskZoneFilter = "all" | "both" | "mia" | "olympic" | "vip";
type DeskOrderSort =
  | "time-desc"
  | "time-asc"
  | "price-desc"
  | "price-asc"
  | "staff"
  | "name";

const DESK_ZONE_FILTERS: { id: DeskZoneFilter; label: string }[] = [
  { id: "all", label: "Tất cả" },
  { id: "both", label: "Mía Ơi + Olympic" },
  { id: "mia", label: "Mía Ơi" },
  { id: "olympic", label: "Olympic" },
  { id: "vip", label: "VIP" },
];

const DESK_ORDER_SORTS: { id: DeskOrderSort; label: string }[] = [
  { id: "time-desc", label: "Mới nhất" },
  { id: "time-asc", label: "Cũ nhất" },
  { id: "price-desc", label: "Cao đến thấp" },
  { id: "price-asc", label: "Thấp đến cao" },
  { id: "staff", label: "Nhân viên đứng ca" },
  { id: "name", label: "Tên khách" },
];

const SORT_GROUP: Record<DeskOrderSort, string> = {
  "time-desc": "time",
  "time-asc": "time",
  "price-desc": "price",
  "price-asc": "price",
  staff: "staff",
  name: "name",
};

/** Add a sort, or replace the other direction of the same kind. Click again to clear it. */
function toggleOrderSort(current: DeskOrderSort[], next: DeskOrderSort) {
  const group = SORT_GROUP[next];
  const idx = current.findIndex((id) => SORT_GROUP[id] === group);
  if (idx >= 0 && current[idx] === next) {
    const removed = current.filter((_, i) => i !== idx);
    return removed.length ? removed : current;
  }
  if (idx >= 0) {
    const copy = [...current];
    copy[idx] = next;
    return copy;
  }
  return [...current, next];
}

const DESK_PACKAGE_FILTERS: { id: string; label: string }[] = [
  "oly-1m",
  "oly-3m",
  "oly-6m",
  "oly-12m",
  "vip-1m-child",
  "vip-1m-adult",
  "vip-3m-child",
  "vip-3m-adult",
  "vip-6m-child",
  "vip-6m-adult",
  "vip-12m-child",
  "vip-12m-adult",
]
  .map((id) => {
    const item = getPoolItem(id);
    return item ? { id, label: item.nameVi } : null;
  })
  .filter((row): row is { id: string; label: string } => !!row);

const PACKAGE_LABEL = new Map(
  DESK_PACKAGE_FILTERS.map((p) => [p.id, p.label])
);

function orderSettled(t: DeskTicket) {
  const status = t.cart?.status;
  return t.orderStatus === "ordered" || status === "OPEN" || status === "USED";
}

function orderInk(settled: boolean) {
  return settled ? "#047857" : "#b45309";
}

/** Overlay QR đổi điểm onto order lines when ticket metadata lost the discount. */
function withCartPointCover<
  T extends {
    id?: string;
    nameVi: string;
    qty: number;
    unitPriceVnd: number;
    pointsDiscountVnd?: number;
    pointsRedeemTier?: number | null;
  },
>(
  orderLines: T[],
  cartItems: GuestCartPreview["items"] | undefined,
  zoneCode?: string | null
): T[] {
  if (!cartItems?.length || !orderLines.length) return orderLines;
  if (orderLines.some((l) => (l.pointsDiscountVnd || 0) > 0)) return orderLines;
  const z = String(zoneCode || "").toUpperCase();
  const kind = z === "OLYMPIC_POOL" || z === "OLYMPIC" ? "ticket" : "drink";
  const covered = coverDrinkCartPoints(
    orderLines.map((l) => ({
      itemId: String(l.id || ""),
      qty: l.qty,
      unitPriceVnd: l.unitPriceVnd,
      pointsDiscountVnd: l.pointsDiscountVnd || 0,
      pointsRedeemTier: l.pointsRedeemTier ?? null,
    })),
    cartItems,
    kind
  );
  return orderLines.map((line, i) => {
    const hit = covered[i];
    if (!hit || !(hit.pointsDiscountVnd > 0)) return line;
    return {
      ...line,
      pointsDiscountVnd: hit.pointsDiscountVnd,
      pointsRedeemTier: hit.pointsRedeemTier ?? line.pointsRedeemTier,
    };
  });
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function billFromItems(
  items: { nameVi: string; qty: number }[],
  totalVnd?: number | null
) {
  const list = items
    .map((i) => `${i.qty}x ${i.nameVi}`)
    .filter(Boolean)
    .join(", ");
  if (!list) return totalVnd ? formatVnd(totalVnd) : "—";
  return totalVnd ? `${list} · ${formatVnd(totalVnd)}` : list;
}

function proofPartial(status?: string | null, hasBill?: boolean) {
  if (hasBill) return false;
  const s = status || "";
  return s === "OPEN" || s === "USED";
}

function cartOrderLabel(
  status: string | undefined,
  zoneCode: string | null,
  adminNote?: string | null
) {
  const z = (zoneCode || "").toUpperCase();
  if (z === "LONG_NUONG") {
    if (status === "PENDING_APPROVAL") return "Chờ gọi xác nhận";
    if (status === "OPEN") return "Đã gọi xác nhận";
  }
  if (status === "USED") {
    if (z === "MIA_OI") return "Đã TT · hoàn tất";
    if (
      (z === "SAUNA" || z === "SPA" || z === "LONG_NUONG") &&
      (adminNote || "").trim() !== "Đã dùng"
    ) {
      return "Đang dùng";
    }
    return "Đã dùng";
  }
  if (status === "OPEN") return "Thanh toán thành công";
  if (status === "PENDING_APPROVAL") return "Chờ duyệt";
  if (status === "REJECTED") return "Từ chối";
  if (status === "CANCELLED") {
    return (adminNote || "").includes("huỷ") ? "Đã huỷ" : "Khách xoá";
  }
  if (status === "NO_SHOW") return "Không tới";
  return status || "—";
}

function manualDiscountFields(scan?: {
  manualDiscountVnd?: number | null;
  manualDiscountNote?: string | null;
} | null) {
  const manualDiscountVnd = Math.max(
    0,
    Math.round(Number(scan?.manualDiscountVnd) || 0)
  );
  const manualDiscountNote = String(scan?.manualDiscountNote || "").trim();
  if (manualDiscountVnd <= 0 && !manualDiscountNote) return {};
  return {
    manualDiscountVnd,
    manualDiscountNote: manualDiscountNote || null,
  };
}

function withManualDiscount(
  text: string,
  amount?: number | null,
  note?: string | null
) {
  const vnd = Math.max(0, Math.round(Number(amount) || 0));
  const reason = String(note || "").trim();
  if (vnd <= 0) return text;
  const bit = `Giảm tay −${formatVnd(vnd)}${reason ? ` (${reason})` : ""}`;
  if (text.includes("Giảm tay")) return text;
  if (!text || text === "—") return bit;
  return `${text} · ${bit}`;
}

function scanLooksFinalized(s: Scan) {
  return !!(
    s.ticketVerified ||
    s.orderId ||
    s.orderSummary ||
    s.operationalStatus === "ACKNOWLEDGED" ||
    s.eventType === "MIA_OI_ORDER" ||
    s.eventType === "SPA_ORDER" ||
    s.eventType === "POOL_ORDER" ||
    (s.ticketItems && s.ticketItems.length > 0 && (s.totalVnd || 0) > 0)
  );
}

/**
 * Chỉ ẩn shell đã đánh dấu consumed.
 * Không ẩn Tạo đơn trống chỉ vì khách có đơn khác — NV có thể tạo nhiều lần.
 */
function hideWalkInShell(scan: Scan, _arrival: Arrival) {
  return scan.eventType === "SERVICE_USE" && scan.walkInConsumed === true;
}

function visitFinalizedLabel(zoneCode: string | null, withCatalog: boolean) {
  if (withCatalog) return "Đã order";
  if ((zoneCode || "") === "OLYMPIC_POOL") return "Đã xác thực";
  return "Đã check-in";
}

function poolTicketLocked(t: DeskTicket) {
  return (
    t.orderStatus === "ordered" ||
    !!t.orderId ||
    !!t.scan && scanLooksFinalized(t.scan)
  );
}

function poolHistoryTicket(t: DeskTicket) {
  const code = String(t.scan?.serviceCode || t.cart?.zoneCode || "").toUpperCase();
  return isOlympicPoolScanCode(code);
}

function isVipOrderCode(code: string | null | undefined) {
  const z = String(code || "")
    .trim()
    .toUpperCase();
  return z === "VIP" || z === "VIP_RESORT";
}

function ticketSide(t: DeskTicket): "mia" | "olympic" | "vip" | "other" {
  const deskZone = String(t.scan?.deskOrderZone || "").toUpperCase();
  const code = String(t.scan?.serviceCode || t.cart?.zoneCode || "").toUpperCase();
  const orderCode = t.orderId
    ? t.arrival.todayOrders?.find((o) => o.id === t.orderId)?.serviceCode
    : "";
  if (
    isVipOrderCode(deskZone) ||
    isVipOrderCode(code) ||
    isVipOrderCode(t.cart?.zoneCode) ||
    isVipOrderCode(orderCode)
  ) {
    return "vip";
  }
  const text = `${t.billText || ""} ${t.billItems.map((i) => i.nameVi).join(" ")}`.trim();
  const hasBill =
    t.billItems.length > 0 || (text !== "" && text !== "—" && text !== "-");
  if (!hasBill) return "other";
  if (deskZone === "MIA_OI") return "mia";
  if (deskZone === "OLYMPIC_POOL" || deskZone === "OLYMPIC") return "olympic";
  const event = String(t.scan?.eventType || "").toUpperCase();
  if (event === "POOL_ORDER") return "olympic";
  if (event === "MIA_OI_ORDER" || code === "MIA_OI") return "mia";
  const lower = text.toLowerCase();
  const olympic = /vé bơi|bikini|kính|quần bơi|nón bơi|phao/.test(lower);
  const mia = /mía|mia |cà phê|trà |matcha|sinh tố|đá xay|topping/.test(lower);
  if (olympic && !mia) return "olympic";
  if (mia && !olympic) return "mia";
  if (isOlympicPoolScanCode(code)) return "olympic";
  return "other";
}

function ticketTime(t: DeskTicket) {
  const raw = t.scanAt || "";
  const n = raw ? new Date(raw).getTime() : 0;
  return Number.isFinite(n) ? n : 0;
}

function ticketStaffName(t: DeskTicket) {
  return String(t.staffName || t.scan?.staffName || "").trim();
}

function ticketHasPackage(t: DeskTicket, itemId: string) {
  const name = PACKAGE_LABEL.get(itemId) || "";
  if (t.cart?.items.some((i) => i.id === itemId)) return true;
  if (t.scan?.ticketItems?.some((i) => i.itemId === itemId)) return true;
  if (name && t.billItems.some((i) => i.nameVi === name)) return true;
  const orderIds = new Set(
    [t.orderId, t.miaOrderId].filter((id): id is string => !!id)
  );
  if (!orderIds.size) return false;
  return (t.arrival.todayOrders || []).some(
    (o) => orderIds.has(o.id) && o.items.some((i) => i.itemId === itemId)
  );
}

function foldVi(s: string) {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase();
}

function compareOne(a: DeskTicket, b: DeskTicket, sort: DeskOrderSort) {
  if (sort === "time-asc") return ticketTime(a) - ticketTime(b);
  if (sort === "time-desc") return ticketTime(b) - ticketTime(a);
  if (sort === "price-asc") return (a.billTotal || 0) - (b.billTotal || 0);
  if (sort === "price-desc") return (b.billTotal || 0) - (a.billTotal || 0);
  if (sort === "staff") {
    const as = ticketStaffName(a);
    const bs = ticketStaffName(b);
    if (!as && bs) return 1;
    if (as && !bs) return -1;
    return as.localeCompare(bs, "vi");
  }
  return String(a.arrival.fullName || "").localeCompare(
    String(b.arrival.fullName || ""),
    "vi"
  );
}

function compareDeskTickets(a: DeskTicket, b: DeskTicket, sorts: DeskOrderSort[]) {
  for (const sort of sorts) {
    const diff = compareOne(a, b, sort);
    if (diff) return diff;
  }
  return a.key.localeCompare(b.key);
}

/** Gộp vé hồ + đồ uống đã lưu cùng một lần thành 1 dòng. */
function mergeOrderPair(a: DeskTicket, b: DeskTicket): DeskTicket {
  const primary = ticketTime(a) >= ticketTime(b) ? a : b;
  const pool = ticketSide(a) === "olympic" ? a : b;
  const items = [...a.billItems, ...b.billItems];
  const total = (a.billTotal || 0) + (b.billTotal || 0);
  return {
    ...primary,
    key: `bundle-${a.key}-${b.key}`,
    scan: pool.scan || primary.scan,
    billItems: items,
    billTotal: total,
    billText: items.length
      ? `${items.map((i) => `${i.qty}× ${i.nameVi}`).join(", ")} · ${formatVnd(total)}`
      : [a.billText, b.billText].filter((x) => x && x !== "—").join(" · "),
    manualDiscountVnd:
      (a.manualDiscountVnd || 0) + (b.manualDiscountVnd || 0),
    manualDiscountNote:
      [
        ...new Set(
          [a.manualDiscountNote, b.manualDiscountNote]
            .map((n) => String(n || "").trim())
            .filter(Boolean)
        ),
      ].join(" · ") || null,
    pointsEarned: (a.pointsEarned || 0) + (b.pointsEarned || 0),
    hasVoucher: a.hasVoucher || b.hasVoucher,
    hasPointsRedeem: a.hasPointsRedeem || b.hasPointsRedeem,
    promoLabel:
      [a.promoLabel, b.promoLabel].filter((p) => p && p !== "—").join(" · ") ||
      "—",
    orderKind: "both",
    staffName:
      [a.staffName, b.staffName, a.scan?.staffName, b.scan?.staffName]
        .map((n) => String(n || "").trim())
        .find(Boolean) || null,
    miaOrderId:
      a.miaOrderId ||
      b.miaOrderId ||
      (ticketSide(a) === "mia" ? a.orderId : ticketSide(b) === "mia" ? b.orderId : null),
    orderStatus: "ordered",
    orderLabel: "Đã order",
  };
}

function miaHistoryOrderId(t: DeskTicket) {
  if (t.orderKind === "both") return t.miaOrderId || null;
  if (ticketSide(t) !== "mia") return null;
  return t.orderId;
}

/** Fallback khi thiếu deskBundleId — một lần Lưu hồ→mía thường lệch dưới 2 phút. */
const BUNDLE_PAIR_MS = 2 * 60 * 1000;

function ticketBundleId(t: DeskTicket) {
  return String(t.deskBundleId || t.scan?.deskBundleId || "").trim();
}

function pairMiaOlympic(
  pool: DeskTicket,
  mia: DeskTicket,
  key: string,
  bundleId?: string
) {
  const merged = mergeOrderPair(pool, mia);
  merged.key = key;
  merged.orderKind = "both";
  if (bundleId) merged.deskBundleId = bundleId;
  return merged;
}

function groupMiaOlympicOrders(tickets: DeskTicket[]): DeskTicket[] {
  const byGuest = new Map<string, DeskTicket[]>();
  for (const t of tickets) {
    const id = t.arrival?.id || "";
    const list = byGuest.get(id) || [];
    list.push(t);
    byGuest.set(id, list);
  }
  const out: DeskTicket[] = [];
  for (const list of byGuest.values()) {
    const used = new Set<string>();

    /** 1) Cùng deskBundleId */
    const byBundle = new Map<string, DeskTicket[]>();
    for (const t of list) {
      if (t.orderStatus !== "ordered") continue;
      if (ticketSide(t) === "other") continue;
      const id = ticketBundleId(t);
      if (!id) continue;
      const group = byBundle.get(id) || [];
      group.push(t);
      byBundle.set(id, group);
    }
    for (const [id, group] of byBundle) {
      const mia = group.find((t) => ticketSide(t) === "mia");
      const olympic = group.find((t) => ticketSide(t) === "olympic");
      if (!mia || !olympic) continue;
      out.push(pairMiaOlympic(olympic, mia, `bundle-${id}`, id));
      used.add(olympic.key);
      used.add(mia.key);
    }

    /** 2) Pool scan.miaOrderId ↔ đơn Mía */
    const leftover = () =>
      list.filter((t) => !used.has(t.key) && t.orderStatus === "ordered");
    for (const pool of leftover().filter((t) => ticketSide(t) === "olympic")) {
      const miaId = String(pool.scan?.miaOrderId || "").trim();
      if (!miaId) continue;
      const mia = leftover().find(
        (t) =>
          ticketSide(t) === "mia" &&
          (t.orderId === miaId || t.miaOrderId === miaId)
      );
      if (!mia) continue;
      out.push(
        pairMiaOlympic(
          pool,
          mia,
          `bundle-mia-${miaId}`,
          ticketBundleId(pool) || ticketBundleId(mia) || undefined
        )
      );
      used.add(pool.key);
      used.add(mia.key);
    }

    /** 3) Fallback thời gian — cùng khách, hồ + mía gần nhau */
    const olympicLeft = leftover()
      .filter((t) => ticketSide(t) === "olympic")
      .sort((a, b) => ticketTime(b) - ticketTime(a));
    const miaLeft = leftover()
      .filter((t) => ticketSide(t) === "mia")
      .sort((a, b) => ticketTime(b) - ticketTime(a));
    for (const pool of olympicLeft) {
      if (used.has(pool.key)) continue;
      const partner = miaLeft.find((m) => {
        if (used.has(m.key)) return false;
        return Math.abs(ticketTime(pool) - ticketTime(m)) <= BUNDLE_PAIR_MS;
      });
      if (!partner) continue;
      out.push(
        pairMiaOlympic(pool, partner, `bundle-time-${pool.key}-${partner.key}`)
      );
      used.add(pool.key);
      used.add(partner.key);
    }

    for (const t of list) {
      if (used.has(t.key)) continue;
      out.push({
        ...t,
        orderKind: t.orderKind || ticketSide(t),
        deskBundleId: ticketBundleId(t) || t.deskBundleId || null,
      });
    }
  }
  return out.sort((a, b) => ticketTime(b) - ticketTime(a));
}

function scanForOrderId(scans: Scan[], orderId: string) {
  return scans.find((s) => s.orderId === orderId) || null;
}

function billScanScore(s: Scan) {
  const items = s.ticketItems || [];
  const hasDisc = items.some((i) => (i.pointsDiscountVnd || 0) > 0);
  return (
    (hasDisc ? 1000 : 0) +
    items.length * 10 +
    (s.cartToken ? 1 : 0) +
    (s.eventType === "MIA_OI_ORDER" || s.eventType === "POOL_ORDER" ? 5 : 0)
  );
}

/** One confirmed visit per order, even if several scans were merged. */
function confirmedPoolBills(scans: Scan[]): Scan[] {
  const byOrder = new Map<string, Scan>();
  for (const s of scans) {
    if (!s.orderId || !scanLooksFinalized(s)) continue;
    const prev = byOrder.get(s.orderId);
    if (!prev || billScanScore(s) > billScanScore(prev)) {
      byOrder.set(s.orderId, s);
    }
  }
  return [...byOrder.values()];
}

function claimOrderForCart(
  orders: DayOrder[],
  cart: GuestCartPreview,
  seen: Set<string>
): DayOrder | null {
  const t = cart.createdAt ? new Date(cart.createdAt).getTime() : NaN;
  let best: DayOrder | null = null;
  let bestDt = Infinity;
  for (const o of orders) {
    if (o.status === "CANCELLED" || seen.has(o.id)) continue;
    if (cart.totalVnd != null && o.totalVnd !== cart.totalVnd) continue;
    const dt = Number.isFinite(t)
      ? Math.abs(new Date(o.at).getTime() - t)
      : 0;
    if (dt > 15 * 60 * 1000) continue;
    if (dt < bestDt) {
      best = o;
      bestDt = dt;
    }
  }
  return best;
}

function matchConfirmedBill(
  bills: Scan[],
  cart: GuestCartPreview,
  usedCartCount: number
): Scan | null {
  const linked = bills.find(
    (s) => s.cartToken && cart.token && s.cartToken === cart.token
  );
  if (linked) return linked;
  if (cart.status === "USED" && bills.length === 1 && usedCartCount === 1) {
    const billAt = new Date(bills[0].at).getTime();
    const cartAt = cart.createdAt ? new Date(cart.createdAt).getTime() : NaN;
    if (
      !Number.isFinite(cartAt) ||
      Math.abs(billAt - cartAt) <= 15 * 60 * 1000
    ) {
      return bills[0];
    }
  }
  return null;
}

function billItemsFromPoints(
  items: {
    id?: string;
    nameVi: string;
    qty: number;
    unitPriceVnd: number;
    pointsDiscountVnd?: number;
    pointsRedeemTier?: number | null;
  }[]
) {
  return foldPointsOntoItems(items).map((v) => ({
    nameVi: v.nameVi,
    qty: v.qty,
    lineVnd: v.netVnd,
    pointsLabel: v.pointsLabel,
  }));
}

/** Column badge uses the points actually on the bill, including staff redeem at confirm. */
function promoFromBill(
  billItems: { pointsLabel?: string | null }[],
  base: { promoLabel: string; hasVoucher: boolean; hasPointsRedeem: boolean }
) {
  let used = 0;
  for (const item of billItems) {
    const match = String(item.pointsLabel || "").match(/Đổi\s+(\d+)\s+điểm/i);
    if (match) used += Number(match[1]) || 0;
  }
  if (used <= 0) return base;
  const pointsText = `Đổi ${used} điểm`;
  const current =
    base.promoLabel && base.promoLabel !== "—" ? base.promoLabel : "";
  const rest = current
    .replace(/Đổi\s+\d+\s+điểm/gi, "")
    .replace(/\s*·\s*·\s*/g, " · ")
    .replace(/^\s*·\s*|\s*·\s*$/g, "")
    .trim();
  return {
    promoLabel: rest ? `${rest} · ${pointsText}` : pointsText,
    hasVoucher: base.hasVoucher,
    hasPointsRedeem: true,
  };
}

function confirmedBillForCart(
  scans: Scan[],
  cart: GuestCartPreview,
  usedCartCount: number
): Scan | null {
  return matchConfirmedBill(confirmedPoolBills(scans), cart, usedCartCount);
}

/** Mỗi cart request = 1 dòng. Cùng khách tạo 3–4 lần → 3–4 dòng. */
function buildDeskTickets(
  arrivals: Arrival[],
  zoneCode: string | null,
  withCatalog: boolean
): DeskTicket[] {
  const tickets: DeskTicket[] = [];

  for (const a of arrivals) {
    const carts = a.carts?.length
      ? a.carts
      : a.openCart
        ? [a.openCart]
        : [];
    const seenOrders = new Set<string>();
    const seenScanIds = new Set<string>();
    const usedCartCount = carts.filter((c) => c.status === "USED").length;
    const confirmedBills = confirmedPoolBills(a.todayScans || []);
    const doneLabel = visitFinalizedLabel(zoneCode, withCatalog);

    for (const cart of carts) {
      const ui = checkInUiFromCart({
        status: cart.status || "OPEN",
        expiresAt: cart.expiresAt,
        zoneCode: cart.zoneCode || zoneCode || undefined,
      });
      const need = cart.status === "PENDING_APPROVAL";
      const confirmed = matchConfirmedBill(
        confirmedBills,
        cart,
        usedCartCount
      );
      if (confirmed?.orderId) seenOrders.add(confirmed.orderId);
      if (confirmed) seenScanIds.add(confirmed.id);
      const claimed =
        !confirmed && cart.status === "USED"
          ? claimOrderForCart(a.todayOrders || [], cart, seenOrders)
          : null;
      if (claimed) {
        seenOrders.add(claimed.id);
        for (const sc of a.todayScans || []) {
          if (sc.orderId === claimed.id) seenScanIds.add(sc.id);
        }
      }
      if (confirmed?.orderId) {
        for (const sc of a.todayScans || []) {
          if (sc.orderId === confirmed.orderId) seenScanIds.add(sc.id);
        }
      }
      const sourceItems = confirmed
        ? withCartPointCover(
            (confirmed.ticketItems || []).map((i) => ({
              id: i.itemId,
              nameVi: i.nameVi,
              qty: i.qty,
              unitPriceVnd: i.unitPriceVnd,
              pointsDiscountVnd: i.pointsDiscountVnd,
              pointsRedeemTier: i.pointsRedeemTier,
            })),
            cart.items,
            cart.zoneCode || zoneCode
          )
        : claimed
          ? withCartPointCover(
              claimed.items.map((i) => ({
                id: i.itemId,
                nameVi: i.nameVi,
                qty: i.qty,
                unitPriceVnd: i.unitPriceVnd,
              })),
              cart.items,
              cart.zoneCode || zoneCode
            )
          : previewCartPointLines(cart.items || []);
      const billItems = billItemsFromPoints(sourceItems);
      const promo = parseCartPromo(cart.items);
      const promoView = promoFromBill(billItems, {
        promoLabel:
          cart.promoLabel && cart.promoLabel !== "—"
            ? cart.promoLabel
            : promo.label,
        hasVoucher: promo.hasVoucher || !!cart.hasVoucher,
        hasPointsRedeem: promo.hasPointsRedeem || !!cart.hasPointsRedeem,
      });
      const ordered =
        cart.status === "USED" || ui === "yes" || !!confirmed || !!claimed;
      tickets.push({
        key: `cart-${cart.token}`,
        arrival: a,
        cart,
        scan: confirmed,
        orderId: confirmed?.orderId ?? claimed?.id ?? null,
        scanAt: cart.createdAt || a.lastVisitAt,
        orderStatus: ordered ? "ordered" : "pending",
        orderLabel: cartOrderLabel(cart.status, zoneCode, cart.adminNote),
        billText:
          (confirmed
            ? confirmed.orderSummary
            : claimed
              ? billFromItems(claimed.items, claimed.totalVnd)
              : cart.billText) ||
          billItems.map((i) => `${i.qty}× ${i.nameVi}`).join(", ") ||
          "—",
        billTotal: confirmed
          ? confirmed.totalVnd ?? cart.totalVnd
          : claimed
            ? claimed.totalVnd
            : cart.totalVnd,
        billItems,
        pendingAdmin: need,
        needsApproval: need,
        checkInUi: ui,
        promoLabel: promoView.promoLabel,
        hasVoucher: promoView.hasVoucher,
        hasPointsRedeem: promoView.hasPointsRedeem,
        pointsEarned: pointsFromSubtotal(
          confirmed
            ? confirmed.totalVnd ?? cart.totalVnd
            : claimed
              ? claimed.totalVnd
              : cart.totalVnd
        ),
        ...manualDiscountFields(confirmed),
      });
    }

    for (const bill of confirmedBills) {
      if (bill.orderId && seenOrders.has(bill.orderId)) continue;
      if (seenScanIds.has(bill.id)) continue;
      if (bill.orderId) seenOrders.add(bill.orderId);
      seenScanIds.add(bill.id);
      const lines = (bill.ticketItems || []).map((i) => ({
        id: i.itemId,
        nameVi: i.nameVi,
        qty: i.qty,
        unitPriceVnd: i.unitPriceVnd,
        pointsDiscountVnd: i.pointsDiscountVnd,
        pointsRedeemTier: i.pointsRedeemTier,
      }));
      const billItems = billItemsFromPoints(lines);
      const promoView = promoFromBill(billItems, {
        promoLabel: "—",
        hasVoucher: false,
        hasPointsRedeem: false,
      });
      tickets.push({
        key: `bill-${bill.orderId || bill.id}`,
        arrival: a,
        cart: null,
        scan: bill,
        orderId: bill.orderId ?? null,
        scanAt: bill.at,
        orderStatus: "ordered",
        orderLabel: doneLabel,
        billText:
          bill.orderSummary || billFromItems(lines, bill.totalVnd) || "—",
        billTotal: bill.totalVnd ?? null,
        billItems,
        pendingAdmin: false,
        needsApproval: false,
        checkInUi: "yes",
        promoLabel: promoView.promoLabel,
        hasVoucher: promoView.hasVoucher,
        hasPointsRedeem: promoView.hasPointsRedeem,
        pointsEarned: pointsFromSubtotal(bill.totalVnd ?? 0),
        deskBundleId: bill.deskBundleId || null,
        staffName: bill.staffName || null,
        ...manualDiscountFields(bill),
      });
    }

    for (const order of a.todayOrders || []) {
      if (order.status === "CANCELLED") continue;
      if (seenOrders.has(order.id)) continue;
      seenOrders.add(order.id);
      const scan = scanForOrderId(a.todayScans || [], order.id);
      if (scan) seenScanIds.add(scan.id);
      const orderLines = (
        scan?.ticketItems?.length ? scan.ticketItems : order.items
      ).map((it) => {
        const tierRaw =
          "pointsRedeemTier" in it ? Number(it.pointsRedeemTier) : NaN;
        const pointsRedeemTier: number | null =
          tierRaw === 50 || tierRaw === 100 ? tierRaw : null;
        return {
          id: "itemId" in it ? it.itemId : undefined,
          nameVi: it.nameVi,
          qty: it.qty,
          unitPriceVnd: it.unitPriceVnd,
          pointsDiscountVnd:
            "pointsDiscountVnd" in it ? Number(it.pointsDiscountVnd) || 0 : 0,
          pointsRedeemTier,
        };
      });
      const orderBill = billItemsFromPoints(orderLines);
      const orderPromo = promoFromBill(orderBill, {
        promoLabel: "—",
        hasVoucher: false,
        hasPointsRedeem: false,
      });
      tickets.push({
        key: `order-${order.id}`,
        arrival: a,
        cart: null,
        scan,
        orderId: order.id,
        scanAt: order.at,
        orderStatus: "ordered",
        orderLabel: doneLabel,
        billText: billFromItems(order.items, order.totalVnd),
        billTotal: order.totalVnd,
        billItems: orderBill,
        pendingAdmin: false,
        needsApproval: false,
        checkInUi: "yes",
        promoLabel: orderPromo.promoLabel,
        hasVoucher: orderPromo.hasVoucher,
        hasPointsRedeem: orderPromo.hasPointsRedeem,
        pointsEarned: pointsFromSubtotal(order.totalVnd),
        deskBundleId: scan?.deskBundleId || null,
        staffName: order.staffName || scan?.staffName || null,
        ...manualDiscountFields(scan),
      });
    }

    for (const scan of a.todayScans || []) {
      if (seenScanIds.has(scan.id)) continue;
      if (hideWalkInShell(scan, a)) {
        seenScanIds.add(scan.id);
        continue;
      }
      if (scan.orderId && seenOrders.has(scan.orderId)) continue;
      if (!scanLooksFinalized(scan)) continue;
      seenScanIds.add(scan.id);
      if (scan.orderId) seenOrders.add(scan.orderId);
      const lines = (scan.ticketItems || []).map((i) => ({
        id: i.itemId,
        nameVi: i.nameVi,
        qty: i.qty,
        unitPriceVnd: i.unitPriceVnd,
        pointsDiscountVnd: i.pointsDiscountVnd,
        pointsRedeemTier: i.pointsRedeemTier,
      }));
      const scanBill = billItemsFromPoints(lines);
      const scanPromo = promoFromBill(scanBill, {
        promoLabel: "—",
        hasVoucher: false,
        hasPointsRedeem: false,
      });
      tickets.push({
        key: `done-scan-${scan.id}`,
        arrival: a,
        cart: null,
        scan,
        orderId: scan.orderId ?? null,
        scanAt: scan.at,
        orderStatus: "ordered",
        orderLabel: doneLabel,
        billText:
          scan.orderSummary || billFromItems(lines, scan.totalVnd) || "—",
        billTotal: scan.totalVnd ?? null,
        billItems: scanBill,
        pendingAdmin: false,
        needsApproval: false,
        checkInUi: "yes",
        promoLabel: scanPromo.promoLabel,
        hasVoucher: scanPromo.hasVoucher,
        hasPointsRedeem: scanPromo.hasPointsRedeem,
        pointsEarned: pointsFromSubtotal(scan.totalVnd ?? 0),
        deskBundleId: scan.deskBundleId || null,
        staffName: scan.staffName || null,
        ...manualDiscountFields(scan),
      });
    }

    const hasOpenOrder = carts.some((c) => {
      const status = String(c.status || "");
      return status === "PENDING_APPROVAL" || status === "OPEN";
    });
    const listedCartTokens = new Set(
      carts.map((c) => c.token).filter((token): token is string => !!token)
    );

    for (const scan of a.todayScans || []) {
      if (seenScanIds.has(scan.id)) continue;
      if (scan.eventType !== "SERVICE_USE") continue;
      if (hideWalkInShell(scan, a) || scanLooksFinalized(scan)) {
        seenScanIds.add(scan.id);
        continue;
      }
      // Quét QR đơn là check-in, không phải order mới — mọi khu.
      const checkInForListedCart =
        !!scan.cartToken && listedCartTokens.has(scan.cartToken);
      if (hasOpenOrder || checkInForListedCart) {
        const host = [...tickets].reverse().find((t) => {
          if (t.arrival.id !== a.id || !t.cart || t.scan) return false;
          const status = String(t.cart.status || "");
          if (status !== "OPEN" && status !== "PENDING_APPROVAL") return false;
          return !scan.cartToken || t.cart.token === scan.cartToken;
        });
        if (host) host.scan = scan;
        seenScanIds.add(scan.id);
        continue;
      }
      seenScanIds.add(scan.id);
      tickets.push({
        key: `scan-${scan.id}`,
        arrival: a,
        cart: null,
        scan,
        orderId: null,
        scanAt: scan.at,
        orderStatus: "pending",
        orderLabel: withCatalog ? "Chưa có order" : "Chưa xác thực",
        billText: "—",
        billTotal: null,
        billItems: [],
        pendingAdmin: true,
        needsApproval: false,
        checkInUi: "pending",
        promoLabel: "—",
        hasVoucher: false,
        hasPointsRedeem: false,
        pointsEarned: 0,
        staffName: scan.staffName || null,
      });
    }
  }

  const sorted = tickets.sort((a, b) => {
    const ta = a.scanAt ? new Date(a.scanAt).getTime() : 0;
    const tb = b.scanAt ? new Date(b.scanAt).getTime() : 0;
    return tb - ta;
  });
  if (miaOlympicSector(String(zoneCode || ""))) return sorted;
  return sorted.map(stripDeskPoints);
}

/** Spa, Lòng Nướng, Pickleball: không cộng / không hiện điểm. */
function stripDeskPoints(t: DeskTicket): DeskTicket {
  const promo = String(t.promoLabel || "")
    .replace(/Đổi\s+\d+\s+điểm/gi, "")
    .replace(/\s*·\s*·\s*/g, " · ")
    .replace(/^\s*·\s*|\s*·\s*$/g, "")
    .trim();
  return {
    ...t,
    pointsEarned: 0,
    hasPointsRedeem: false,
    promoLabel:
      promo && promo !== "—" ? promo : t.hasVoucher ? "Voucher" : "—",
    billItems: t.billItems.map((i) =>
      i.pointsLabel ? { ...i, pointsLabel: null } : i
    ),
  };
}

function lineKey(itemId: string, useAlt?: boolean) {
  return useAlt ? `${itemId}__alt` : itemId;
}

async function fileToBillPhoto(file: File): Promise<string> {
  const bmp = await createImageBitmap(file);
  const maxEdge = 1280;
  const scale = Math.min(1, maxEdge / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bmp.width * scale));
  canvas.height = Math.max(1, Math.round(bmp.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Không đọc được ảnh.");
  ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close();
  const url = canvas.toDataURL("image/jpeg", 0.72);
  if (url.length < 80 || url.length > 700_000) throw new Error("Ảnh bill quá lớn.");
  return url;
}

export default function DeskAdministrationPage() {
  const [step, setStep] = useState<Step>("pick");
  const [picked, setPicked] = useState<DeskZone | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  /** ADMINISTRATION global — được Đổi khu */
  const [isSystemAdminUser, setIsSystemAdminUser] = useState(false);
  const [arrivals, setArrivals] = useState<Arrival[]>([]);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<Arrival | null>(null);
  const [selectedTicketKey, setSelectedTicketKey] = useState<string | null>(
    null
  );
  const [category, setCategory] = useState(MIAOI_CATEGORIES[0]?.id || "mia");
  const [cart, setCart] = useState<Record<string, CartLine>>({});
  const [deskRedeemUnits, setDeskRedeemUnits] = useState(0);
  const [deskWallet, setDeskWallet] = useState<
    {
      offerId: string;
      title: string;
      subtitle: string;
      discountType: string;
      discountVnd?: number;
      discountPercent?: number;
      exhausted: boolean;
      canClaim: boolean;
    }[]
  >([]);
  const [deskVoucherOfferId, setDeskVoucherOfferId] = useState("");
  const [manualDiscountInput, setManualDiscountInput] = useState("");
  const [manualDiscountNote, setManualDiscountNote] = useState("");
  const [voucherPickerOpen, setVoucherPickerOpen] = useState(false);
  /** Hồ Olympic: giỏ vé theo từng lần quét */
  const [scanCarts, setScanCarts] = useState<
    Record<string, Record<string, number>>
  >({});
  const [orderMsg, setOrderMsg] = useState("");
  const [orderFilter, setOrderFilter] = useState<DeskZoneFilter>("all");
  const [packageFilter, setPackageFilter] = useState("");
  const [orderSorts, setOrderSorts] = useState<DeskOrderSort[]>(["time-desc"]);
  const [staffQuery, setStaffQuery] = useState("");
  const [nameQuery, setNameQuery] = useState("");
  const [listMenu, setListMenu] = useState<
    null | "zone" | "package" | "sort"
  >(null);
  const listMenuRef = useRef<HTMLDivElement>(null);
  /** Vé và gói tháng trên quầy hồ. Phụ kiện không đổi theo nút này. */
  const [poolService, setPoolService] = useState<"olympic" | "vip">("olympic");
  const [ordering, setOrdering] = useState(false);
  const [billViewer, setBillViewer] = useState<string | null>(null);
  const [billBusyToken, setBillBusyToken] = useState<string | null>(null);
  const [cancellingOrderId, setCancellingOrderId] = useState<string | null>(
    null
  );
  const [verifyingScanId, setVerifyingScanId] = useState<string | null>(null);
  const [scanOpen, setScanOpen] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  /** YYYY-MM-DD — lọc dashboard theo ngày lịch; null = realtime 12h */
  const [viewDate, setViewDate] = useState<string | null>(null);
  const loadSeq = useRef(0);
  const authFailStreak = useRef(0);
  const savingOrder = useRef(false);
  const [scanError, setScanError] = useState("");
  const [scanBusy, setScanBusy] = useState(false);
  const [scanSession, setScanSession] = useState(0);
  const [manualToken, setManualToken] = useState("");
  const [createGuestOpen, setCreateGuestOpen] = useState(false);
  const [guestName, setGuestName] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [guestSearch, setGuestSearch] = useState("");
  const [guestHits, setGuestHits] = useState<
    {
      id: string;
      customerCode: string;
      fullName: string;
      phone: string;
      shortId: string;
      segment: string;
      segmentLabel: string;
    }[]
  >([]);
  const [guestSearchBusy, setGuestSearchBusy] = useState(false);
  const [createGuestBusy, setCreateGuestBusy] = useState(false);
  const [createGuestError, setCreateGuestError] = useState("");
  const [guestCart, setGuestCart] = useState<GuestCartPreview | null>(null);
  const [approvingToken, setApprovingToken] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<{
    token: string;
    name: string;
  } | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectBusy, setRejectBusy] = useState(false);
  /** Sơ đồ bàn/giường — mở bằng nút, không chiếm UI chính */
  const [resourceMapOpen, setResourceMapOpen] = useState(false);
  /** Đổi điểm quầy */
  const [redeemOpen, setRedeemOpen] = useState(false);
  const [redeemTier, setRedeemTier] = useState<50 | 100>(50);
  const [redeemItems, setRedeemItems] = useState<
    { id: string; nameVi: string; priceVnd: number }[]
  >([]);
  const [redeemItemId, setRedeemItemId] = useState("");
  const [redeemBusy, setRedeemBusy] = useState(false);
  const [redeemMsg, setRedeemMsg] = useState("");
  const [claimLogs, setClaimLogs] = useState<
    {
      id: string;
      at: string;
      offerTitle: string | null;
      phone: string | null;
      customerName: string | null;
      claimedByName: string | null;
      zoneCode: string;
    }[]
  >([]);
  const [voucherMsg, setVoucherMsg] = useState("");
  const [redeemedOpen, setRedeemedOpen] = useState(false);

  const zone = picked?.code || null;
  const zoneRef = useRef(zone);
  zoneRef.current = zone;
  const zoneName = picked?.name || "";
  /** Quầy gộp Mía + Hồ — 1 dashboard, vé hồ và đồ uống trên cùng một đơn. */
  const isMiaOlympic = !!zone && miaOlympicSector(zone);
  const isMiaOi = zone === "MIA_OI" || isMiaOlympic;
  const isSpa = zone === "SAUNA";
  const isPool = zone === "OLYMPIC_POOL" || isMiaOlympic;
  const isLongNuong = zone === "LONG_NUONG";
  /** Menu phía trên — gộp Mía+Hồ hoặc Spa. Hồ riêng vẫn bán vé dưới từng lần quét. */
  const hasCatalog = isMiaOi || isSpa;
  const title = dashboardTitle(zoneName || "…");
  const catalogCategories = isSpa ? SPA_CATEGORIES : MIAOI_CATEGORIES;
  const catalogMenu = isSpa ? SPA_MENU : MIAOI_MENU;

  const pendingCount = useMemo(
    () => arrivals.filter((a) => a.pendingAdmin).length,
    [arrivals]
  );

  const deskTickets = useMemo(
    () => buildDeskTickets(arrivals, zone, hasCatalog),
    [arrivals, zone, hasCatalog]
  );

  const groupedTickets = useMemo(
    () => (isMiaOlympic ? groupMiaOlympicOrders(deskTickets) : deskTickets),
    [deskTickets, isMiaOlympic]
  );

  const visibleTickets = useMemo(() => {
    let rows = groupedTickets;
    if (isMiaOlympic && orderFilter !== "all") {
      rows =
        orderFilter === "both"
          ? rows.filter(
              (t) => t.orderKind === "both" || t.orderKind === "vip"
            )
          : rows.filter((t) => t.orderKind === orderFilter);
    }
    if (isMiaOlympic && packageFilter) {
      rows = rows.filter((t) => ticketHasPackage(t, packageFilter));
    }
    if (orderSorts.includes("staff") && staffQuery.trim()) {
      const q = foldVi(staffQuery.trim());
      rows = rows.filter((t) => foldVi(ticketStaffName(t)).includes(q));
    }
    if (orderSorts.includes("name") && nameQuery.trim()) {
      const q = foldVi(nameQuery.trim());
      rows = rows.filter((t) =>
        foldVi(t.arrival.fullName || "").includes(q)
      );
    }
    const sorts = orderSorts.length ? orderSorts : ["time-desc"];
    if (!isMiaOlympic || (sorts.length === 1 && sorts[0] === "time-desc")) {
      return rows;
    }
    return [...rows].sort((a, b) => compareDeskTickets(a, b, sorts));
  }, [
    groupedTickets,
    isMiaOlympic,
    orderFilter,
    packageFilter,
    orderSorts,
    staffQuery,
    nameQuery,
  ]);

  const guestTickets = useMemo(() => {
    if (!selected) return [];
    return groupedTickets.filter((t) => t.arrival.id === selected.id);
  }, [groupedTickets, selected]);

  const focusedTicket = useMemo(() => {
    if (!guestTickets.length) return null;
    if (selectedTicketKey) {
      const hit = guestTickets.find((t) => t.key === selectedTicketKey);
      if (hit) return hit;
      if (selectedTicketKey.startsWith("scan-")) {
        const sid = selectedTicketKey.slice("scan-".length);
        const byScan = guestTickets.find((t) => t.scan?.id === sid);
        if (byScan) return byScan;
      }
      const rest = selectedTicketKey.replace(
        /^(pool-bill-|bill-|order-|done-scan-)/,
        ""
      );
      const byOrder = guestTickets.find(
        (t) => t.orderId === rest || t.scan?.id === rest
      );
      if (byOrder) return byOrder;
    }
    return (
      guestTickets.find((t) => t.orderStatus === "pending") || guestTickets[0]
    );
  }, [guestTickets, selectedTicketKey]);

  /** Lần quét hồ còn mở — đơn gộp gắn vé vào lần mới nhất, kể cả khi dòng đang chọn là Mía. */
  const focusedPoolScanId = (() => {
    if (!isMiaOlympic) return null;
    const open = (scan: Scan | null | undefined) =>
      !!scan?.id &&
      !scan.ticketVerified &&
      !scan.orderId &&
      isOlympicPoolScanCode(scan.serviceCode);
    const pending: Scan[] = [];
    const push = (scan: Scan | null | undefined) => {
      if (!open(scan) || pending.some((row) => row.id === scan!.id)) return;
      pending.push(scan!);
    };
    push(focusedTicket?.scan);
    for (const ticket of guestTickets) push(ticket.scan);
    for (const scan of selected?.todayScans || []) push(scan);
    pending.sort(
      (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()
    );
    return pending[0]?.id || null;
  })();

  const guestCartLines = useMemo(
    () => approvedCartPoolLines(),
    [guestCart]
  );

  const guestConfirmedBill = useMemo(() => {
    if (!selected || !guestCart || guestCart.status === "PENDING_APPROVAL") {
      return null;
    }
    const used =
      (selected.carts || []).filter((c) => c.status === "USED").length ||
      (guestCart.status === "USED" ? 1 : 0);
    return confirmedBillForCart(selected.todayScans || [], guestCart, used);
  }, [selected, guestCart]);

  const categoryItems = useMemo(
    () => catalogMenu.filter((i) => i.category === category),
    [catalogMenu, category]
  );

  const cartLines = useMemo(
    () => Object.values(cart).filter((l) => l.qty > 0),
    [cart]
  );

  const cartTotal = useMemo(() => {
    let sum = 0;
    for (const line of cartLines) {
      const item = catalogMenu.find((i) => i.id === line.itemId);
      if (!item) continue;
      const unit =
        line.useAltPrice && item.priceAltVnd ? item.priceAltVnd : item.priceVnd;
      sum += unit * line.qty;
    }
    return sum;
  }, [cartLines, catalogMenu]);

  const load = useCallback(async () => {
    if (!zone) return;
    const seq = ++loadSeq.current;
    const requested = zone;
    try {
      const qs = new URLSearchParams({
        hours: "12",
        zone: requested,
      });
      if (viewDate) qs.set("date", viewDate);
      const res = await fetch(`/api/crm/desk?${qs.toString()}`, {
        cache: "no-store",
        credentials: "same-origin",
      });
      if (seq !== loadSeq.current) return;
      if (zoneRef.current !== requested) return;

      if (res.status === 401) {
        authFailStreak.current += 1;
        // Xác nhận session thật sự mất — tránh logout vì race / deploy
        if (authFailStreak.current < 2) return;
        const me = await fetch("/api/auth/me", {
          cache: "no-store",
          credentials: "same-origin",
        })
          .then((r) => r.json())
          .catch(() => null);
        if (seq !== loadSeq.current) return;
        if (zoneRef.current !== requested) return;
        if (me?.authenticated === true) {
          authFailStreak.current = 0;
          setError("Không tải được dữ liệu quầy. Thử Làm mới.");
          return;
        }
        setStep("login");
        setArrivals([]);
        return;
      }
      if (res.status === 403) {
        authFailStreak.current = 0;
        const data = await res.json().catch(() => ({}));
        setError(
          typeof data?.error === "string"
            ? data.error
            : "Không có quyền khu vực này."
        );
        return;
      }

      const data = await res.json();
      if (seq !== loadSeq.current) return;
      if (zoneRef.current !== requested) return;
      if (!res.ok) throw new Error(data.error || "Load failed");
      authFailStreak.current = 0;
      setIsAdmin(!!data.isAdmin);
      setIsSystemAdminUser(!!data.isSystemAdmin);
      setArrivals(data.arrivals || []);
      setError("");
      setSelected((prev) => {
        if (!prev) return null;
        return (data.arrivals || []).find((a: Arrival) => a.id === prev.id) || prev;
      });
    } catch (e) {
      if (seq !== loadSeq.current) return;
      if (zoneRef.current !== requested) return;
      setError(e instanceof Error ? e.message : "Load failed");
    }
  }, [zone, viewDate]);

  useEffect(() => {
    if (!listMenu) return;
    function onDown(e: MouseEvent) {
      if (!listMenuRef.current?.contains(e.target as Node)) setListMenu(null);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setListMenu(null);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [listMenu]);

  useEffect(() => {
    if (!isSpa) return;
    const cap =
      typeof selected?.swimBonusLeft === "number"
        ? Math.max(0, selected.swimBonusLeft)
        : 0;
    setCart((prev) => {
      const key = lineKey(SPA_GOI_BONUS_ID, false);
      const line = prev[key];
      if (!line || line.qty <= cap) return prev;
      if (cap <= 0) {
        const next = { ...prev };
        delete next[key];
        return next;
      }
      return { ...prev, [key]: { ...line, qty: cap } };
    });
  }, [isSpa, selected?.swimBonusLeft, cart]);

  useEffect(() => {
    const cap =
      typeof selected?.swimBonusLeft === "number"
        ? Math.max(0, selected.swimBonusLeft)
        : 0;
    setScanCarts((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const [scanId, row] of Object.entries(prev)) {
        const q = row[POOL_SWIM_BONUS_ID];
        if (!q || q <= cap) continue;
        changed = true;
        const copy = { ...row };
        if (cap <= 0) delete copy[POOL_SWIM_BONUS_ID];
        else copy[POOL_SWIM_BONUS_ID] = cap;
        if (Object.keys(copy).length === 0) delete next[scanId];
        else next[scanId] = copy;
      }
      return changed ? next : prev;
    });
  }, [selected?.swimBonusLeft]);

  useEffect(() => {
    if (!createGuestOpen || !zone) return;
    const q = guestSearch.trim();
    if (q.length < 2) {
      setGuestHits([]);
      setGuestSearchBusy(false);
      return;
    }
    setGuestSearchBusy(true);
    const handle = window.setTimeout(() => {
      void (async () => {
        try {
          const res = await fetch(
            `/api/crm/desk/search-customers?zone=${encodeURIComponent(zone)}&q=${encodeURIComponent(q)}`,
            { cache: "no-store" }
          );
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || "Không tìm được khách");
          setGuestHits(Array.isArray(data.customers) ? data.customers : []);
        } catch {
          setGuestHits([]);
        } finally {
          setGuestSearchBusy(false);
        }
      })();
    }, 250);
    return () => window.clearTimeout(handle);
  }, [createGuestOpen, guestSearch, zone]);

  // Resume session if already logged in for a zone (admin only can re-pick)
  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/auth/me", {
          cache: "no-store",
          credentials: "same-origin",
        });
        const data = await res.json();
        if (data?.authenticated !== true || !data.user) return;
        const u = data.user;
        if (u.systemRole === "SYSTEM_ADMIN") {
          setIsAdmin(true);
          setIsSystemAdminUser(true);
          return;
        }
        if (u.deskZone) {
          const z = getDeskZone(String(u.deskZone));
          if (z) {
            setPicked(z);
            setUsername(z.username);
            setStep("dashboard");
          }
        }
      } catch {
        /* stay on pick */
      }
    })();
  }, []);

  const pendingApprovalCount = useMemo(
    () =>
      arrivals.reduce(
        (n, a) =>
          n +
          (a.carts || []).filter((c) => c.status === "PENDING_APPROVAL")
            .length,
        0
      ),
    [arrivals]
  );

  useEffect(() => {
    if (step !== "dashboard" || !zone || zone === "ADMIN") return;
    // Đang mở lịch → tạm dừng poll để UI không giật
    if (calendarOpen) return;
    void load();
    // Lịch sử: không cần poll nhanh. Realtime: chậm hơn trước (tránh lag + logout giả)
    const ms = viewDate
      ? 60_000
      : pendingApprovalCount > 0
        ? 4_000
        : 10_000;
    const t = setInterval(() => void load(), ms);
    return () => clearInterval(t);
  }, [step, zone, load, pendingApprovalCount, calendarOpen, viewDate]);

  async function approveCart(
    token: string,
    e?: React.MouseEvent,
    action: "approve" | "reject" | "finalize" = "approve",
    reason?: string
  ) {
    e?.stopPropagation();
    if (!zone || !token || approvingToken) return;
    setApprovingToken(token);
    setError("");
    try {
      const res = await fetch("/api/crm/desk/approve-cart", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          zone,
          token,
          action,
          reason: reason || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Không xử lý được");
      setRejectTarget(null);
      setRejectReason("");
      if (action === "finalize") {
        setOrderMsg("Đã chốt đơn.");
        setGuestCart((prev) =>
          prev && prev.token === token ? { ...prev, status: "USED" } : prev
        );
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Thao tác thất bại");
    } finally {
      setApprovingToken(null);
    }
  }

  function longNuongVisitDone(note?: string | null) {
    return (note || "").trim() === "Đã dùng";
  }

  async function finishLongNuong(token: string, e?: React.MouseEvent) {
    e?.stopPropagation();
    if (!zone || !token || approvingToken) return;
    setApprovingToken(token);
    setError("");
    try {
      const res = await fetch("/api/crm/desk/finish-visit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ zone, token }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Không kết thúc được");
      setOrderMsg("Đã dùng — kết thúc lượt.");
      setGuestCart((prev) =>
        prev && prev.token === token ? { ...prev, adminNote: "Đã dùng" } : prev
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không kết thúc được");
    } finally {
      setApprovingToken(null);
    }
  }

  async function saveBillPhoto(token: string, file: File) {
    if (!zone || !token) return;
    setBillBusyToken(token);
    setError("");
    try {
      const billPhoto = await fileToBillPhoto(file);
      const res = await fetch("/api/crm/desk/bill-photo", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ zone, token, billPhoto }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Không lưu được ảnh bill");
      setGuestCart((prev) =>
        prev && prev.token === token ? { ...prev, hasBillPhoto: true } : prev
      );
      setOrderMsg("Đã bổ sung chứng từ.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không lưu được ảnh bill");
    } finally {
      setBillBusyToken(null);
    }
  }

  async function openBillPhoto(token: string) {
    if (!zone || !token) return;
    setBillBusyToken(token);
    setError("");
    try {
      const res = await fetch(
        `/api/crm/desk/bill-photo?zone=${encodeURIComponent(zone)}&token=${encodeURIComponent(token)}`
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Không mở được ảnh bill");
      setBillViewer(String(data.billPhoto || ""));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không mở được ảnh bill");
    } finally {
      setBillBusyToken(null);
    }
  }

  function renderBillCapture(
    token: string | undefined,
    has: boolean,
    partial = false,
    frozen = false,
    status?: string | null
  ) {
    if (!token) return null;
    if (frozen && !has) return null;
    const canFinalize = isMiaOi && has && status === "OPEN";
    return (
      <div style={styles.billRow} onClick={(e) => e.stopPropagation()}>
        {frozen ? null : (
          <label
            title="CK: chụp màn hình chuyển khoản. Tiền mặt: ảnh bill in từ Fabi. Làm trong ca."
            style={styles.billBtn}
          >
            {billBusyToken === token
              ? "Đang lưu…"
              : has
                ? "Đổi chứng từ"
                : "Bổ sung chứng từ"}
            <input
              type="file"
              accept="image/*"
              capture="environment"
              style={{ display: "none" }}
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) void saveBillPhoto(token, file);
              }}
            />
          </label>
        )}
        {has ? (
          <button
            type="button"
            style={styles.billBtn}
            onClick={() => void openBillPhoto(token)}
          >
            Xem chứng từ
          </button>
        ) : partial ? (
          <span style={{ fontSize: 12, fontWeight: 700, color: "#b45309", whiteSpace: "nowrap" }}>
            Hoàn thành 1 phần
          </span>
        ) : null}
        {canFinalize ? (
          <button
            type="button"
            title="Kế toán đã kiểm chứng từ"
            style={{
              ...styles.billBtn,
              ...styles.billBtnSolid,
              opacity: approvingToken === token ? 0.45 : 1,
            }}
            disabled={approvingToken === token}
            onClick={(e) => void approveCart(token, e, "finalize")}
          >
            {approvingToken === token ? "…" : "Chốt đơn"}
          </button>
        ) : null}
      </div>
    );
  }

  async function submitReject() {
    if (!rejectTarget) return;
    if (rejectReason.trim().length < 2) {
      setError("Nhập lý do từ chối (ít nhất 2 ký tự).");
      return;
    }
    setRejectBusy(true);
    try {
      await approveCart(
        rejectTarget.token,
        undefined,
        "reject",
        rejectReason.trim()
      );
    } finally {
      setRejectBusy(false);
    }
  }

  function chooseAdmin() {
    setPicked({ code: "ADMIN", name: "Admin", username: ADMIN_PANEL_USERNAME });
    setUsername(ADMIN_PANEL_USERNAME);
    setPassword("");
    setLoginError("");
    setError("");
    setArrivals([]);
    setSelected(null);
    setSelectedTicketKey(null);
    setCart({});
    setScanCarts({});
    setOrderMsg("");
    setStep("login");
  }

  function chooseZone(z: DeskZone) {
    setPicked(z);
    setUsername(z.username);
    setPassword("");
    setLoginError("");
    setError("");
    setArrivals([]);
    setSelected(null);
    setSelectedTicketKey(null);
    setCart({});
    setScanCarts({});
    setOrderMsg("");
    setStep("login");
  }

  function backToPick() {
    setStep("pick");
    setPicked(null);
    setPassword("");
    setLoginError("");
    setArrivals([]);
    setSelected(null);
    setSelectedTicketKey(null);
  }

  async function login(e: React.FormEvent) {
    e.preventDefault();
    if (!picked) return;
    setLoginError("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Login failed");

      const user = data.user;
      const admin = user?.systemRole === "SYSTEM_ADMIN";
      if (picked.code === "ADMIN") {
        if (!admin) {
          await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
          throw new Error(
            `Tài khoản này không phải Admin. Dùng ${ADMIN_PANEL_USERNAME}.`
          );
        }
        setIsAdmin(true);
        setIsSystemAdminUser(true);
        setPassword("");
        setStep("dashboard");
        return;
      }
      const deskZone = String(user?.deskZone || "").toUpperCase();
      const sectorLogin = miaOlympicSector(picked.code);
      if (!admin && !sameDeskSector(deskZone, picked.code)) {
        await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
        throw new Error(
          sectorLogin
            ? `Tài khoản này không phải quầy ${MIA_OLYMPIC_LABEL}. Dùng MIAOI, GYM, VIP, ADMINISTRATIONMIAOI, ADMINISTRATIONGYM, ADMINISTRATIONVIP hoặc ${ADMIN_PANEL_USERNAME}.`
            : `Tài khoản này không phải khu ${picked.name}. Dùng ${picked.username}, ${zoneAdminUsername(picked.username)} hoặc ${ADMIN_PANEL_USERNAME}.`
        );
      }
      const home =
        !admin && deskZone && sameDeskSector(deskZone, picked.code)
          ? getDeskZone(deskZone) || picked
          : picked;
      const zoneAdmin = isZoneDeskAdmin(user, home.code);
      setIsAdmin(!!admin || zoneAdmin);
      setIsSystemAdminUser(!!admin);
      setPassword("");
      if (home.code !== picked.code) setPicked(home);
      setStep("dashboard");
      if (home.code === picked.code) await load();
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : "Login failed");
    }
  }

  async function logout() {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      /* ignore */
    }
    setIsAdmin(false);
    setIsSystemAdminUser(false);
    backToPick();
  }

  function openCustomer(
    a: Arrival,
    cart?: GuestCartPreview | null,
    ticketKey?: string | null
  ) {
    setSelected(a);
    setSelectedTicketKey(ticketKey ?? null);
    setCart({});
    setDeskRedeemUnits(0);
    setDeskVoucherOfferId("");
    setManualDiscountInput("");
    setManualDiscountNote("");
    setVoucherPickerOpen(false);
    void loadDeskWallet(a.id);
    setScanCarts({});
    setOrderMsg("");
    setGuestCart(null);
    setVerifyingScanId(null);
    setCategory(
      isSpa
        ? SPA_CATEGORIES.find((c) => c.id === "gio-vang")?.id ||
          SPA_CATEGORIES[0]?.id ||
          "goi-duong"
        : MIAOI_CATEGORIES[0]?.id || "mia"
    );
    let pick: GuestCartPreview | null = cart || null;
    if (!pick && ticketKey?.startsWith("cart-")) {
      const token = ticketKey.slice("cart-".length);
      pick = a.carts?.find((c) => c.token === token) || null;
    }
    if (!pick && !ticketKey) {
      pick =
        a.carts?.find((c) => c.status === "PENDING_APPROVAL") ||
        a.openCart ||
        a.carts?.[0] ||
        null;
    }
    if (pick) applyGuestCart(pick);
  }

  async function submitCreateGuest(anonymous = false) {
    if (!zone || createGuestBusy) return;
    const fullName = guestName.trim();
    const phone = guestPhone.trim();
    if (!anonymous && (!fullName || !phone)) {
      setCreateGuestError("Nhập đủ tên và số điện thoại.");
      return;
    }
    setCreateGuestBusy(true);
    setCreateGuestError("");
    try {
      const res = await fetch("/api/crm/desk/create-guest", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          anonymous
            ? { zone, anonymous: true, fullName }
            : { zone, fullName, phone }
        ),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Không tạo được khách");
      await load();
      const refreshed = await fetch(
        `/api/crm/desk?hours=12&zone=${encodeURIComponent(zone)}`,
        { cache: "no-store" }
      );
      const listData = await refreshed.json();
      const list: Arrival[] = listData.arrivals || [];
      const cust = data.customer as {
        id: string;
        customerCode: string;
        fullName: string | null;
        phone: string | null;
        shortId: string | null;
        segment?: string;
        segmentLabel?: string;
      };
      const fromList = list.find((a) => a.id === cust.id);
      const segment = String(
        cust.segment || fromList?.segment || (anonymous ? "WALK_IN" : "ACCOUNT")
      );
      const segmentLabel = cust.segmentLabel || deskSegmentLabel(segment);
      const scanEventId = String(data.scanEventId || "");
      const fallbackScan: Scan | null = scanEventId
        ? {
            id: scanEventId,
            at: new Date().toISOString(),
            eventType: "SERVICE_USE",
            operationalStatus: "NEW",
            serviceCode: isMiaOlympic ? "OLYMPIC_POOL" : zone,
            serviceName: isMiaOlympic ? "Hồ Olympic" : zoneName || zone,
            orderSummary: null,
            ticketVerified: false,
            source: "desk_walkin_order",
          }
        : null;
      const arrival: Arrival = fromList
        ? {
            ...fromList,
            segment,
            segmentLabel,
            fullName: cust.fullName || fromList.fullName,
            phone: cust.phone ?? fromList.phone,
            todayScans:
              fallbackScan &&
              !fromList.todayScans.some((s) => s.id === fallbackScan.id)
                ? [fallbackScan, ...fromList.todayScans]
                : fromList.todayScans,
          }
        : {
            id: cust.id,
            customerCode: cust.customerCode,
            fullName: cust.fullName,
            phone: cust.phone,
            shortId: cust.shortId,
            segment,
            segmentLabel,
            updatedAt: new Date().toISOString(),
            lastVisitAt: new Date().toISOString(),
            pendingAdmin: true,
            checkedIn: false,
            todayScans: fallbackScan ? [fallbackScan] : [],
            todayOrders: [],
            todayPackageVnd: 0,
            todayScanCount: fallbackScan ? 1 : 0,
            todayOrderCount: 0,
          };
      openCustomer(
        arrival,
        null,
        scanEventId ? `scan-${scanEventId}` : null
      );
      setGuestName("");
      setGuestPhone("");
      setGuestSearch("");
      setGuestHits([]);
      setCreateGuestOpen(false);
      setOrderMsg(data.message || "Đã mở đơn. Chọn món / vé rồi xác thực.");
    } catch (e) {
      setCreateGuestError(
        e instanceof Error ? e.message : "Không tạo được khách"
      );
    } finally {
      setCreateGuestBusy(false);
    }
  }

  function applyGuestCart(
    cartPayload: {
      token?: string;
      zoneCode?: string;
      zoneName?: string | null;
      items?: unknown;
      totalVnd?: number;
      status?: string;
      createdAt?: string;
      adminNote?: string | null;
      hasBillPhoto?: boolean;
    } | null
  ) {
    if (!cartPayload) {
      setGuestCart(null);
      return;
    }
    const rawItems = Array.isArray(cartPayload.items)
      ? (cartPayload.items as {
          id?: string;
          nameVi?: string;
          qty?: number;
          priceVnd?: number;
          pointsRedeemQty?: number;
        }[])
      : [];
    const items = rawItems
      .map((i) => {
        const qty = Math.max(1, Number(i.qty) || 1);
        const pointsRedeemQty = Math.min(
          qty,
          Math.max(0, Math.round(Number(i.pointsRedeemQty) || 0))
        );
        return {
          id: String(i.id || "").trim(),
          nameVi: String(i.nameVi || "").trim(),
          qty,
          priceVnd: Math.max(0, Number(i.priceVnd) || 0),
          ...(pointsRedeemQty > 0 ? { pointsRedeemQty } : {}),
        };
      })
      .filter((i) => i.id && i.nameVi);
    if (!items.length) {
      setGuestCart(null);
      return;
    }
    setGuestCart({
      token: String(cartPayload.token || ""),
      zoneCode: String(cartPayload.zoneCode || ""),
      zoneName: cartPayload.zoneName ?? null,
      items,
      totalVnd: Number(cartPayload.totalVnd) || 0,
      status: cartPayload.status,
      createdAt: cartPayload.createdAt,
      adminNote: cartPayload.adminNote ?? null,
      hasBillPhoto: Boolean(cartPayload.hasBillPhoto),
    });
    if (hasCatalog && zone !== "MIA_OI") {
      const next: Record<string, CartLine> = {};
      for (const it of items) {
        const menuItem =
          catalogMenu.find((m) => m.id === it.id) ||
          catalogMenu.find((m) => m.nameVi === it.nameVi);
        if (!menuItem) continue;
        const useAlt = !!(
          menuItem.priceAltVnd && it.priceVnd === menuItem.priceAltVnd
        );
        next[lineKey(menuItem.id, useAlt)] = {
          itemId: menuItem.id,
          qty: it.qty,
          ...(useAlt ? { useAltPrice: true } : {}),
        };
      }
      if (Object.keys(next).length) setCart(next);
    }
  }

  const resolveGuestQr = useCallback(
    async (raw: string) => {
      if (!zone || scanBusy) return;
      const token = String(raw || "").trim();
      if (!token) return;
      setScanBusy(true);
      setScanError("");
      try {
        const res = await fetch("/api/crm/desk/resolve-qr", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ zone, token }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Không đọc được QR");

        if (data.mode === "VOUCHER") {
          setScanOpen(false);
          setManualToken("");
          const title = String(data.voucher?.offerTitle || "Voucher");
          const when = data.log?.at
            ? new Date(data.log.at).toLocaleString("vi-VN")
            : "";
          setVoucherMsg(
            data.already
              ? `Already scanned · ${title}${when ? ` · ${when}` : ""}`
              : `Redeemed · ${title}`
          );
          setRedeemedOpen(true);
          void loadClaimHistory();
          return;
        }

        const cust = data.customer as {
          id: string;
          customerCode: string;
          fullName: string | null;
          phone: string | null;
          shortId: string | null;
          segment?: string;
        };
        if (!cust?.id) throw new Error("QR không có thông tin khách.");

        setScanOpen(false);
        setManualToken("");

        // Refresh list (SERVICE_USE vừa tạo + cart) rồi mở khách
        await load();
        const refreshed = await fetch(
          `/api/crm/desk?hours=12&zone=${encodeURIComponent(zone)}`,
          { cache: "no-store" }
        );
        const listData = await refreshed.json();
        const list: Arrival[] = listData.arrivals || [];
        const fromList = list.find((a) => a.id === cust.id);
        const membership = data.membership as {
          planLabel?: string;
          expiresAt?: string;
        } | null;
        const fromPlan = membership?.planLabel
          ? badgeForPlanLabel(membership.planLabel)
          : null;
        const segment =
          fromPlan?.segment ||
          fromList?.segment ||
          (cust.segment === "VIP" || cust.segment === "MEMBER"
            ? cust.segment
            : cust.segment === "WALK_IN"
              ? "WALK_IN"
              : "ACCOUNT");
        const segmentLabel =
          fromPlan?.segmentLabel ||
          deskSegmentLabel(segment, fromList?.segmentLabel || "Khách");
        const arrival: Arrival = fromList
          ? {
              ...fromList,
              segment,
              segmentLabel,
              ...(membership?.planLabel
                ? {
                    packageLabel: membership.planLabel,
                    packageExpiresAt:
                      membership.expiresAt || fromList.packageExpiresAt,
                  }
                : {}),
            }
          : {
              id: cust.id,
              customerCode: cust.customerCode,
              fullName: cust.fullName,
              phone: cust.phone,
              shortId: cust.shortId,
              segment,
              segmentLabel,
              packageLabel: membership?.planLabel || null,
              packageExpiresAt: membership?.expiresAt || null,
              updatedAt: new Date().toISOString(),
              lastVisitAt: null,
              pendingAdmin: true,
              checkedIn: false,
              todayScans: [],
              todayOrders: [],
              todayPackageVnd: 0,
              todayScanCount: 0,
              todayOrderCount: 0,
            };

        openCustomer(arrival);
        applyGuestCart(data.cart || arrival.openCart || null);

        if (data.payment?.paid) {
          setOrderMsg(
            data.payment.already
              ? `Đã xác nhận thanh toán trước${
                  data.cart?.totalVnd
                    ? ` · ${formatVnd(Number(data.cart.totalVnd))}`
                    : ""
                }`
              : `Đã xác nhận thanh toán${
                  data.cart?.totalVnd
                    ? ` · ${formatVnd(Number(data.cart.totalVnd))}`
                    : ""
                }`
          );
        } else if (data.spa?.activated) {
          setOrderMsg("Đang dùng — bấm Đã dùng khi khách xong.");
        } else if (data.table?.activated) {
          setOrderMsg(
            data.table.resource
              ? data.table.already
                ? `${data.table.resource.name} đang hoạt động`
                : `Đã kích hoạt ${data.table.resource.name} — bàn chuyển đỏ (đang dùng)`
              : "Đã nhận khách — yêu cầu bàn hoàn tất"
          );
        } else if (data.court?.activated && data.court?.resource) {
          setOrderMsg(
            data.court.already
              ? `${data.court.resource.name} đang chơi`
              : `Đã mở ${data.court.resource.name} — sân đang dùng`
          );
        }

        // Gói tháng vừa gắn bằng QR thì không đưa lại lên bảng (lưu lại sẽ bị từ chối).
        // Vé lẻ / phụ kiện trong cùng giỏ vẫn vào đơn gộp.
        if (
          miaOlympicSector(zone) &&
          membership?.planLabel &&
          String(data.cart?.status || "").toUpperCase() === "USED" &&
          Array.isArray(data.cart?.items)
        ) {
          const next: Record<string, number> = {};
          for (const it of data.cart.items as { id?: string; qty?: number }[]) {
            const id = String(it.id || "").trim();
            const item = getPoolItemById(id);
            if (!item || item.category === "goi-thang") continue;
            next[id] = Math.min(99, Math.max(1, Number(it.qty) || 1));
          }
          if (Object.keys(next).length) {
            setScanCarts((prev) => ({ ...prev, [BOARD_POOL_KEY]: next }));
          }
        }
        if (membership?.planLabel) {
          const until = membership.expiresAt
            ? new Date(membership.expiresAt).toLocaleDateString("vi-VN")
            : "";
          setOrderMsg(
            `Đã gắn ${membership.planLabel}${until ? ` đến ${until}` : ""}`
          );
        }
      } catch (e) {
        setScanError(e instanceof Error ? e.message : "Lỗi quét QR");
        setScanSession((n) => n + 1);
      } finally {
        setScanBusy(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [zone, scanBusy, load]
  );

  const onDeskScanCode = useCallback(
    (raw: string) => {
      void resolveGuestQr(raw);
    },
    [resolveGuestQr]
  );

  function scanQty(scanId: string, itemId: string) {
    return scanCarts[scanId]?.[itemId] || 0;
  }

  function swimBonusCap() {
    return typeof selected?.swimBonusLeft === "number"
      ? Math.max(0, selected.swimBonusLeft)
      : 0;
  }

  function swimBonusHint(cap: number) {
    return cap > 0
      ? `Còn ${cap} lượt từ gói bơi.`
      : "Khách không có lượt tự chọn từ gói bơi.";
  }

  /** App package still on the account (Gói Olympic or Gói VIP). Desk badge is Member/VIP, not the stored flag. */
  function activeAppPackageLabel() {
    if (!selected?.packageLabel || !selected.packageExpiresAt) return null;
    const label = selected.packageLabel;
    if (!/olympic/i.test(label) && !isVipSubscriptionLabel(label)) return null;
    const exp = new Date(selected.packageExpiresAt).getTime();
    if (Number.isNaN(exp) || exp <= Date.now()) return null;
    return label.replace(/^\s*gói\s+/i, "");
  }

  /** Server rejects another Olympic package while any app package is still active. Tickets and gói VIP stay open. */
  function olympicPackageBlocked(itemId: string) {
    return isOlympicPackageId(itemId) && !!activeAppPackageLabel();
  }

  function setScanQty(scanId: string, itemId: string, qty: number) {
    if (qty > 0 && olympicPackageBlocked(itemId)) return;
    const cap = itemId === POOL_SWIM_BONUS_ID ? swimBonusCap() : 99;
    const nextQty = Math.min(qty, cap);
    setScanCarts((prev) => {
      const row = { ...(prev[scanId] || {}) };
      if (nextQty <= 0) delete row[itemId];
      else row[itemId] = nextQty;
      const next = { ...prev };
      if (Object.keys(row).length === 0) delete next[scanId];
      else next[scanId] = row;
      return next;
    });
  }

  function guestHasSameDayOlympicOrder() {
    return (selected?.todayOrders || []).some((o) => {
      const st = String(o.status || "").toUpperCase();
      return st !== "CANCELLED" && st !== "PENDING" && st !== "SUBMITTED";
    });
  }

  function poolSameDay(lines: { itemId: string }[]) {
    return (
      guestHasSameDayOlympicOrder() ||
      lines.some((line) => isPoolDayTicket(line.itemId))
    );
  }

  function scanCartTotal(scanId: string) {
    const row = scanCarts[scanId] || {};
    const lines = Object.entries(row)
      .filter(([, q]) => q > 0)
      .map(([itemId, qty]) => ({ itemId, qty }));
    const priced = computePoolPricing(lines, {
      sameDayMembership: poolSameDay(lines),
    });
    const qty = priced.lines.reduce((s, l) => s + l.qty, 0);
    return {
      sum: priced.totalVnd,
      qty,
      subtotal: priced.subtotalVnd,
      accessoryDiscount: priced.accessoryDiscountVnd,
      membershipDiscount: priced.membershipDiscountVnd,
    };
  }

  function getPoolItemById(id: string) {
    return getPoolItem(id);
  }

  function scanCartLines(scanId: string) {
    return Object.entries(scanCarts[scanId] || {})
      .filter(([, qty]) => qty > 0)
      .map(([itemId, qty]) => ({ itemId, qty }));
  }

  function poolMenuPriceLine(
    item: PoolMenuItem,
    scanId: string,
    membershipHeld: boolean,
    showNote: boolean
  ) {
    const price =
      item.category === "goi-thang" &&
      poolService === "olympic" &&
      poolSameDay(scanCartLines(scanId)) &&
      !membershipHeld
        ? `${Math.round((item.priceVnd * 0.9) / 1000)}K (−10%)`
        : item.id.startsWith("vip-")
          ? formatVnd(item.priceVnd)
          : formatPoolPrice(item);
    const duration = item.durationMin ? ` · ${item.durationMin}'` : "";
    const note =
      item.note && (showNote || item.id.startsWith("vip-")) ? ` · ${item.note}` : "";
    return `${price}${duration}${note}`;
  }

  function poolServiceButtons(margin = "0") {
    return (
      <div style={{ display: "flex", gap: 6, flexShrink: 0, margin }}>
        {(
          [
            ["olympic", "Olympic"],
            ["vip", "VIP"],
          ] as const
        ).map(([id, label]) => {
          const on = poolService === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => selectPoolService(id)}
              style={{
                border: on ? "1px solid #0c4a6e" : "1px solid #bae6fd",
                background: on ? "#0c4a6e" : "#fff",
                color: on ? "#fff" : "#0c4a6e",
                borderRadius: 999,
                height: 28,
                padding: "0 12px",
                fontWeight: 800,
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              {label}
            </button>
          );
        })}
      </div>
    );
  }

  function accessoryDiscountNote() {
    const gear = boardPoolTotals();
    if (gear.accessoryDiscount > 0) {
      return (
        <p
          style={{
            margin: "0 0 8px",
            fontSize: 12,
            fontWeight: 800,
            color: "#047857",
          }}
        >
          ✓ Đang giảm −10% phần phụ kiện (−{formatVnd(gear.accessoryDiscount)})
        </p>
      );
    }
    if (gear.accessoryQty === 1) {
      return (
        <p
          style={{
            margin: "0 0 8px",
            fontSize: 12,
            fontWeight: 700,
            color: "#9a3412",
          }}
        >
          Thêm 1 món nữa để −10% phần phụ kiện.
        </p>
      );
    }
    return null;
  }

  function selectPoolService(next: "olympic" | "vip") {
    setPoolService(next);
  }

  /** Lines already on an approved Olympic cart — not a second purchase. */
  function approvedCartPoolLines(): { itemId: string; qty: number }[] {
    if (!guestCart) return [];
    const status = String(guestCart.status || "");
    if (
      status === "PENDING_APPROVAL" ||
      status === "USED" ||
      status === "REJECTED" ||
      status === "CANCELLED" ||
      status === "NO_SHOW"
    ) {
      return [];
    }
    const lines: { itemId: string; qty: number }[] = [];
    for (const it of guestCart.items) {
      if (!getPoolItemById(it.id) || it.qty < 1) continue;
      lines.push({ itemId: it.id, qty: it.qty });
    }
    return lines;
  }

  function mergePoolLines(
    base: { itemId: string; qty: number }[],
    extra: { itemId: string; qty: number }[]
  ) {
    const qty = new Map<string, number>();
    for (const line of [...base, ...extra]) {
      qty.set(line.itemId, (qty.get(line.itemId) || 0) + line.qty);
    }
    return [...qty.entries()].map(([itemId, q]) => ({ itemId, qty: q }));
  }

  function patchSelectedScan(scanId: string, patch: Partial<Scan>) {
    setSelected((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        todayScans: prev.todayScans.map((s) =>
          s.id === scanId ? { ...s, ...patch } : s
        ),
      };
    });
    setArrivals((prev) =>
      prev.map((a) => {
        if (!selected || a.id !== selected.id) return a;
        return {
          ...a,
          todayScans: a.todayScans.map((s) =>
            s.id === scanId ? { ...s, ...patch } : s
          ),
        };
      })
    );
  }

  async function verifyPoolScan(scan: Scan, mode: "cart" | "added" = "added") {
    if (!selected || !isPool) return;
    if (scan.ticketVerified || scan.orderId) {
      setError("Đơn này đã xác thực. Bấm Tạo đơn để thêm đơn mới.");
      return;
    }
    const row = scanCarts[scan.id] || {};
    const added = Object.entries(row)
      .filter(([, q]) => q > 0)
      .map(([itemId, qty]) => ({ itemId, qty }));
    const fromCart = approvedCartPoolLines();
    const items =
      mode === "cart" ? fromCart : mergePoolLines(fromCart, added);
    if (items.some((i) => olympicPackageBlocked(i.itemId))) {
      const until = selected?.packageExpiresAt
        ? new Date(selected.packageExpiresAt).toLocaleDateString("vi-VN")
        : "";
      setError(
        `Khách đang dùng gói ${activeAppPackageLabel() || "hội viên"}${
          until ? ` đến ${until}` : ""
        }. Hết hạn mới chọn gói Olympic mới.`
      );
      return;
    }
    if (!items.length) {
      setError(
        fromCart.length
          ? "Giỏ đã duyệt không có vé hợp lệ."
          : "Chọn ít nhất 1 vé trước khi xác thực."
      );
      return;
    }
    setVerifyingScanId(scan.id);
    setError("");
    setOrderMsg("");
    try {
      const res = await fetch("/api/crm/pool/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          customerId: selected.id,
          scanEventId: scan.id,
          items,
          pointsRedeemUnits: deskRedeemUnits,
          voucherOfferId: deskVoucherOfferId || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Không xác thực được");
      setDeskRedeemUnits(0);
      setDeskVoucherOfferId("");
      setVoucherPickerOpen(false);
      void loadDeskWallet(selected.id);
      const ticketItems: ScanTicketItem[] = (data.order?.items || []).map(
        (i: {
          nameVi: string;
          qty: number;
          unitPriceVnd: number;
        }) => ({
          nameVi: i.nameVi,
          qty: i.qty,
          unitPriceVnd: i.unitPriceVnd,
        })
      );
      const closedIds: string[] = Array.isArray(data.closedScanIds)
        ? data.closedScanIds.map((id: unknown) => String(id))
        : [scan.id];
      setScanCarts((prev) => {
        const next = { ...prev };
        for (const id of closedIds) delete next[id];
        return next;
      });
      const scanPatch: Partial<Scan> = {
        ticketVerified: true,
        orderSummary: data.orderSummary || null,
        totalVnd: data.order?.totalVnd ?? null,
        orderId: data.order?.id ?? null,
        ticketItems,
      };
      const closed = new Set(closedIds);
      setSelected((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          pointsBalance:
            typeof data.pointsBalance === "number"
              ? data.pointsBalance
              : prev.pointsBalance,
          todayScans: prev.todayScans.map((s) =>
            closed.has(s.id) ? { ...s, ...scanPatch } : s
          ),
        };
      });
      setArrivals((prev) =>
        prev.map((a) => {
          if (a.id !== selected.id) return a;
          return {
            ...a,
            todayScans: a.todayScans.map((s) =>
              closed.has(s.id) ? { ...s, ...scanPatch } : s
            ),
          };
        })
      );
      const memUntil = data.membership?.expiresAt
        ? new Date(data.membership.expiresAt).toLocaleDateString("vi-VN")
        : "";
      const memNote = data.membership?.planLabel
        ? ` · gói ${data.membership.planLabel.replace(/^\s*gói\s+/i, "")}${memUntil ? ` đến ${memUntil}` : ""}`
        : "";
      if (data.membership?.planLabel) {
        const badge = badgeForPlanLabel(data.membership.planLabel);
        setSelected((prev) =>
          prev
            ? {
                ...prev,
                segment: badge.segment,
                segmentLabel: badge.segmentLabel,
                packageLabel: data.membership.planLabel,
                packageExpiresAt: data.membership.expiresAt || prev.packageExpiresAt,
              }
            : prev
        );
      }
      setOrderMsg(
        `Đã xác thực · vào lúc ${formatTime(scan.at)} · ${formatVnd(data.order?.totalVnd || 0)}${memNote}`
      );
      if (data.order?.id) {
        setSelectedTicketKey(`bill-${data.order.id}`);
      }
      void load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không xác thực được");
    } finally {
      setVerifyingScanId(null);
    }
  }

  async function openRedeem(preferredTier?: 50 | 100) {
    const tier =
      preferredTier ||
      (isPool ? 100 : isMiaOi ? 50 : 50);
    setRedeemTier(tier);
    setRedeemItemId("");
    setRedeemMsg("");
    setRedeemOpen(true);
    try {
      const res = await fetch(`/api/crm/desk/redeem-points?tier=${tier}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Không tải được món đổi");
      setRedeemItems(Array.isArray(data.items) ? data.items : []);
    } catch (e) {
      setRedeemMsg(e instanceof Error ? e.message : "Lỗi tải món");
      setRedeemItems([]);
    }
  }

  async function switchRedeemTier(tier: 50 | 100) {
    setRedeemTier(tier);
    setRedeemItemId("");
    setRedeemMsg("");
    try {
      const res = await fetch(`/api/crm/desk/redeem-points?tier=${tier}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Không tải được món đổi");
      setRedeemItems(Array.isArray(data.items) ? data.items : []);
    } catch (e) {
      setRedeemMsg(e instanceof Error ? e.message : "Lỗi tải món");
      setRedeemItems([]);
    }
  }

  async function submitRedeem() {
    if (!selected || !redeemItemId) {
      setRedeemMsg("Chọn món để đổi.");
      return;
    }
    setRedeemBusy(true);
    setRedeemMsg("");
    try {
      const res = await fetch("/api/crm/desk/redeem-points", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          customerId: selected.id,
          tier: redeemTier,
          itemId: redeemItemId,
          zone: zone || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Đổi điểm thất bại");
      setRedeemMsg(
        `Đã đổi ${data.pointsBurned} điểm → ${data.itemName} (bill 0đ). Còn ${data.pointsBalance} điểm.`
      );
      setSelected({
        ...selected,
        pointsBalance: data.pointsBalance,
      });
      void load();
    } catch (e) {
      setRedeemMsg(e instanceof Error ? e.message : "Đổi điểm thất bại");
    } finally {
      setRedeemBusy(false);
    }
  }

  async function loadClaimHistory() {
    if (!zone) return;
    try {
      const res = await fetch(
        `/api/crm/desk/offers?history=1&zone=${encodeURIComponent(zone)}`
      );
      const data = await res.json();
      if (!res.ok) return;
      setClaimLogs(Array.isArray(data.logs) ? data.logs : []);
    } catch {
      /* ignore */
    }
  }

  async function loadDeskWallet(customerId: string) {
    if (!zone || !customerId) {
      setDeskWallet([]);
      return;
    }
    try {
      const res = await fetch(
        `/api/crm/desk/offers?customerId=${encodeURIComponent(customerId)}&zone=${encodeURIComponent(zone)}`
      );
      const data = await res.json();
      if (!res.ok) {
        setDeskWallet([]);
        return;
      }
      const rows = Array.isArray(data.wallet) ? data.wallet : [];
      setDeskWallet(
        rows.filter(
          (w: {
            exhausted?: boolean;
            canClaim?: boolean;
            discountType?: string;
          }) =>
            !w.exhausted &&
            w.canClaim !== false &&
            (w.discountType === "percent" || w.discountType === "amount")
        )
      );
    } catch {
      setDeskWallet([]);
    }
  }

  async function undoSpaTicket(ticket: DeskTicket) {
    if (!selected || !isSpa) return;
    if (
      !window.confirm(
        "Undo đơn spa này? Dịch vụ sẽ bị gỡ và lượt gội được hoàn nếu đã dùng."
      )
    ) {
      return;
    }
    setVerifyingScanId(ticket.key);
    setError("");
    try {
      const res = await fetch("/api/crm/spa/orders", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          customerId: selected.id,
          orderId: ticket.orderId,
          scanEventId: ticket.scan?.id,
          cartToken: ticket.cart?.token || ticket.scan?.cartToken,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Không undo được");
      const token = String(data.cartToken || ticket.cart?.token || "");
      if (token && guestCart?.token === token) {
        setGuestCart((prev) =>
          prev ? { ...prev, status: "OPEN", adminNote: null } : prev
        );
      }
      const restored = Math.max(0, Math.round(Number(data.restored) || 0));
      setOrderMsg(
        restored > 0
          ? `Đã undo đơn spa · hoàn ${restored} lượt tự chọn`
          : "Đã undo đơn spa"
      );
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không undo được");
    } finally {
      setVerifyingScanId(null);
    }
  }

  async function undoPoolScan(scan: Scan) {
    if (!selected || !isPool) return;
    if (!window.confirm("Undo xác thực lần quét này? Vé sẽ bị gỡ.")) return;
    setVerifyingScanId(scan.id);
    setError("");
    try {
      const res = await fetch("/api/crm/pool/orders", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          customerId: selected.id,
          scanEventId: scan.id,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Không undo được");
      const reopenedIds: string[] = Array.isArray(data.reopenedScanIds)
        ? data.reopenedScanIds.map((id: unknown) => String(id))
        : [scan.id];
      for (const id of reopenedIds) {
        patchSelectedScan(id, {
          ticketVerified: false,
          orderSummary: null,
          totalVnd: null,
          orderId: null,
          ticketItems: [],
        });
      }
      if (typeof data.pointsBalance === "number") {
        setSelected((prev) =>
          prev ? { ...prev, pointsBalance: data.pointsBalance } : prev
        );
      }
      const bits = [`Đã undo · ${formatTime(scan.at)}`];
      if (data.pointsRefunded) bits.push(`hoàn ${data.pointsRefunded} điểm`);
      if (data.pointsClawed) bits.push(`thu ${data.pointsClawed} điểm`);
      setOrderMsg(bits.join(" · "));
      void load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không undo được");
    } finally {
      setVerifyingScanId(null);
    }
  }

  async function cancelMiaOrder(orderId: string) {
    if (!selected || !isMiaOi || cancellingOrderId) return;
    if (
      !window.confirm(
        "Huỷ đơn này? Điểm đã đổi sẽ được hoàn, điểm đã cộng từ đơn sẽ bị thu lại."
      )
    ) {
      return;
    }
    setCancellingOrderId(orderId);
    setError("");
    try {
      const res = await fetch(`/api/crm/miaoi/orders/${orderId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "CANCELLED" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Không huỷ được đơn");
      if (typeof data.pointsBalance === "number") {
        setSelected((prev) =>
          prev ? { ...prev, pointsBalance: data.pointsBalance } : prev
        );
      }
      const bits = ["Đã huỷ đơn"];
      if (data.pointsRefunded) bits.push(`hoàn ${data.pointsRefunded} điểm`);
      if (data.pointsClawed) bits.push(`thu ${data.pointsClawed} điểm`);
      setOrderMsg(bits.join(" · "));
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không huỷ được đơn");
    } finally {
      setCancellingOrderId(null);
    }
  }

  function exportTodayBillsPdf() {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const todayTickets = (isMiaOlympic ? groupedTickets : deskTickets).filter((t) => {
      if (!t.scanAt) return false;
      return new Date(t.scanAt).getTime() >= start.getTime();
    });
    const bills: DayBill[] = todayTickets.map((t) => ({
      customerName: t.arrival.fullName || "Khách",
      phone: t.arrival.phone,
      shortId: t.arrival.shortId,
      segmentLabel: segmentAtTime({
        segment: t.arrival.segment,
        segmentLabel: t.arrival.segmentLabel,
        vipStartedAt: t.arrival.vipStartedAt,
        at: ticketMoment(t),
      }).segmentLabel,
      at: t.scanAt || new Date().toISOString(),
      statusLabel: t.orderLabel,
      items: (t.billItems || []).map((i) => ({
        nameVi: i.nameVi,
        qty: i.qty,
        unitPriceVnd: i.priceVnd ?? null,
      })),
      totalVnd: t.billTotal,
      billText: withManualDiscount(
        t.billText,
        t.manualDiscountVnd,
        t.manualDiscountNote
      ),
      tokenShort: t.cart?.token ? t.cart.token.slice(-8).toUpperCase() : null,
    }));
    const dayLabel = new Date().toLocaleDateString("vi-VN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
    printDayBillsPdf({
      zoneName: zoneName || zone || "Quầy",
      dayLabel,
      bills,
    });
    setOrderMsg(`Đã mở PDF · ${bills.length} hoá đơn hôm nay`);
  }

  function sendPoolBill(scan: Scan) {
    if (!selected) return;
    let items: ScanTicketItem[] =
      scan.ticketItems?.filter((i) => i.nameVi && i.qty > 0) || [];
    if (!items.length && scan.orderSummary) {
      items = [
        {
          nameVi: scan.orderSummary,
          qty: 1,
          unitPriceVnd: scan.totalVnd || 0,
        },
      ];
    }
    if (!items.length) {
      setError("Chưa có vé để in bill.");
      return;
    }
    try {
      printPoolBill({
        customerName: selected.fullName || "Khách",
        phone: selected.phone,
        shortId: selected.shortId,
        entryAt: scan.at,
        totalVnd: scan.totalVnd || 0,
        items,
        orderId: scan.orderId,
        manualDiscountVnd: scan.manualDiscountVnd,
        manualDiscountNote: scan.manualDiscountNote,
      });
      setOrderMsg(`Đã gửi in bill · ${formatTime(scan.at)}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không mở được máy in");
    }
  }

  function sendPoolTicketBill(t: DeskTicket) {
    if (t.orderKind === "both" && t.billItems.length) {
      const at = t.scanAt || t.scan?.at || new Date().toISOString();
      const items: ScanTicketItem[] = t.billItems
        .filter((i) => i.nameVi && i.qty > 0)
        .map((i) => ({
          nameVi: i.nameVi,
          qty: i.qty,
          unitPriceVnd:
            i.lineVnd != null && i.qty
              ? Math.round(i.lineVnd / i.qty)
              : i.priceVnd || 0,
        }));
      if (!items.length) {
        setError("Chưa có món để in bill.");
        return;
      }
      try {
        printPoolBill({
          customerName: selected?.fullName || "Khách",
          phone: selected?.phone,
          shortId: selected?.shortId,
          entryAt: at,
          totalVnd: t.billTotal || 0,
          items,
          orderId: t.scan?.orderId || t.orderId,
          manualDiscountVnd: t.manualDiscountVnd,
          manualDiscountNote: t.manualDiscountNote,
        });
        setOrderMsg(`Đã gửi in bill · ${formatTime(at)}`);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Không mở được máy in");
      }
      return;
    }
    if (t.scan && (t.scan.ticketItems?.length || t.scan.orderSummary)) {
      sendPoolBill(t.scan);
      return;
    }
    if (!selected) return;
    const items: ScanTicketItem[] = (t.billItems || [])
      .filter((i) => i.nameVi && i.qty > 0)
      .map((i) => ({
        nameVi: i.nameVi,
        qty: i.qty,
        unitPriceVnd:
          i.lineVnd != null && i.qty
            ? Math.round(i.lineVnd / i.qty)
            : i.priceVnd || 0,
      }));
    if (!items.length) {
      setError("Chưa có vé để in bill.");
      return;
    }
    const at = t.scanAt || t.scan?.at || new Date().toISOString();
    try {
      printPoolBill({
        customerName: selected.fullName || "Khách",
        phone: selected.phone,
        shortId: selected.shortId,
        entryAt: at,
        totalVnd: t.billTotal || t.scan?.totalVnd || 0,
        items,
        orderId: t.orderId || t.scan?.orderId,
        manualDiscountVnd: t.manualDiscountVnd ?? t.scan?.manualDiscountVnd,
        manualDiscountNote: t.manualDiscountNote ?? t.scan?.manualDiscountNote,
      });
      setOrderMsg(`Đã gửi in bill · ${formatTime(at)}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không mở được máy in");
    }
  }

  function qtyCap(item: CatalogItem) {
    if (item.id !== SPA_GOI_BONUS_ID) return 99;
    return swimBonusCap();
  }

  function setQty(item: CatalogItem, qty: number, useAlt = false) {
    const key = lineKey(item.id, useAlt);
    const cap = qtyCap(item);
    setCart((prev) => {
      const next = { ...prev };
      const nextQty = Math.min(qty, cap);
      if (nextQty <= 0) delete next[key];
      else
        next[key] = {
          itemId: item.id,
          qty: nextQty,
          useAltPrice: useAlt,
        };
      return next;
    });
  }

  function qtyOf(item: CatalogItem, useAlt = false) {
    return cart[lineKey(item.id, useAlt)]?.qty || 0;
  }

  function priceLabel(item: CatalogItem, useAlt = false) {
    if (isSpa) {
      const spa = item as SpaMenuItem;
      if (useAlt && spa.priceAltVnd) {
        return `${Math.round(spa.priceAltVnd / 1000)}K`;
      }
      return formatSpaPrice(spa);
    }
    return `${formatMenuPrice(item as MiaOiMenuItem)}k`;
  }

  function catalogTitle() {
    if (isSpa) return "Dịch vụ HHG Oasis Spa";
    return "Gọi món Mía Ơi";
  }

  function catalogUnit() {
    if (isSpa) return "dịch vụ";
    return "món";
  }

  function orderEndpoint() {
    if (isSpa) return "/api/crm/spa/orders";
    return "/api/crm/miaoi/orders";
  }

  function accentColor() {
    if (isSpa) return "#1b3022";
    if (isPool) return "#0c4a6e";
    return "#1e3a5f";
  }

  function viewingFinalizedTicket() {
    const t = focusedTicket;
    if (!t) return false;
    const st = String(t.cart?.status || "");
    if (st === "OPEN" || st === "PENDING_APPROVAL") return false;
    return poolTicketLocked(t);
  }

  function miaOrderLocked() {
    if (!hasCatalog) return false;
    if (spaCartEditable()) return false;
    return viewingFinalizedTicket();
  }

  function spaCartEditable() {
    if (!isSpa || !guestCart) return false;
    const status = String(guestCart.status || "");
    if (status === "OPEN" || status === "PENDING_APPROVAL") return true;
    return status === "USED" && !longNuongVisitDone(guestCart.adminNote);
  }

  function spaDraftRows() {
    if (!spaCartEditable()) return null;
    return cartLines.flatMap((line) => {
      const item = catalogMenu.find((menu) => menu.id === line.itemId);
      if (!item) return [];
      const unit =
        line.useAltPrice && item.priceAltVnd
          ? item.priceAltVnd
          : item.priceVnd;
      return [
        {
          key: lineKey(item.id, !!line.useAltPrice),
          nameVi: item.nameVi,
          qty: line.qty,
          netVnd: unit * line.qty,
          pointsLabel: "",
        },
      ];
    });
  }

  function miaCartOpen() {
    if (!isMiaOi || !guestCart) return false;
    const status = String(guestCart.status || "");
    if (
      status === "PENDING_APPROVAL" ||
      status === "USED" ||
      status === "REJECTED" ||
      status === "CANCELLED" ||
      status === "NO_SHOW"
    ) {
      return false;
    }
    return guestCart.items.some((it) => {
      const id = String(it.id || "");
      if (
        !id ||
        id.startsWith("voucher-") ||
        id.startsWith("points-redeem-") ||
        id.startsWith("disc-") ||
        id.startsWith(MIA_MEMBERSHIP_DISC_PREFIX)
      ) {
        return false;
      }
      return !getPoolItemById(id);
    });
  }

  function poolCartOpen() {
    if (!isPool || !guestCart) return false;
    const status = String(guestCart.status || "");
    return ![
      "PENDING_APPROVAL",
      "USED",
      "REJECTED",
      "CANCELLED",
      "NO_SHOW",
    ].includes(status);
  }

  function deskRedeemKind(): "drink" | "ticket" | null {
    if (isMiaOi) return "drink";
    if (isPool) return "ticket";
    return null;
  }

  function mainOrderRedeemLines(): (RedeemableLine & { source: "main" })[] {
    if (!miaCartOpen() || !guestCart) return [];
    const products = guestCart.items.filter((it) => {
      const id = String(it.id || "");
      return (
        id &&
        !id.startsWith("voucher-") &&
        !id.startsWith("points-redeem-") &&
        !id.startsWith("disc-")
      );
    });
    const lines = products.map((it) => {
      const qty = Math.max(0, Math.round(Number(it.qty) || 0));
      const unit = Math.max(0, Math.round(Number(it.priceVnd) || 0));
      const redeemed = Math.min(
        qty,
        Math.max(0, Math.round(Number(it.pointsRedeemQty) || 0))
      );
      return {
        itemId: it.id,
        qty,
        unitPriceVnd: unit,
        pointsDiscountVnd: redeemed * unit,
        source: "main" as const,
      };
    });
    const explicit = lines.some((l) => (l.pointsDiscountVnd || 0) > 0);
    if (!explicit) {
      const row = guestCart.items.find((it) =>
        String(it.id || "").startsWith("points-redeem-50")
      );
      if (row) {
        let left = Math.max(1, Math.round(Number(row.qty) || 1));
        for (const line of lines) {
          if (left <= 0) break;
          if (
            !isDeskRedeemDrink(line.itemId) ||
            line.unitPriceVnd <= 0 ||
            line.unitPriceVnd > REDEEM_DRINK_MAX_VND
          ) {
            continue;
          }
          const take = Math.min(line.qty, left);
          line.pointsDiscountVnd = take * line.unitPriceVnd;
          left -= take;
        }
      }
    }
    return lines;
  }

  function mainPoolRedeemLines(): (RedeemableLine & { source: "main" })[] {
    if (!poolCartOpen() || !guestCart) return [];
    const products = guestCart.items.filter((it) => {
      const id = String(it.id || "");
      return (
        id &&
        !id.startsWith("voucher-") &&
        !id.startsWith("points-redeem-") &&
        !id.startsWith("disc-")
      );
    });
    const lines = products.map((it) => {
      const qty = Math.max(0, Math.round(Number(it.qty) || 0));
      const unit = Math.max(0, Math.round(Number(it.priceVnd) || 0));
      const redeemed = Math.min(
        qty,
        Math.max(0, Math.round(Number(it.pointsRedeemQty) || 0))
      );
      return {
        itemId: it.id,
        qty,
        unitPriceVnd: unit,
        pointsDiscountVnd:
          isDeskRedeemTicket(it.id) && unit > 0 ? redeemed * unit : 0,
        source: "main" as const,
      };
    });
    const explicit = lines.some((l) => (l.pointsDiscountVnd || 0) > 0);
    if (!explicit) {
      const row = guestCart.items.find((it) =>
        String(it.id || "").startsWith("points-redeem-100")
      );
      if (row) {
        let left = Math.max(1, Math.round(Number(row.qty) || 1));
        for (const line of lines) {
          if (left <= 0) break;
          if (!isDeskRedeemTicket(line.itemId) || line.unitPriceVnd <= 0) continue;
          const take = Math.min(line.qty, left);
          line.pointsDiscountVnd = take * line.unitPriceVnd;
          left -= take;
        }
      }
    }
    return lines;
  }

  function deskRedeemEligibleItems(): (RedeemableLine & {
    source?: "main" | "extra";
  })[] {
    const kind = deskRedeemKind();
    if (!kind) return [];
    if (kind === "drink") {
      const extras = cartLines
        .map((l) => {
          const item = MIAOI_MENU.find((i) => i.id === l.itemId);
          if (!item) return null;
          const unit =
            l.useAltPrice && item.priceAltVnd ? item.priceAltVnd : item.priceVnd;
          return {
            itemId: l.itemId,
            qty: l.qty,
            unitPriceVnd: unit,
            source: "extra" as const,
          };
        })
        .filter((x): x is RedeemableLine & { source: "extra" } => !!x);
      return [...mainOrderRedeemLines(), ...extras];
    }
    const scanId = focusedTicket?.scan?.id;
    const added = scanId
      ? Object.entries(scanCarts[scanId] || {})
          .filter(([, q]) => q > 0)
          .map(([itemId, qty]) => ({ itemId, qty }))
      : [];
    const extras = added
      .map((l) => {
        const item = getPoolItemById(l.itemId);
        if (!item) return null;
        return {
          itemId: l.itemId,
          qty: l.qty,
          unitPriceVnd: item.priceVnd,
          source: "extra" as const,
        };
      })
      .filter((x): x is RedeemableLine & { source: "extra" } => !!x);
    return [...mainPoolRedeemLines(), ...extras];
  }

  function deskRedeemMaxUnits() {
    const kind = deskRedeemKind();
    if (!kind || !selected) return 0;
    const step =
      kind === "ticket" ? DESK_REDEEM_SWIM_STEP : DESK_REDEEM_DRINK_STEP;
    const lines = deskRedeemEligibleItems();
    const byItems = lines.reduce((n, i) => {
      if (!isDeskRedeemEligible(i.itemId, kind) || i.unitPriceVnd <= 0 || i.qty <= 0) {
        return n;
      }
      const covered = Math.min(
        i.qty,
        Math.round((i.pointsDiscountVnd || 0) / i.unitPriceVnd)
      );
      return n + Math.max(0, i.qty - covered);
    }, 0);
    const byPoints = Math.floor((selected.pointsBalance ?? 0) / step);
    return Math.max(0, Math.min(byItems, byPoints));
  }

  function deskRedeemPreview() {
    const kind = deskRedeemKind();
    const empty = {
      units: 0,
      cost: 0,
      discountVnd: 0,
      mainOff: 0,
      extraOff: 0,
      mainUnits: 0,
      extraUnits: 0,
      mainLines: [] as (RedeemableLine & { source?: "main" | "extra" })[],
    };
    if (!kind) return empty;
    const lines = deskRedeemEligibleItems();
    const max = deskRedeemMaxUnits();
    const units = Math.min(deskRedeemUnits, max);
    const applied = applyDeskRedeemUnits(lines, units, kind);
    let mainOff = 0;
    let extraOff = 0;
    let mainUnits = 0;
    let extraUnits = 0;
    applied.items.forEach((it, i) => {
      const prevDisc = lines[i]?.pointsDiscountVnd || 0;
      const nextDisc = it.pointsDiscountVnd || 0;
      const unit = it.unitPriceVnd;
      const prevQty =
        unit > 0 ? Math.min(it.qty, Math.round(prevDisc / unit)) : 0;
      const nextQty =
        unit > 0 ? Math.min(it.qty, Math.round(nextDisc / unit)) : 0;
      const added = Math.max(0, nextQty - prevQty);
      const inc = Math.max(0, nextDisc - prevDisc);
      if (lines[i]?.source === "extra") {
        extraOff += inc;
        extraUnits += added;
      } else if (lines[i]?.source === "main") {
        mainOff += inc;
        mainUnits += added;
      }
    });
    return {
      units: applied.unitsApplied,
      cost: applied.cost,
      discountVnd: applied.discountVnd,
      mainOff,
      extraOff,
      mainUnits,
      extraUnits,
      mainLines: applied.items.filter((_, i) => lines[i]?.source === "main"),
    };
  }

  function openCartBillRows() {
    if (!guestCart) return [];
    const folded = foldPointsOntoItems(previewCartPointLines(guestCart.items));
    const deskPoints =
      (isMiaOi && miaCartOpen()) || (isPool && poolCartOpen());
    if (!deskPoints) return folded;
    const preview = deskRedeemPreview();
    if (preview.mainUnits <= 0) return folded;
    const pointStep = isPool ? DESK_REDEEM_SWIM_STEP : DESK_REDEEM_DRINK_STEP;
    const used = new Set<number>();
    return folded.map((row) => {
      const idx = preview.mainLines.findIndex((line, i) => {
        if (used.has(i)) return false;
        const name =
          guestCart.items.find(
            (it) =>
              it.id === line.itemId &&
              it.qty === line.qty &&
              it.priceVnd === line.unitPriceVnd
          )?.nameVi ||
          guestCart.items.find((it) => it.id === line.itemId)?.nameVi;
        return name === row.nameVi && line.qty === row.qty;
      });
      if (idx < 0) return row;
      used.add(idx);
      const line = preview.mainLines[idx];
      const gross = line.unitPriceVnd * line.qty;
      const disc = Math.min(gross, line.pointsDiscountVnd || 0);
      const covered =
        line.unitPriceVnd > 0
          ? Math.min(line.qty, Math.round(disc / line.unitPriceVnd))
          : 0;
      return {
        ...row,
        netVnd: Math.max(0, gross - disc),
        pointsLabel:
          covered > 0
            ? `Đổi ${covered * pointStep} điểm`
            : row.pointsLabel,
      };
    });
  }

  function selectedDeskVoucher() {
    return deskWallet.find((v) => v.offerId === deskVoucherOfferId) || null;
  }

  function deskMiaMembershipPercent() {
    if (!isMiaOi || !activeAppPackageLabel()) return 0;
    if (!/olympic/i.test(selected?.packageLabel || "")) return 0;
    return miaOiDiscountPercentForPlanLabel(selected?.packageLabel);
  }

  function focusedPoolScan() {
    if (!focusedPoolScanId) return null;
    if (focusedTicket?.scan?.id === focusedPoolScanId) return focusedTicket.scan;
    return (
      guestTickets.find((t) => t.scan?.id === focusedPoolScanId)?.scan ||
      selected?.todayScans?.find((s) => s.id === focusedPoolScanId) ||
      null
    );
  }

  /** Vé trên đơn gộp: giỏ khách đã duyệt cộng vé quầy vừa thêm. */
  function focusedPoolLines() {
    if (!isMiaOlympic) return [];
    const row = scanCarts[BOARD_POOL_KEY] || {};
    const added = Object.entries(row)
      .filter(([, q]) => q > 0)
      .map(([itemId, qty]) => ({ itemId, qty }));
    return mergePoolLines(approvedCartPoolLines(), added);
  }

  function boardPoolTotals() {
    const lines = focusedPoolLines();
    if (!lines.length) {
      return {
        sum: 0,
        qty: 0,
        accessoryDiscount: 0,
        membershipDiscount: 0,
        accessoryQty: 0,
      };
    }
    const priced = computePoolPricing(lines, {
      sameDayMembership: poolSameDay(lines),
    });
    return {
      sum: priced.totalVnd,
      qty: priced.lines.reduce((s, l) => s + l.qty, 0),
      accessoryDiscount: priced.accessoryDiscountVnd,
      membershipDiscount: priced.membershipDiscountVnd,
      accessoryQty: priced.accessoryQty,
    };
  }

  function boardSaveLabel() {
    const pool = boardPoolTotals().qty > 0;
    const mia = cartLines.length > 0;
    if (pool && mia) return "Lưu đơn (hồ + mía)";
    if (pool) return "Xác thực";
    return "Lưu đơn";
  }

  function deskVoucherPreviewCut(baseVnd: number) {
    const v = selectedDeskVoucher();
    if (!v) return 0;
    return deskVoucherCut(baseVnd, v);
  }

  function deskManualDiscountRaw() {
    const digits = String(manualDiscountInput || "").replace(/\D/g, "");
    if (!digits) return 0;
    const n = Math.round(Number(digits));
    return Number.isFinite(n) ? Math.max(0, n) : 0;
  }

  /** Giảm tay trên bill gộp, không vượt số phải thu. */
  function deskManualDiscountVnd() {
    if (!isMiaOlympic || miaCartOpen()) return 0;
    const cap = Math.max(0, deskMiaPayable() + boardPoolTotals().sum);
    return Math.min(deskManualDiscountRaw(), cap);
  }

  function splitDeskManualDiscount() {
    const raw = deskManualDiscountRaw();
    const poolPay = boardPoolTotals().sum;
    const miaPay = deskMiaPayable();
    const vnd = Math.min(raw, poolPay + miaPay);
    const onPool = Math.min(poolPay, vnd);
    const onMia = Math.min(miaPay, Math.max(0, vnd - onPool));
    return {
      raw,
      vnd,
      onPool,
      onMia,
      note: manualDiscountNote.trim().slice(0, 200),
    };
  }

  function deskManualSummaryBit() {
    const vnd = deskManualDiscountVnd();
    if (vnd <= 0) return "";
    return ` · giảm tay −${formatVnd(vnd)}`;
  }

  /** Tiền Mía sau điểm, % hội viên, rồi voucher — cùng thứ tự với API. */
  function deskMiaPayable() {
    const pointsOff = isMiaOi ? deskRedeemPreview().extraOff : 0;
    const afterPoints = Math.max(0, cartTotal - pointsOff);
    const memberOff = isMiaOi
      ? miaOiMembershipDiscountVnd(afterPoints, deskMiaMembershipPercent())
      : 0;
    const afterMember = Math.max(0, afterPoints - memberOff);
    const voucherOff = isMiaOi ? deskVoucherPreviewCut(afterMember) : 0;
    return Math.max(0, afterMember - voucherOff);
  }

  /** Tổng phải thu trên board: hồ + mía (gộp), trừ giảm tay. */
  function deskCatalogPayable() {
    return Math.max(
      0,
      deskMiaPayable() + boardPoolTotals().sum - deskManualDiscountVnd()
    );
  }

  function boardCombinedQty() {
    const miaQty = cartLines.reduce((n, l) => n + l.qty, 0);
    return miaQty + boardPoolTotals().qty;
  }

  function boardSummaryLabel() {
    const pool = boardPoolTotals();
    const miaQty = cartLines.reduce((n, l) => n + l.qty, 0);
    const totalQty = miaQty + pool.qty;
    const totalVnd = deskCatalogPayable();
    if (totalQty <= 0) {
      return isMiaOi && miaCartOpen()
        ? "Không gọi thêm"
        : isMiaOlympic
          ? "Chưa chọn vé / đồ uống"
          : `Chưa chọn ${catalogUnit()}`;
    }
    if (isMiaOlympic) {
      const parts: string[] = [];
      if (pool.qty > 0) {
        const cutBits: string[] = [];
        if (pool.accessoryDiscount > 0) {
          cutBits.push(`−${formatVnd(pool.accessoryDiscount)} PK`);
        }
        if (pool.membershipDiscount > 0) {
          cutBits.push(`−${formatVnd(pool.membershipDiscount)} gói`);
        }
        parts.push(
          `hồ ${formatVnd(pool.sum)}${
            cutBits.length ? ` (đã ${cutBits.join(", ")})` : ""
          }`
        );
      }
      if (miaQty > 0) parts.push(`mía ${formatVnd(deskMiaPayable())}`);
      const prefix = isMiaOi && miaCartOpen() ? "Gọi thêm " : "";
      const memberBit =
        miaQty > 0 && deskMiaMembershipPercent() > 0
          ? ` · hội viên −${deskMiaMembershipPercent()}%`
          : "";
      return `${prefix}${totalQty} món · ${formatVnd(totalVnd)}${
        parts.length ? ` (${parts.join(" + ")})` : ""
      }${memberBit}${
        isMiaOi && deskRedeemPreview().extraUnits
          ? ` · −${deskRedeemPreview().extraUnits * DESK_REDEEM_DRINK_STEP} điểm`
          : ""
      }${selectedDeskVoucher() ? ` · ${selectedDeskVoucher()?.title}` : ""}${deskManualSummaryBit()}`;
    }
    const memberBit =
      miaQty > 0 && deskMiaMembershipPercent() > 0
        ? ` · hội viên −${deskMiaMembershipPercent()}%`
        : "";
    return `${isMiaOi && miaCartOpen() ? "Gọi thêm " : ""}${miaQty} ${catalogUnit()} · ${formatVnd(deskCatalogPayable())}${memberBit}${
      isMiaOi && deskRedeemPreview().extraUnits
        ? ` · −${deskRedeemPreview().extraUnits * DESK_REDEEM_DRINK_STEP} điểm`
        : ""
    }${selectedDeskVoucher() ? ` · ${selectedDeskVoucher()?.title}` : ""}${deskManualSummaryBit()}`;
  }

  /** Dòng ghi rõ được giảm / không giảm trên board gộp. */
  function boardDiscountNotes(): string[] {
    if (!isMiaOlympic) return [];
    const pool = boardPoolTotals();
    const notes: string[] = [];
    if (pool.accessoryDiscount > 0) {
      notes.push(
        `✓ Phụ kiện ≥2 món: −10% phụ kiện (−${formatVnd(pool.accessoryDiscount)})`
      );
    } else if (pool.accessoryQty === 1) {
      notes.push("Phụ kiện: thêm 1 món nữa để −10% (chỉ phần phụ kiện)");
    }
    if (pool.membershipDiscount > 0) {
      notes.push(
        `✓ Gói tháng cùng ngày vé bơi: −10% (−${formatVnd(pool.membershipDiscount)})`
      );
    }
    const pct = deskMiaMembershipPercent();
    const miaQty = cartLines.reduce((n, l) => n + l.qty, 0);
    if (pct > 0 && miaQty > 0) {
      notes.push(`✓ Hội viên Mía: −${pct}% đồ uống`);
    }
    const redeem = deskRedeemPreview();
    if (redeem.extraUnits > 0) {
      notes.push(
        `✓ Điểm Mía: −${redeem.extraUnits * DESK_REDEEM_DRINK_STEP} điểm (−${formatVnd(redeem.extraOff)})`
      );
    }
    if (selectedDeskVoucher()) {
      notes.push(`✓ Voucher Mía: ${selectedDeskVoucher()?.title}`);
    }
    const manual = deskManualDiscountVnd();
    if (manual > 0) {
      const reason = manualDiscountNote.trim();
      notes.push(
        `✓ Giảm tay: −${formatVnd(manual)}${reason ? ` · ${reason}` : ""}`
      );
    }
    return notes;
  }

  function renderManualDiscountRow(disabled?: boolean) {
    if (!isMiaOlympic || miaCartOpen()) return null;
    const raw = deskManualDiscountRaw();
    const applied = deskManualDiscountVnd();
    const shown = raw ? formatVnd(raw).replace(/đ$/, "") : "";
    const needsNote = raw > 0 && !manualDiscountNote.trim();
    return (
      <div
        style={{
          flex: "1 1 100%",
          display: "flex",
          gap: 8,
          alignItems: "center",
          flexWrap: "wrap",
          paddingTop: 8,
          borderTop: "1px solid #e2e8f0",
        }}
      >
        <span
          style={{
            fontWeight: 800,
            fontSize: 13,
            color: "#b45309",
            whiteSpace: "nowrap",
          }}
        >
          Giảm tay
        </span>
        <input
          inputMode="numeric"
          placeholder="0"
          disabled={disabled}
          value={shown}
          aria-label="Số tiền giảm"
          onChange={(e) => {
            const digits = e.target.value.replace(/\D/g, "").slice(0, 9);
            setManualDiscountInput(digits);
          }}
          style={{
            width: 120,
            border: "1px solid #fde68a",
            borderRadius: 12,
            padding: "8px 10px",
            fontSize: 14,
            fontWeight: 700,
            background: "#fff",
          }}
        />
        <span style={{ fontSize: 13, fontWeight: 700, color: "#64748b" }}>đ</span>
        <input
          placeholder="Ghi chú giảm giá"
          disabled={disabled}
          value={manualDiscountNote}
          maxLength={200}
          aria-label="Ghi chú giảm giá"
          onChange={(e) => setManualDiscountNote(e.target.value)}
          style={{
            flex: "1 1 180px",
            minWidth: 160,
            border: needsNote ? "1px solid #f59e0b" : "1px solid #e2e8f0",
            borderRadius: 12,
            padding: "8px 10px",
            fontSize: 14,
            background: "#fff",
          }}
        />
        {needsNote ? (
          <span style={{ fontSize: 12, fontWeight: 700, color: "#b45309" }}>
            Cần ghi chú
          </span>
        ) : null}
        {raw > applied && applied > 0 ? (
          <span style={{ fontSize: 12, fontWeight: 700, color: "#64748b" }}>
            Áp dụng {formatVnd(applied)}
          </span>
        ) : null}
      </div>
    );
  }

  function renderDeskVoucherButton(disabled?: boolean) {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={(e) => {
          e.stopPropagation();
          setVoucherPickerOpen(true);
        }}
        style={{
          ...styles.btn,
          flex: "0 0 auto",
          background: deskVoucherOfferId ? "#5b21b6" : "#6d28d9",
          whiteSpace: "nowrap",
          opacity: disabled ? 0.45 : 1,
        }}
      >
        Dùng voucher
      </button>
    );
  }

  function renderDeskRedeemControl(disabled?: boolean) {
    const kind = deskRedeemKind();
    if (!kind) return null;
    const step =
      kind === "ticket" ? DESK_REDEEM_SWIM_STEP : DESK_REDEEM_DRINK_STEP;
    const max = deskRedeemMaxUnits();
    const units = Math.min(deskRedeemUnits, max);
    const cost = units * step;
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          flex: "0 0 auto",
          background: "#fff",
          border: "1px solid #fde68a",
          borderRadius: 12,
          padding: "4px 6px",
        }}
      >
        <button
          type="button"
          style={{
            ...styles.qtyBtn,
            opacity: units > 0 && !disabled ? 1 : 0.35,
          }}
          disabled={!units || disabled}
          onClick={(e) => {
            e.stopPropagation();
            setDeskRedeemUnits((u) => Math.max(0, u - 1));
          }}
        >
          −
        </button>
        <div style={{ textAlign: "center", minWidth: 92, lineHeight: 1.2 }}>
          <div style={{ fontWeight: 800, fontSize: 12, color: "#b45309", whiteSpace: "nowrap" }}>
            Sử dụng điểm
          </div>
          <div style={{ fontSize: 11, color: "#64748b", fontWeight: 700, whiteSpace: "nowrap" }}>
            {cost} điểm
          </div>
        </div>
        <button
          type="button"
          style={{
            ...styles.qtyBtn,
            opacity: units < max && !disabled ? 1 : 0.35,
          }}
          disabled={units >= max || disabled}
          onClick={(e) => {
            e.stopPropagation();
            setDeskRedeemUnits((u) => Math.min(max, u + 1));
          }}
        >
          +
        </button>
      </div>
    );
  }

  async function confirmMiaCart(mode: "cart" | "added") {
    if (!selected || !guestCart?.token || !miaCartOpen() || ordering) return;
    if (savingOrder.current) return;
    const extras = mode === "added" ? cartLines : [];
    if (mode === "added" && extras.length === 0) {
      setError("Chọn món gọi thêm, hoặc bấm xác nhận giỏ.");
      return;
    }
    savingOrder.current = true;
    const poolLines = focusedPoolLines();
    const poolScan = focusedPoolScan();
    const bundleId =
      poolLines.length > 0 ? `b${Date.now().toString(36)}` : "";
    setOrdering(true);
    setOrderMsg("");
    setError("");
    const notes: string[] = [];
    try {
      if (poolLines.length) {
        const poolRes = await fetch("/api/crm/pool/orders", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            customerId: selected.id,
            ...(poolScan ? { scanEventId: poolScan.id } : {}),
            items: poolLines,
            ...(bundleId ? { deskBundleId: bundleId } : {}),
          }),
        });
        const poolData = await poolRes.json();
        if (!poolRes.ok) throw new Error(poolData.error || "Không xác thực được vé hồ");
        notes.push(`hồ ${formatVnd(poolData.order?.totalVnd || 0)}`);
        setScanCarts((prev) => {
          const next = { ...prev };
          delete next[BOARD_POOL_KEY];
          if (focusedPoolScanId) delete next[focusedPoolScanId];
          return next;
        });
      }
      const res = await fetch("/api/crm/miaoi/confirm-cart", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          zone: "MIA_OI",
          token: guestCart.token,
          extraItems: extras,
          pointsRedeemUnits: deskRedeemUnits,
          voucherOfferId: deskVoucherOfferId || undefined,
          ...(bundleId ? { deskBundleId: bundleId } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Không xác nhận được");
      setCart({});
      setDeskRedeemUnits(0);
      setDeskVoucherOfferId("");
      setVoucherPickerOpen(false);
      void loadDeskWallet(selected.id);
      setGuestCart((prev) => (prev ? { ...prev, status: "USED" } : prev));
      if (typeof data.pointsBalance === "number") {
        setSelected((prev) =>
          prev ? { ...prev, pointsBalance: data.pointsBalance } : prev
        );
      }
      notes.push(`mía ${formatVnd(data.order?.totalVnd || guestCart.totalVnd)}`);
      setOrderMsg(`Đã xác nhận · ${notes.join(" + ")}`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không xác nhận được");
    } finally {
      savingOrder.current = false;
      setOrdering(false);
    }
  }

  /** Lưu đơn gộp: xác thực vé hồ (nếu có) rồi lưu đồ uống Mía (nếu có). */
  async function saveMiaOlympicBoard() {
    if (!selected || !isMiaOlympic || ordering || savingOrder.current) return;
    const pool = boardPoolTotals();
    const miaPay = deskMiaPayable();
    const manual = splitDeskManualDiscount();
    const hasMia = cartLines.length > 0;
    const scan = focusedPoolScan();
    const poolLines = focusedPoolLines();
    const hasPool = poolLines.length > 0;
    if (!hasMia && !hasPool) {
      setError("Chọn vé hồ hoặc đồ uống Mía trước khi lưu.");
      return;
    }
    if (manual.raw > 0 && !manual.note) {
      setError("Nhập ghi chú cho khoản giảm giá.");
      return;
    }
    savingOrder.current = true;
    setOrdering(true);
    setOrderMsg("");
    setError("");
    const notes: string[] = [];
    let savedVnd = 0;
    let poolSaved = false;
    let finished = false;
    const bundleId =
      hasMia && hasPool ? `b${Date.now().toString(36)}` : "";
    const pendingScanId =
      focusedTicket?.orderStatus === "pending" && focusedTicket.scan?.id
        ? focusedTicket.scan.id
        : "";
    let resolvedScanId =
      scan?.id || focusedPoolScanId || pendingScanId || "";
    try {
      if (hasPool) {
        const items = poolLines;
        if (!items.length) throw new Error("Chọn ít nhất 1 vé hồ trước khi lưu.");
        const res = await fetch("/api/crm/pool/orders", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            customerId: selected.id,
            ...(resolvedScanId ? { scanEventId: resolvedScanId } : {}),
            items,
            ...(bundleId ? { deskBundleId: bundleId } : {}),
            ...(manual.onPool > 0
              ? { manualDiscountVnd: manual.onPool, note: manual.note }
              : {}),
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Không lưu được vé hồ");
        poolSaved = true;
        resolvedScanId = String(data.scanEventId || resolvedScanId || "");
        const poolTotal = Number(data.order?.totalVnd);
        const poolShown = Number.isFinite(poolTotal) ? poolTotal : pool.sum;
        savedVnd += poolShown;
        notes.push(`hồ ${formatVnd(poolShown)}`);
        setScanCarts((prev) => {
          const next = { ...prev };
          delete next[BOARD_POOL_KEY];
          if (focusedPoolScanId) delete next[focusedPoolScanId];
          return next;
        });
      }
      if (hasMia) {
        /**
         * Mía-only → finalize đúng lần Tạo đơn (scanEventId).
         * Gộp với hồ → MIA_OI_ORDER + deskBundleId gắn lên lần quét hồ vừa lưu.
         */
        const res = await fetch("/api/crm/miaoi/orders", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            customerId: selected.id,
            items: cartLines,
            pointsRedeemUnits: deskRedeemUnits,
            voucherOfferId: deskVoucherOfferId || undefined,
            ...(bundleId ? { deskBundleId: bundleId } : {}),
            ...(resolvedScanId ? { scanEventId: resolvedScanId } : {}),
            ...(!hasPool ? { consumeWalkInShell: true } : {}),
            ...(manual.onMia > 0
              ? { manualDiscountVnd: manual.onMia, note: manual.note }
              : {}),
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Không lưu được đơn Mía");
        const miaTotal = Number(data.order?.totalVnd);
        const miaShown = Number.isFinite(miaTotal)
          ? miaTotal
          : Math.max(0, miaPay - manual.onMia);
        savedVnd += miaShown;
        notes.push(`mía ${formatVnd(miaShown)}`);
        setCart({});
        setDeskRedeemUnits(0);
        setDeskVoucherOfferId("");
        setVoucherPickerOpen(false);
        void loadDeskWallet(selected.id);
        if (typeof data.pointsBalance === "number") {
          setSelected((prev) =>
            prev ? { ...prev, pointsBalance: data.pointsBalance } : prev
          );
        }
      }
      finished = true;
      setManualDiscountInput("");
      setManualDiscountNote("");
      setOrderMsg(
        `Đã lưu · ${notes.join(" + ")}${
          notes.length ? ` · tổng ${formatVnd(savedVnd)}` : ""
        }${
          manual.vnd > 0
            ? ` · giảm tay −${formatVnd(manual.vnd)} (${manual.note})`
            : ""
        }`
      );
      await load();
    } catch (e) {
      if (!finished && poolSaved && manual.onPool > 0) {
        const left = Math.max(0, manual.vnd - manual.onPool);
        setManualDiscountInput(left ? String(left) : "");
        if (!left) setManualDiscountNote("");
      }
      setError(e instanceof Error ? e.message : "Không lưu được");
    } finally {
      savingOrder.current = false;
      setOrdering(false);
    }
  }

  async function saveOrder(finalize = false) {
    // Quầy gộp Mía+Hồ: dùng saveMiaOlympicBoard (isPool cũng true)
    if (isMiaOlympic) {
      await saveMiaOlympicBoard();
      return;
    }
    if (!selected || !hasCatalog || isPool || cartLines.length === 0) return;
    if (miaOrderLocked()) return;
    if (savingOrder.current) return;
    const revisingSpa = spaCartEditable();
    if (finalize && !revisingSpa) return;
    savingOrder.current = true;
    setOrdering(true);
    setOrderMsg("");
    setError("");
    try {
      const res = await fetch(orderEndpoint(), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          customerId: selected.id,
          items: cartLines,
          ...(revisingSpa && guestCart
            ? { cartToken: guestCart.token, ...(finalize ? { finalize: true } : {}) }
            : {
                scanEventId:
                  focusedTicket?.orderStatus === "pending" &&
                  focusedTicket.scan?.id
                    ? focusedTicket.scan.id
                    : undefined,
                ...(!isSpa ? { consumeWalkInShell: true } : {}),
              }),
          pointsRedeemUnits: deskRedeemUnits,
          voucherOfferId: deskVoucherOfferId || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Không lưu được đơn");
      if (data.revised && guestCart) {
        const nextItems = Array.isArray(data.items) ? data.items : guestCart.items;
        const total =
          typeof data.totalVnd === "number" ? data.totalVnd : cartTotal;
        setGuestCart({
          ...guestCart,
          status: data.finalized ? "USED" : guestCart.status,
          items: nextItems,
          totalVnd: total,
        });
        setOrderMsg(
          data.finalized
            ? `Đã xác nhận · ${formatVnd(total)}`
            : `Đã cập nhật đơn gốc · ${formatVnd(total)}`
        );
        if (data.finalized) setCart({});
      } else {
        setCart({});
        setOrderMsg(
          `Đã lưu · ${formatVnd(data.order?.totalVnd || cartTotal)} · order thêm = hàng mới trên bảng`
        );
        if (data.order?.id) setSelectedTicketKey(`order-${data.order.id}`);
      }
      setDeskRedeemUnits(0);
      setDeskVoucherOfferId("");
      setVoucherPickerOpen(false);
      void loadDeskWallet(selected.id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không lưu được đơn");
    } finally {
      savingOrder.current = false;
      setOrdering(false);
    }
  }

  // ── 1) Chọn khu ──────────────────────────────────────────
  if (step === "pick") {
    return (
      <main style={styles.page}>
        <div style={{ ...styles.card, maxWidth: 560 }}>
          <p style={styles.eyebrow}>adminAllplace · Quầy phân khu</p>
          <h1 style={styles.h1}>Chọn khu vực</h1>
          <p style={styles.mute}>
            Bấm khu → đăng nhập acc khu đó → chỉ thấy khách quét QR khu đó.
          </p>
          <div
            style={{
              marginTop: 20,
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: 10,
            }}
          >
            {DESK_ZONES.map((z) => (
              <button
                key={z.code}
                type="button"
                onClick={() => chooseZone(z)}
                style={{
                  ...styles.zoneBtn,
                  borderColor:
                    miaOlympicSector(z.code)
                      ? "#b45309"
                      : z.code === "SAUNA"
                        ? "#1b3022"
                        : z.code === "SWIM_LESSON"
                          ? "#0369a1"
                          : "#e2e8f0",
                  background:
                    miaOlympicSector(z.code)
                      ? "#fff7ed"
                      : z.code === "SAUNA"
                        ? "#eef5f0"
                        : z.code === "SWIM_LESSON"
                          ? "#e0f2fe"
                          : "#f1f5f9",
                }}
              >
                <strong style={{ fontSize: 15 }}>{z.name}</strong>
              </button>
            ))}
            <button
              type="button"
              onClick={chooseAdmin}
              style={{
                ...styles.zoneBtn,
                borderColor: "#a16207",
                background: "#fef9c3",
              }}
            >
              <strong style={{ fontSize: 15 }}>
                Admin
              </strong>
            </button>
          </div>
          <p style={{ ...styles.mute, marginTop: 16, fontSize: 12 }}>
            Acc admin lớn: <strong>{ADMIN_PANEL_USERNAME}</strong> — mọi khu.
            <br />
            Acc admin từng khu: <strong>ADMINISTRATION</strong>
            {" + "}
            tên khu (vd. ADMINISTRATIONMIAOI) · mk <strong>12345678</strong>.
          </p>
        </div>
      </main>
    );
  }

  // ── 2) Đăng nhập khu ─────────────────────────────────────
  if (step === "login" && picked) {
    return (
      <main style={styles.page}>
        <div style={styles.card}>
          <p style={styles.eyebrow}>
            Khu vực · {miaOlympicSector(picked.code) ? MIA_OLYMPIC_LABEL : picked.name}
          </p>
          <h1 style={styles.h1}>Đăng nhập</h1>
          <p style={styles.mute}>
            {picked.code === "ADMIN" ? (
              <>
                Acc admin: <strong>{ADMIN_PANEL_USERNAME}</strong> · mk{" "}
                <strong>{ADMIN_PANEL_PASSWORD}</strong>
              </>
            ) : miaOlympicSector(picked.code) ? (
              <>
                Acc khu: <strong>MIAOI</strong>, <strong>GYM</strong> hoặc{" "}
                <strong>VIP</strong>
                <br />
                Acc admin khu: <strong>ADMINISTRATIONMIAOI</strong> /{" "}
                <strong>ADMINISTRATIONGYM</strong> /{" "}
                <strong>ADMINISTRATIONVIP</strong> · mk <strong>12345678</strong>
              </>
            ) : (
              <>
                Acc khu: <strong>{picked.username}</strong>
                <br />
                Acc admin khu:{" "}
                <strong>{zoneAdminUsername(picked.username)}</strong> · mk{" "}
                <strong>12345678</strong>
              </>
            )}
            {picked.code === "ADMIN" ? null : (
              <>
                <br />
                Hoặc <strong>{ADMIN_PANEL_USERNAME}</strong> (mọi khu).
              </>
            )}
          </p>
          <form onSubmit={login} style={{ marginTop: 20, display: "grid", gap: 12 }}>
            <input
              style={styles.input}
              placeholder="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
            />
            <input
              style={styles.input}
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
            {loginError ? (
              <p
                style={{
                  ...styles.err,
                  background: "#fef2f2",
                  padding: 10,
                  borderRadius: 10,
                }}
              >
                {loginError}
              </p>
            ) : null}
            <button type="submit" style={styles.btn}>
              Đăng nhập
            </button>
            <button type="button" style={styles.ghost} onClick={backToPick}>
              ← Chọn lại khu
            </button>
          </form>
        </div>
      </main>
    );
  }

  if (step === "dashboard" && zone === "ADMIN") {
    return (
      <DeskVipSubscribers
        onBack={backToPick}
        onLogout={() => void logout()}
      />
    );
  }

  // ── 3a) Quầy học bơi — danh sách học viên ─────────────────
  if (zone && isSwimLessonDesk(zone)) {
    return (
      <DeskSwimStudents
        onBack={backToPick}
        onLogout={() => void logout()}
      />
    );
  }

  // ── 3) Dashboard khu ─────────────────────────────────────
  return (
    <main style={styles.page}>
      <style>{`
        .desk-header > div:first-child {
          flex: 1 1 auto;
          min-width: 0;
        }
        .desk-actions {
          flex: 0 0 auto;
          max-width: 100%;
        }
        @media (max-width: 760px) {
          .desk-header {
            flex-direction: column !important;
            align-items: stretch !important;
          }
          .desk-actions {
            display: grid !important;
            grid-template-columns: 1fr 1fr;
            justify-content: stretch !important;
          }
          .desk-actions button {
            width: 100%;
            font-size: 13px;
            padding: 0 10px;
          }
        }
      `}</style>
      <header className="desk-header" style={styles.header}>
        <div>
          <p style={styles.eyebrow}>adminAllplace · Quầy phân khu</p>
          <h1 style={styles.h1}>{title}</h1>
        </div>
        <div
          className="desk-actions"
          style={{
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
            justifyContent: "flex-end",
            alignItems: "flex-start",
          }}
        >
          {zone &&
          zone !== "SAUNA" &&
          zone !== "SPA" &&
          zoneHasResources(zone) &&
          zone !== "PICKLEBALL" &&
          (zone !== "LONG_NUONG" || SHOW_LONG_NUONG_TABLE_MAP) ? (
            <button
              type="button"
              style={{ ...styles.actionBtn, background: "#7c2d12" }}
              onClick={() => setResourceMapOpen(true)}
            >
              Sơ đồ bàn
            </button>
          ) : null}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 6,
              alignItems: "stretch",
            }}
          >
            <button
              type="button"
              style={{ ...styles.actionBtn, background: "#0f766e" }}
              onClick={() => {
                setScanError("");
                setManualToken("");
                setScanSession((n) => n + 1);
                setScanOpen(true);
              }}
            >
              Quét QR khách
            </button>
            {isSpa || isLongNuong ? (
              <button
                type="button"
                style={styles.actionGhost}
                onClick={() => {
                  void loadClaimHistory();
                  setRedeemedOpen(true);
                }}
              >
                Redeemed vouchers
              </button>
            ) : null}
          </div>
          <button
            type="button"
            style={{
              ...styles.btn,
              background: "#7c3aed",
              height: 42,
              padding: "0 16px",
              fontSize: 14,
            }}
            onClick={() => setCalendarOpen(true)}
          >
            Lịch
          </button>
          <button
            type="button"
            style={{
              ...styles.actionBtn,
              background: "#1d4ed8",
              color: "#fff",
            }}
            onClick={() => {
              setCreateGuestError("");
              setGuestName("");
              setGuestPhone("");
              setGuestSearch("");
              setGuestHits([]);
              setCreateGuestOpen(true);
            }}
          >
            Tạo đơn
          </button>
          <button
            type="button"
            style={styles.actionGhost}
            onClick={() => {
              try {
                exportTodayBillsPdf();
              } catch (e) {
                setError(
                  e instanceof Error ? e.message : "Không xuất được PDF"
                );
              }
            }}
          >
            Xuất all PDF hôm nay
          </button>
          {isSystemAdminUser ? (
            <button type="button" style={styles.actionGhost} onClick={backToPick}>
              Đổi khu
            </button>
          ) : null}
          <button type="button" style={styles.actionGhost} onClick={() => void load()}>
            Làm mới
          </button>
          <button
            type="button"
            style={styles.actionGhost}
            onClick={() => void logout()}
          >
            Đăng xuất
          </button>
        </div>
      </header>
      {isMiaOlympic ? (
        <div
          ref={listMenuRef}
          style={{
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
            justifyContent: "flex-end",
            margin: "0 0 12px",
            position: "relative",
            zIndex: 20,
          }}
        >
          {(
            [
              {
                id: "zone" as const,
                value:
                  DESK_ZONE_FILTERS.find((f) => f.id === orderFilter)?.label ||
                  "Tất cả",
                active: orderFilter !== "all" || listMenu === "zone",
                options: DESK_ZONE_FILTERS.map((f) => ({
                  id: f.id,
                  label: f.label,
                  on: orderFilter === f.id,
                  search: "",
                })),
              },
              {
                id: "package" as const,
                value:
                  DESK_PACKAGE_FILTERS.find((p) => p.id === packageFilter)
                    ?.label || "Tất cả",
                active: !!packageFilter || listMenu === "package",
                options: [
                  { id: "", label: "Tất cả", on: !packageFilter, search: "" },
                  ...DESK_PACKAGE_FILTERS.map((p) => ({
                    id: p.id,
                    label: p.label,
                    on: packageFilter === p.id,
                    search: "",
                  })),
                ],
              },
              {
                id: "sort" as const,
                value:
                  orderSorts
                    .map(
                      (id) => DESK_ORDER_SORTS.find((s) => s.id === id)?.label
                    )
                    .filter(Boolean)
                    .join(" · ") || "Mới nhất",
                active:
                  orderSorts.length !== 1 ||
                  orderSorts[0] !== "time-desc" ||
                  listMenu === "sort",
                options: DESK_ORDER_SORTS.map((s) => ({
                  id: s.id,
                  label: s.label,
                  on: orderSorts.includes(s.id),
                  search:
                    s.id === "staff" ? "staff" : s.id === "name" ? "name" : "",
                })),
              },
            ]
          ).map((menu) => {
            const open = listMenu === menu.id;
            return (
              <div key={menu.id} style={{ position: "relative" }}>
                <button
                  type="button"
                  aria-expanded={open}
                  onClick={() =>
                    setListMenu((cur) => (cur === menu.id ? null : menu.id))
                  }
                  style={{
                    border: menu.active
                      ? "1px solid #1e3a5f"
                      : "1px solid #cbd5e1",
                    background: menu.active ? "#1e3a5f" : "#fff",
                    color: menu.active ? "#fff" : "#0f172a",
                    borderRadius: 999,
                    height: 34,
                    padding: "0 14px",
                    fontWeight: 800,
                    fontSize: 12,
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <span>{menu.value}</span>
                  <span aria-hidden style={{ fontSize: 10, opacity: 0.8 }}>
                    {open ? "▴" : "▾"}
                  </span>
                </button>
                {open ? (
                  <div
                    role="menu"
                    style={{
                      position: "absolute",
                      top: 40,
                      right: 0,
                      minWidth: menu.id === "package" ? 280 : 220,
                      maxHeight: menu.id === "package" ? 360 : undefined,
                      overflowY: menu.id === "package" ? "auto" : undefined,
                      background: "#fff",
                      border: "1px solid #e2e8f0",
                      borderRadius: 14,
                      boxShadow: "0 16px 40px rgba(15,23,42,.16)",
                      padding: 6,
                      zIndex: 30,
                      display: menu.id === "sort" ? "flex" : undefined,
                      flexDirection: menu.id === "sort" ? "column" : undefined,
                      gap: menu.id === "sort" ? 8 : undefined,
                    }}
                  >
                    {menu.options.map((opt) => (
                      <div key={opt.id}>
                        <button
                          type="button"
                          role={
                            menu.id === "sort" ? "menuitemcheckbox" : "menuitemradio"
                          }
                          aria-checked={opt.on}
                          onClick={() => {
                            if (menu.id === "zone") {
                              setOrderFilter(opt.id as DeskZoneFilter);
                              setListMenu(null);
                              return;
                            }
                            if (menu.id === "package") {
                              setPackageFilter(opt.id);
                              setListMenu(null);
                              return;
                            }
                            setOrderSorts((cur) =>
                              toggleOrderSort(cur, opt.id as DeskOrderSort)
                            );
                          }}
                          style={{
                            display: "block",
                            width: "100%",
                            textAlign: "left",
                            border: 0,
                            borderRadius: 10,
                            background: opt.on ? "#1e3a5f" : "transparent",
                            color: opt.on ? "#fff" : "#0f172a",
                            fontWeight: 700,
                            fontSize: 13,
                            padding: "9px 12px",
                            cursor: "pointer",
                          }}
                        >
                          {opt.label}
                        </button>
                        {opt.search && opt.on ? (
                          <input
                            type="search"
                            value={
                              opt.search === "staff" ? staffQuery : nameQuery
                            }
                            placeholder={
                              opt.search === "staff"
                                ? "Tìm nhân viên"
                                : "Tìm tên khách"
                            }
                            aria-label={
                              opt.search === "staff"
                                ? "Tìm nhân viên đứng ca"
                                : "Tìm tên khách"
                            }
                            onChange={(e) => {
                              if (opt.search === "staff") {
                                setStaffQuery(e.target.value);
                              } else {
                                setNameQuery(e.target.value);
                              }
                            }}
                            style={{
                              display: "block",
                              width: "calc(100% - 12px)",
                              margin: "8px 6px 0",
                              boxSizing: "border-box",
                              border: "1px solid #e2e8f0",
                              borderRadius: 8,
                              padding: "7px 10px",
                              fontSize: 13,
                              fontWeight: 600,
                              color: "#0f172a",
                            }}
                          />
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}

      {calendarOpen && zone ? (
        <DeskCalendar
          zone={zone}
          zoneName={zoneName || zone}
          onClose={() => setCalendarOpen(false)}
          onSelectDate={(date) => {
            setCalendarOpen(false);
            setViewDate(date);
            setSelected(null);
          }}
        />
      ) : null}

      {viewDate ? (
        <div
          style={{
            margin: "0 0 12px",
            padding: "12px 14px",
            borderRadius: 12,
            background: "#ede9fe",
            color: "#5b21b6",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <span style={{ fontWeight: 700, fontSize: 14 }}>
            Đang xem ngày{" "}
            {viewDate.split("-").reverse().join("/")} — khách vào / yêu cầu
            trong ngày
          </span>
          <button
            type="button"
            style={{
              ...styles.btn,
              height: 36,
              padding: "0 14px",
              fontSize: 13,
              background: "#5b21b6",
            }}
            onClick={() => {
              setViewDate(null);
              setSelected(null);
            }}
          >
            Về hôm nay
          </button>
        </div>
      ) : null}

      {error ? <p style={styles.err}>{error}</p> : null}
      {orderMsg ? (
        <p
          style={{
            margin: "0 0 12px",
            padding: "10px 14px",
            borderRadius: 12,
            background: "#ecfdf5",
            color: "#047857",
            fontWeight: 700,
            fontSize: 14,
          }}
        >
          {orderMsg}
        </p>
      ) : null}
      {redeemedOpen && (isSpa || isLongNuong) ? (
        <div
          style={styles.modalBackdrop}
          onClick={() => setRedeemedOpen(false)}
        >
          <div
            style={{ ...styles.modal, maxWidth: 640 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                gap: 12,
                marginBottom: 12,
              }}
            >
              <div>
                <h2 style={{ margin: 0, fontSize: 18 }}>Redeemed vouchers</h2>
                <p style={{ ...styles.mute, margin: "4px 0 0" }}>
                  Voucher quét riêng, không gắn với đơn dịch vụ.
                </p>
              </div>
              <button
                type="button"
                style={styles.closeBtn}
                onClick={() => setRedeemedOpen(false)}
              >
                Đóng
              </button>
            </div>
            {voucherMsg ? (
              <p
                style={{
                  margin: "0 0 10px",
                  padding: "8px 12px",
                  borderRadius: 10,
                  background: "#ecfdf5",
                  color: "#047857",
                  fontWeight: 700,
                  fontSize: 13,
                }}
              >
                {voucherMsg}
              </p>
            ) : null}
            {claimLogs.length === 0 ? (
              <p style={{ ...styles.mute, margin: 0 }}>Chưa có voucher đã đổi.</p>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ textAlign: "left", color: "#78716c" }}>
                    <th style={{ padding: "6px 8px 6px 0", fontWeight: 700 }}>Customer</th>
                    <th style={{ padding: "6px 8px", fontWeight: 700 }}>Phone</th>
                    <th style={{ padding: "6px 8px", fontWeight: 700 }}>Date used</th>
                    <th style={{ padding: "6px 0 6px 8px", fontWeight: 700 }}>Voucher</th>
                  </tr>
                </thead>
                <tbody>
                  {claimLogs.slice(0, 20).map((l) => (
                    <tr key={l.id} style={{ borderTop: "1px solid #f5f5f4" }}>
                      <td style={{ padding: "8px 8px 8px 0" }}>
                        {l.customerName || "Khách"}
                      </td>
                      <td style={{ padding: "8px" }}>{l.phone || "—"}</td>
                      <td style={{ padding: "8px" }}>
                        {new Date(l.at).toLocaleString("vi-VN")}
                      </td>
                      <td style={{ padding: "8px 0 8px 8px", fontWeight: 700 }}>
                        {l.offerTitle || "Voucher"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      ) : null}

      {rejectTarget ? (
        <div
          style={styles.modalBackdrop}
          onClick={() => !rejectBusy && setRejectTarget(null)}
        >
          <div
            style={{ ...styles.modal, maxWidth: 420 }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ margin: 0, fontSize: 20 }}>Từ chối yêu cầu</h2>
            <p style={{ ...styles.mute, marginTop: 6 }}>
              {rejectTarget.name} — nhập lý do gửi cho khách.
            </p>
            <textarea
              style={{
                ...styles.input,
                height: 100,
                resize: "vertical",
                marginTop: 12,
              }}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Ví dụ: Hết chỗ / sai gói / ngoài giờ…"
              disabled={rejectBusy}
            />
            <div
              style={{
                display: "flex",
                gap: 8,
                marginTop: 14,
                justifyContent: "flex-end",
              }}
            >
              <button
                type="button"
                style={styles.ghost}
                disabled={rejectBusy}
                onClick={() => setRejectTarget(null)}
              >
                Huỷ
              </button>
              <button
                type="button"
                style={{ ...styles.btn, background: "#b91c1c" }}
                disabled={rejectBusy || rejectReason.trim().length < 2}
                onClick={() => void submitReject()}
              >
                {rejectBusy ? "…" : "Gửi từ chối"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {redeemOpen && selected ? (
        <div
          style={styles.modalBackdrop}
          onClick={() => !redeemBusy && setRedeemOpen(false)}
        >
          <div
            style={{ ...styles.modal, maxWidth: 440 }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ margin: 0, fontSize: 18 }}>Đổi điểm</h2>
            <p style={styles.mute}>
              {selected.fullName || "Khách"} ·{" "}
              <strong>{selected.pointsBalance ?? 0} điểm</strong>
              <br />
              50đ → đồ uống ≤50k · 100đ → vé bơi · trừ đủ điểm dù món rẻ hơn.
            </p>
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button
                type="button"
                style={{
                  ...styles.btn,
                  flex: 1,
                  background: redeemTier === 50 ? "#b45309" : "#94a3b8",
                }}
                disabled={redeemBusy}
                onClick={() => void switchRedeemTier(50)}
              >
                50 điểm
              </button>
              <button
                type="button"
                style={{
                  ...styles.btn,
                  flex: 1,
                  background: redeemTier === 100 ? "#0c4a6e" : "#94a3b8",
                }}
                disabled={redeemBusy}
                onClick={() => void switchRedeemTier(100)}
              >
                100 điểm
              </button>
            </div>
            <div
              style={{
                marginTop: 12,
                maxHeight: 280,
                overflow: "auto",
                display: "grid",
                gap: 6,
              }}
            >
              {redeemItems.length === 0 ? (
                <p style={styles.mute}>Không có món phù hợp.</p>
              ) : (
                redeemItems.map((it) => (
                  <label
                    key={it.id}
                    style={{
                      display: "flex",
                      gap: 10,
                      alignItems: "center",
                      padding: "8px 10px",
                      borderRadius: 10,
                      border:
                        redeemItemId === it.id
                          ? "2px solid #b45309"
                          : "1px solid #e2e8f0",
                      background: redeemItemId === it.id ? "#fffbeb" : "#fff",
                      cursor: "pointer",
                    }}
                  >
                    <input
                      type="radio"
                      name="redeemItem"
                      checked={redeemItemId === it.id}
                      onChange={() => setRedeemItemId(it.id)}
                    />
                    <span style={{ flex: 1, fontSize: 14, fontWeight: 600 }}>
                      {it.nameVi}
                    </span>
                    <span style={{ fontSize: 13, color: "#64748b" }}>
                      {formatVnd(it.priceVnd)}
                    </span>
                  </label>
                ))
              )}
            </div>
            {redeemMsg ? (
              <p
                style={{
                  marginTop: 10,
                  fontSize: 13,
                  color: redeemMsg.startsWith("Đã") ? "#047857" : "#b91c1c",
                }}
              >
                {redeemMsg}
              </p>
            ) : null}
            <div
              style={{
                display: "flex",
                gap: 8,
                marginTop: 14,
                justifyContent: "flex-end",
              }}
            >
              <button
                type="button"
                style={styles.closeBtn}
                disabled={redeemBusy}
                onClick={() => setRedeemOpen(false)}
              >
                Đóng
              </button>
              <button
                type="button"
                style={{ ...styles.btn, background: "#b45309" }}
                disabled={redeemBusy || !redeemItemId}
                onClick={() => void submitRedeem()}
              >
                {redeemBusy ? "…" : `Đổi ${redeemTier} điểm`}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {createGuestOpen ? (
        <div
          style={styles.modalBackdrop}
          onClick={() => !createGuestBusy && setCreateGuestOpen(false)}
        >
          <div
            style={{ ...styles.modal, maxWidth: 420 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                gap: 12,
                marginBottom: 12,
              }}
            >
              <div>
                <h2 style={{ margin: 0, fontSize: 20 }}>Tạo đơn</h2>
                <p style={{ ...styles.mute, marginTop: 4 }}>
                  Có tài khoản: tìm hoặc nhập họ tên và SĐT. Mật khẩu app là
                  số điện thoại. Khách không đăng ký: tạo đơn khách lẻ.
                </p>
              </div>
              <button
                type="button"
                style={styles.closeBtn}
                disabled={createGuestBusy}
                onClick={() => {
                  setCreateGuestOpen(false);
                }}
              >
                Đóng
              </button>
            </div>
            <div style={{ display: "grid", gap: 10 }}>
              <label
                style={{ fontSize: 13, fontWeight: 700, color: "#475569" }}
              >
                Tìm khách đã có tài khoản
                <input
                  style={{ ...styles.input, marginTop: 6 }}
                  value={guestSearch}
                  onChange={(e) => setGuestSearch(e.target.value)}
                  placeholder="Tên hoặc số điện thoại"
                  disabled={createGuestBusy}
                  autoFocus
                />
              </label>
              {guestSearch.trim().length >= 2 ? (
                <div
                  style={{
                    maxHeight: 180,
                    overflowY: "auto",
                    border: "1px solid #e2e8f0",
                    borderRadius: 12,
                    background: "#fff",
                  }}
                >
                  {guestSearchBusy ? (
                    <p style={{ ...styles.mute, margin: 0, padding: 10 }}>
                      Đang tìm…
                    </p>
                  ) : guestHits.length ? (
                    guestHits.map((hit) => (
                      <button
                        key={hit.id}
                        type="button"
                        disabled={createGuestBusy}
                        onClick={() => {
                          setGuestName(hit.fullName || "");
                          setGuestPhone(hit.phone || "");
                          setGuestSearch("");
                          setGuestHits([]);
                        }}
                        style={{
                          display: "block",
                          width: "100%",
                          textAlign: "left",
                          border: 0,
                          borderBottom: "1px solid #f1f5f9",
                          background: "transparent",
                          padding: "10px 12px",
                          cursor: "pointer",
                        }}
                      >
                        <span style={{ fontWeight: 800, fontSize: 14 }}>
                          {hit.fullName || hit.customerCode}
                        </span>
                        <span
                          style={{
                            marginLeft: 8,
                            fontSize: 11,
                            fontWeight: 800,
                            color: segmentMarkStyle(hit.segment || "").color,
                          }}
                        >
                          {hit.segmentLabel}
                        </span>
                        <span
                          style={{
                            display: "block",
                            marginTop: 2,
                            fontSize: 12,
                            color: "#64748b",
                          }}
                        >
                          {hit.phone || "—"}
                          {hit.shortId ? ` · ID ${hit.shortId}` : ""}
                        </span>
                      </button>
                    ))
                  ) : (
                    <p style={{ ...styles.mute, margin: 0, padding: 10 }}>
                      Không thấy khách. Nhập họ tên + SĐT để tạo tài khoản,
                      hoặc tạo đơn khách lẻ.
                    </p>
                  )}
                </div>
              ) : null}
              <label
                style={{ fontSize: 13, fontWeight: 700, color: "#475569" }}
              >
                Họ tên
                <input
                  style={{ ...styles.input, marginTop: 6 }}
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                  placeholder="Nguyễn Văn A"
                  disabled={createGuestBusy}
                />
              </label>
              <label
                style={{ fontSize: 13, fontWeight: 700, color: "#475569" }}
              >
                Số điện thoại
                <input
                  style={{ ...styles.input, marginTop: 6 }}
                  value={guestPhone}
                  onChange={(e) => setGuestPhone(e.target.value)}
                  placeholder="09xxxxxxxx"
                  inputMode="tel"
                  disabled={createGuestBusy}
                />
              </label>
              {createGuestError ? (
                <p style={styles.err}>{createGuestError}</p>
              ) : null}
              <button
                type="button"
                style={{
                  ...styles.btn,
                  background: "#1d4ed8",
                  opacity:
                    guestName.trim() && guestPhone.trim() && !createGuestBusy
                      ? 1
                      : 0.45,
                }}
                disabled={
                  !guestName.trim() || !guestPhone.trim() || createGuestBusy
                }
                onClick={() => void submitCreateGuest(false)}
              >
                {createGuestBusy ? "Đang tạo…" : "Tạo đơn"}
              </button>
              <button
                type="button"
                style={{
                  ...styles.ghost,
                  width: "100%",
                  fontWeight: 800,
                  color: "#9a3412",
                  opacity: createGuestBusy ? 0.45 : 1,
                }}
                disabled={createGuestBusy}
                onClick={() => void submitCreateGuest(true)}
              >
                {createGuestBusy ? "Đang tạo…" : "Khách lẻ · không tài khoản"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {scanOpen ? (
        <div
          style={styles.modalBackdrop}
          onClick={() => !scanBusy && setScanOpen(false)}
        >
          <div
            style={{ ...styles.modal, maxWidth: 480 }}
            onClick={(e) => e.stopPropagation()}
          >
              <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                gap: 12,
                marginBottom: 12,
              }}
            >
              <div>
                <h2 style={{ margin: 0, fontSize: 20 }}>Quét QR khách</h2>
                <p style={{ ...styles.mute, marginTop: 4 }}>
                  Đưa mã QR trên điện thoại khách vào khung xanh.
                </p>
              </div>
              <button
                type="button"
                style={styles.closeBtn}
                disabled={scanBusy}
                onClick={() => setScanOpen(false)}
              >
                Đóng
              </button>
            </div>
            {scanBusy ? (
              <p style={{ color: "#0f766e", fontWeight: 700 }}>
                Đang nhận diện…
              </p>
            ) : (
              <DeskQrScanner
                key={scanSession}
                onCode={onDeskScanCode}
                onClose={() => setScanOpen(false)}
              />
            )}
            {scanError ? (
              <p style={{ ...styles.err, marginTop: 10 }}>{scanError}</p>
            ) : null}
            <div style={{ marginTop: 14, display: "grid", gap: 8 }}>
              <label style={{ fontSize: 13, fontWeight: 700, color: "#475569" }}>
                Hoặc dán mã / link QR
              </label>
              <input
                style={styles.input}
                value={manualToken}
                onChange={(e) => setManualToken(e.target.value)}
                placeholder="oa_… / sc_… / vr_… hoặc link /c/ /q/ /v/"
                disabled={scanBusy}
              />
              <button
                type="button"
                style={{
                  ...styles.btn,
                  opacity: manualToken.trim() && !scanBusy ? 1 : 0.45,
                }}
                disabled={!manualToken.trim() || scanBusy}
                onClick={() => void resolveGuestQr(manualToken)}
              >
                Mở khách
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {zone === "PICKLEBALL" ? (
        <DeskCourtSchedule zone={zone} onChanged={() => void load()} />
      ) : null}

      {/* Modal sơ đồ bàn — Spa không dùng giường */}
      {resourceMapOpen &&
      zone &&
      zone !== "SAUNA" &&
      zone !== "SPA" &&
      zoneHasResources(zone) &&
      zone !== "PICKLEBALL" ? (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 90,
            background: "rgba(15,23,42,.5)",
            display: "flex",
            flexDirection: "column",
            padding: "16px 12px",
            boxSizing: "border-box",
          }}
          onClick={() => setResourceMapOpen(false)}
        >
          <div
            style={{
              flex: 1,
              background: "#f1f5f9",
              borderRadius: 16,
              overflow: "auto",
              maxWidth: 1200,
              width: "100%",
              margin: "0 auto",
              boxShadow: "0 24px 60px rgba(15,23,42,.35)",
              padding: "12px 12px 24px",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 12,
                marginBottom: 8,
                padding: "4px 4px 8px",
              }}
            >
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>
                Sơ đồ bàn
              </h2>
              <button
                type="button"
                style={styles.closeBtn}
                onClick={() => setResourceMapOpen(false)}
              >
                Đóng
              </button>
            </div>
            <DeskResourceGrid
              zone={zone}
              zoneName={zoneName}
              onChanged={() => void load()}
            />
          </div>
        </div>
      ) : null}

      <div style={styles.sheet}>
        <div style={styles.sheetBar}>
          <h2 style={styles.sheetTitle}>Đơn khách gửi</h2>
          <span style={styles.sheetCount}>
            {pendingApprovalCount} chờ duyệt · {visibleTickets.length} dòng
            {zone === "LONG_NUONG" && SHOW_LONG_NUONG_TABLE_MAP
              ? " · mở «Sơ đồ bàn» trên header khi cần"
              : ""}
          </span>
        </div>
        <div style={styles.tableWrap}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Họ tên</th>
              <th style={styles.th}>Nhân viên đứng ca</th>
              <th style={styles.th}>SĐT</th>
              <th style={styles.th}>ID</th>
              <th style={styles.th}>Tạo / Quét</th>
              <th style={styles.th}>Loại</th>
              <th style={styles.th}>Hoá đơn</th>
              <th style={styles.th}>
                {isMiaOlympic ? "Voucher / Điểm" : "Voucher"}
              </th>
              {hasCatalog ? <th style={styles.th}>Order</th> : null}
              <th style={styles.th}>Duyệt</th>
              {isMiaOi ? null : <th style={styles.th}>Đã check in</th>}
            </tr>
          </thead>
          <tbody>
            {visibleTickets.length === 0 ? (
              <tr>
                <td
                  colSpan={(hasCatalog ? 11 : 10) - (isMiaOi ? 1 : 0)}
                  style={{ ...styles.td, color: "#64748b", padding: 28 }}
                >
                  {viewDate
                    ? `Không có khách vào / yêu cầu tại ${zoneName} ngày ${viewDate.split("-").reverse().join("/")}.`
                    : (orderSorts.includes("staff") && staffQuery.trim()) ||
                        (orderSorts.includes("name") && nameQuery.trim())
                      ? "Không có đơn khớp từ khóa."
                      : packageFilter
                        ? "Không có đơn cho gói này."
                        : orderFilter !== "all"
                        ? "Không có đơn cho bộ lọc này."
                        : `Chưa có khách gửi yêu cầu / quét QR ${zoneName} trong 12 giờ.`}
                </td>
              </tr>
            ) : (
              visibleTickets.map((t) => {
                const a = t.arrival;
                const needApprove = t.needsApproval;
                const cartTok = t.cart?.token || "";
                const partialProof = proofPartial(
                  t.cart?.status,
                  t.cart?.hasBillPhoto
                );
                const ci = t.checkInUi;
                const settled = orderSettled(t);
                const shown = segmentAtTime({
                  segment: a.segment,
                  segmentLabel: a.segmentLabel,
                  vipStartedAt: a.vipStartedAt,
                  at: ticketMoment(t),
                });
                return (
                  <tr
                    key={t.key}
                    style={{
                      background: needApprove
                        ? "#fff7ed"
                        : ci === "yes"
                          ? "#f0fdf4"
                          : ci === "deleted" || ci === "rejected"
                            ? "#f8fafc"
                            : ci === "noshow"
                              ? "#fef2f2"
                              : "transparent",
                      cursor: "pointer",
                    }}
                    onClick={() => openCustomer(a, t.cart, t.key)}
                  >
                    <td style={{ ...styles.td, fontWeight: 700, whiteSpace: "nowrap" }}>
                      {a.fullName || "—"}
                    </td>
                    <td style={{ ...styles.td, whiteSpace: "nowrap", fontWeight: 700 }}>
                      {ticketStaffName(t) || "—"}
                    </td>
                    <td style={{ ...styles.td, whiteSpace: "nowrap" }}>
                      {a.phone || "—"}
                    </td>
                    <td style={{ ...styles.td, fontWeight: 800 }}>
                      {a.shortId || "—"}
                    </td>
                    <td
                      style={{
                        ...styles.td,
                        fontFamily: "ui-monospace, monospace",
                      }}
                    >
                      {t.scanAt ? formatTime(t.scanAt) : "—"}
                    </td>
                    <td style={{ ...styles.td, whiteSpace: "nowrap" }}>
                      <span
                        style={{
                          ...styles.pill,
                          ...segmentMarkStyle(shown.segment),
                        }}
                      >
                        {shown.segmentLabel}
                      </span>
                    </td>
                    <td
                      style={{
                        ...styles.td,
                        maxWidth: 420,
                        fontSize: 12,
                        color: "#334155",
                        whiteSpace: "normal",
                        lineHeight: 1.4,
                      }}
                    >
                      {t.cart?.token &&
                      zoneRequiresBillPhoto(t.cart.zoneCode || zone)
                        ? renderBillCapture(
                            t.cart.token,
                            !!t.cart.hasBillPhoto,
                            partialProof,
                            billEvidenceFrozen(t.cart),
                            t.cart.status
                          )
                        : null}
                      {t.billTotal != null && t.billTotal > 0 ? (
                        <div
                          style={{
                            marginTop: 6,
                            fontWeight: 800,
                            fontSize: 13,
                            color: "#0f172a",
                          }}
                        >
                          {formatVnd(t.billTotal)}
                        </div>
                      ) : null}
                      {t.billItems.length > 0 ? (
                        <ul
                          style={{
                            margin: "4px 0 0",
                            paddingLeft: 16,
                            color: "#475569",
                          }}
                        >
                          {t.billItems.slice(0, 6).map((i, idx) => (
                            <li key={`${t.key}-bi-${idx}`}>
                              {i.qty}× {i.nameVi}
                              {typeof i.lineVnd === "number"
                                ? ` · ${formatVnd(i.lineVnd)}`
                                : i.priceVnd != null
                                  ? ` · ${formatVnd(i.priceVnd * i.qty)}`
                                  : ""}
                              {i.pointsLabel ? ` · ${i.pointsLabel}` : ""}
                            </li>
                          ))}
                          {t.billItems.length > 6 ? (
                            <li>… +{t.billItems.length - 6} mục</li>
                          ) : null}
                        </ul>
                      ) : (
                        <div style={{ color: "#64748b" }}>
                          {withManualDiscount(
                            t.billText,
                            t.manualDiscountVnd,
                            t.manualDiscountNote
                          )}
                        </div>
                      )}
                      {t.scanAt ? (
                        <div
                          style={{
                            marginTop: 4,
                            fontSize: 11,
                            color: "#94a3b8",
                          }}
                        >
                          {formatTime(t.scanAt)}
                          {t.cart?.token
                            ? ` · …${t.cart.token.slice(-6).toUpperCase()}`
                            : ""}
                        </div>
                      ) : null}
                    </td>
                    <td style={styles.td}>
                      {t.pointsEarned > 0 ||
                      t.hasVoucher ||
                      t.hasPointsRedeem ? (
                        <div style={{ display: "grid", gap: 4 }}>
                          {t.pointsEarned > 0 ? (
                            <span
                              style={{
                                fontSize: 12,
                                fontWeight: 800,
                                color: "#0f766e",
                              }}
                              title="Điểm cộng từ đơn này (10.000đ sau giảm = 1 điểm)"
                            >
                              +{t.pointsEarned} điểm
                            </span>
                          ) : null}
                          {t.hasVoucher || t.hasPointsRedeem ? (
                            <span
                              style={{
                                ...styles.badge,
                                background: t.hasPointsRedeem
                                  ? "#fef3c7"
                                  : "#ecfdf5",
                                color: t.hasPointsRedeem
                                  ? "#b45309"
                                  : "#047857",
                                whiteSpace: "normal",
                                maxWidth: 140,
                              }}
                            >
                              {t.promoLabel && t.promoLabel !== "—"
                                ? t.promoLabel
                                : t.hasPointsRedeem
                                  ? "Đổi điểm"
                                  : "Voucher"}
                            </span>
                          ) : null}
                        </div>
                      ) : (
                        <span style={{ color: "#94a3b8", fontSize: 12 }}>—</span>
                      )}
                    </td>
                    {hasCatalog ? (
                      <td style={{ ...styles.td, whiteSpace: "nowrap" }}>
                        <span
                          title={
                            settled
                              ? "Khách thấy giao dịch đã hoàn thành."
                              : undefined
                          }
                          style={{
                            ...styles.pill,
                            background: settled ? "#d1fae5" : "#ffedd5",
                            color: settled ? "#047857" : "#c2410c",
                          }}
                        >
                          {t.orderLabel}
                        </span>
                      </td>
                    ) : null}
                    <td
                      style={{ ...styles.td, whiteSpace: "nowrap" }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {needApprove && cartTok ? (
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          <button
                            type="button"
                            style={{
                              ...styles.btn,
                              height: 34,
                              padding: "0 10px",
                              fontSize: 12,
                              background: "#16a34a",
                            }}
                            disabled={approvingToken === cartTok}
                            onClick={(e) => void approveCart(cartTok, e)}
                          >
                            {approvingToken === cartTok
                              ? "…"
                              : isLongNuong
                                ? "Đã gọi"
                                : "Duyệt thành công"}
                          </button>
                          <button
                            type="button"
                            style={{
                              ...styles.btn,
                              height: 34,
                              padding: "0 10px",
                              fontSize: 12,
                              background: "#fff",
                              color: "#b91c1c",
                              border: "1px solid #fecaca",
                            }}
                            disabled={approvingToken === cartTok}
                            onClick={(e) => {
                              e.stopPropagation();
                              setRejectReason("");
                              setRejectTarget({
                                token: cartTok,
                                name: a.fullName || "Khách",
                              });
                            }}
                          >
                            Không
                          </button>
                        </div>
                      ) : t.cart?.status === "REJECTED" ? (
                        <span
                          title={t.cart.adminNote || ""}
                          style={{
                            ...styles.pill,
                            background: "#fee2e2",
                            color: "#b91c1c",
                          }}
                        >
                          Từ chối
                        </span>
                      ) : t.cart?.status === "CANCELLED" ? (
                        <span
                          style={{
                            ...styles.pill,
                            background: (t.cart.adminNote || "").includes("huỷ")
                              ? "#fee2e2"
                              : "#f1f5f9",
                            color: (t.cart.adminNote || "").includes("huỷ")
                              ? "#b91c1c"
                              : "#64748b",
                          }}
                        >
                          {(t.cart.adminNote || "").includes("huỷ")
                            ? "Đã huỷ"
                            : "Khách xoá"}
                        </span>
                      ) : t.cart ? (
                        <span
                          title="Khách thấy thanh toán thành công. Chứng từ thiếu vẫn là hoàn thành 1 phần ở cột hoá đơn."
                          style={{
                            ...styles.pill,
                            background: "#d1fae5",
                            color: "#047857",
                          }}
                        >
                          Đã duyệt
                        </span>
                      ) : (
                        <span style={{ color: "#94a3b8" }}>—</span>
                      )}
                    </td>
                    {isMiaOi ? null : (
                    <td style={styles.td} onClick={(e) => e.stopPropagation()}>
                      {(isLongNuong || isSpa) &&
                      t.cart?.status === "USED" &&
                      cartTok ? (
                        longNuongVisitDone(t.cart.adminNote) ? (
                          <span
                            style={{
                              ...styles.badge,
                              background: "#d1fae5",
                              color: "#047857",
                            }}
                          >
                            Đã dùng
                          </span>
                        ) : (
                          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "nowrap" }}>
                            <span
                              style={{
                                flex: "0 0 auto",
                                fontSize: 13,
                                fontWeight: 800,
                                color: "#c2410c",
                                whiteSpace: "nowrap",
                              }}
                            >
                              Đang dùng
                            </span>
                            <button
                              type="button"
                              title="Kết thúc lượt"
                              style={{
                                ...styles.btn,
                                flex: "0 0 auto",
                                height: 32,
                                padding: "0 10px",
                                fontSize: 12,
                                background: "#0f766e",
                                whiteSpace: "nowrap",
                                opacity: approvingToken === cartTok ? 0.45 : 1,
                              }}
                              disabled={approvingToken === cartTok}
                              onClick={(e) => void finishLongNuong(cartTok, e)}
                            >
                              {approvingToken === cartTok ? "…" : "Đã dùng"}
                            </button>
                          </div>
                        )
                      ) : (
                        <span
                          style={{
                            ...styles.badge,
                            background:
                              ci === "yes"
                                ? "#d1fae5"
                                : ci === "noshow" || ci === "rejected"
                                  ? "#fee2e2"
                                  : ci === "deleted" || ci === "expired"
                                    ? "#f1f5f9"
                                    : "#ffedd5",
                            color:
                              ci === "yes"
                                ? "#047857"
                                : ci === "noshow" || ci === "rejected"
                                  ? "#b91c1c"
                                  : ci === "deleted" || ci === "expired"
                                    ? "#64748b"
                                    : "#c2410c",
                          }}
                        >
                          {checkInLabel(ci)}
                        </span>
                      )}
                    </td>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
        </div>
      </div>

      {selected ? (
        <>
        <div
          style={styles.modalBackdrop}
          onClick={() => {
            setSelected(null);
            setSelectedTicketKey(null);
            setVoucherPickerOpen(false);
          }}
        >
          <div
            style={{
              ...styles.modal,
              width: "min(860px, 100%)",
              position: "relative",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {voucherPickerOpen ? (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  zIndex: 8,
                  background: "rgba(15,23,42,.4)",
                  display: "grid",
                  placeItems: "center",
                  padding: 16,
                  borderRadius: 20,
                }}
                onClick={() => setVoucherPickerOpen(false)}
              >
                <div
                  style={{
                    width: "min(380px, 100%)",
                    maxHeight: "80%",
                    overflow: "auto",
                    background: "#fff",
                    borderRadius: 16,
                    padding: 18,
                    boxShadow: "0 16px 40px rgba(15,23,42,.2)",
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: 12,
                      marginBottom: 12,
                    }}
                  >
                    <h2 style={{ margin: 0, fontSize: 20 }}>Dùng voucher</h2>
                    <button
                      type="button"
                      style={styles.closeBtn}
                      onClick={() => setVoucherPickerOpen(false)}
                    >
                      Đóng
                    </button>
                  </div>
                  <p style={{ ...styles.mute, margin: "0 0 12px" }}>
                    Chọn voucher khách muốn dùng cho đơn này.
                  </p>
                  <button
                    type="button"
                    style={{
                      ...styles.menuRow,
                      width: "100%",
                      textAlign: "left",
                      cursor: "pointer",
                      marginBottom: 8,
                      background: !deskVoucherOfferId ? "#f5f3ff" : "#fff",
                    }}
                    onClick={() => {
                      setDeskVoucherOfferId("");
                      setVoucherPickerOpen(false);
                    }}
                  >
                    <span style={{ fontWeight: 800, fontSize: 14 }}>
                      Không dùng
                    </span>
                  </button>
                  {deskWallet.length === 0 ? (
                    <p style={{ ...styles.mute, margin: 0 }}>
                      Khách chưa có voucher dùng tại khu này.
                    </p>
                  ) : (
                    deskWallet.map((v) => (
                      <button
                        key={v.offerId}
                        type="button"
                        style={{
                          ...styles.menuRow,
                          width: "100%",
                          textAlign: "left",
                          cursor: "pointer",
                          marginBottom: 8,
                          background:
                            deskVoucherOfferId === v.offerId
                              ? "#f5f3ff"
                              : "#fff",
                        }}
                        onClick={() => {
                          setDeskVoucherOfferId(v.offerId);
                          setVoucherPickerOpen(false);
                        }}
                      >
                        <span>
                          <span
                            style={{
                              display: "block",
                              fontWeight: 800,
                              fontSize: 14,
                            }}
                          >
                            {v.title}
                          </span>
                          <span
                            style={{
                              display: "block",
                              fontSize: 12,
                              color: "#64748b",
                              marginTop: 2,
                            }}
                          >
                            {v.subtitle}
                          </span>
                        </span>
                      </button>
                    ))
                  )}
                </div>
              </div>
            ) : null}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 12,
              }}
            >
              <div>
                <h2 style={{ margin: 0, fontSize: 22 }}>
                  {selected.fullName || "Khách"}
                </h2>
                <p style={styles.mute}>
                  SĐT <strong>{selected.phone || "—"}</strong> · ID{" "}
                  <strong>{selected.shortId || "—"}</strong> ·{" "}
                  <span
                    style={{
                      ...styles.pill,
                      ...segmentMarkStyle(selected.segment),
                    }}
                  >
                    {selected.segmentLabel}
                  </span>
                  {isMiaOlympic && typeof selected.pointsBalance === "number"
                    ? ` · ${selected.pointsBalance} điểm`
                    : ""}
                </p>
                {selected.packageLabel ? (
                  <p style={{ ...styles.mute, marginTop: 4 }}>
                    Gói{" "}
                    <strong>
                      {selected.packageLabel.replace(/^\s*gói\s+/i, "")}
                    </strong>
                    {selected.packageExpiresAt
                      ? ` · đến ${new Date(
                          selected.packageExpiresAt
                        ).toLocaleDateString("vi-VN")}`
                      : ""}
                  </p>
                ) : null}
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <button
                  type="button"
                  style={styles.closeBtn}
                  onClick={() => {
                    setSelected(null);
                    setSelectedTicketKey(null);
                  }}
                >
                  Đóng
                </button>
              </div>
            </div>

            {guestCart ? (
              <div
                style={{
                  marginTop: 14,
                  padding: 12,
                  borderRadius: 14,
                  background:
                    guestCart.status === "PENDING_APPROVAL"
                      ? "#fff7ed"
                      : "#ecfdf5",
                  border:
                    guestCart.status === "PENDING_APPROVAL"
                      ? "1px solid #fdba74"
                      : "1px solid #a7f3d0",
                }}
              >
                <p
                  style={{
                    margin: 0,
                    fontWeight: 800,
                    color:
                      guestCart.status === "PENDING_APPROVAL"
                        ? "#c2410c"
                        : "#047857",
                  }}
                >
                  {guestCart.status === "PENDING_APPROVAL"
                    ? "Đơn chờ xác nhận"
                    : spaCartEditable()
                      ? "Đơn đã nhận"
                      : guestConfirmedBill
                        ? "Đơn đã xác thực"
                        : "Đơn đã nhận"}
                  {guestCart.zoneName ? ` · ${guestCart.zoneName}` : ""}
                </p>
                {spaCartEditable() ? (
                  <p style={{ margin: "6px 0 0", fontSize: 12, color: "#334155" }}>
                    Cập nhật đơn lưu thay đổi, kể cả khi khách đang dùng. Duyệt thành công
                    để khách thấy thanh toán xong. Bổ sung chứng từ trong ca. Đã dùng khi khách xong.
                  </p>
                ) : null}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    marginTop: 8,
                  }}
                >
                <ul
                  style={{
                    margin: 0,
                    padding: "0 0 0 18px",
                    fontSize: 13,
                    color: "#334155",
                    flex: "1 1 auto",
                    minWidth: 0,
                  }}
                >
                  {(spaDraftRows() ||
                    (guestConfirmedBill
                      ? foldPointsOntoItems(
                          (guestConfirmedBill.ticketItems || []).map((it) => ({
                            id: it.itemId,
                            nameVi: it.nameVi,
                            qty: it.qty,
                            unitPriceVnd: it.unitPriceVnd,
                            pointsDiscountVnd: it.pointsDiscountVnd,
                            pointsRedeemTier: it.pointsRedeemTier,
                          }))
                        )
                      : openCartBillRows())
                  ).map((it) => (
                    <li key={it.key}>
                      {it.qty}× {it.nameVi} · {formatVnd(it.netVnd)}
                      {isMiaOlympic && it.pointsLabel ? ` · ${it.pointsLabel}` : ""}
                    </li>
                  ))}
                  {!guestConfirmedBill
                    ? guestCart.items
                        .filter((it) => it.id.startsWith("voucher-"))
                        .map((it) => (
                          <li key={it.id}>
                            {it.qty}× {it.nameVi}
                          </li>
                        ))
                    : null}
                </ul>
                {(isLongNuong || isSpa) &&
                guestCart.status === "USED" &&
                guestCart.token &&
                !longNuongVisitDone(guestCart.adminNote) ? (
                  <>
                    <span
                      style={{
                        flex: "0 0 auto",
                        fontSize: 13,
                        fontWeight: 800,
                        color: "#c2410c",
                        whiteSpace: "nowrap",
                      }}
                    >
                      Đang dùng
                    </span>
                    <button
                      type="button"
                      style={{
                        ...styles.btn,
                        flex: "0 0 auto",
                        height: 32,
                        padding: "0 10px",
                        fontSize: 12,
                        background: "#0f766e",
                        whiteSpace: "nowrap",
                        opacity: approvingToken === guestCart.token ? 0.45 : 1,
                      }}
                      title="Kết thúc lượt"
                      disabled={approvingToken === guestCart.token}
                      onClick={() => void finishLongNuong(guestCart.token)}
                    >
                      {approvingToken === guestCart.token ? "…" : "Đã dùng"}
                    </button>
                  </>
                ) : (isLongNuong || isSpa) &&
                  guestCart.status === "USED" &&
                  longNuongVisitDone(guestCart.adminNote) ? (
                  <span
                    style={{
                      flex: "0 0 auto",
                      fontSize: 13,
                      fontWeight: 800,
                      color: "#047857",
                      whiteSpace: "nowrap",
                    }}
                  >
                    Đã dùng
                  </span>
                ) : null}
                </div>
                {zoneRequiresBillPhoto(guestCart.zoneCode || zone) ? (
                  <div style={{ marginTop: 8 }}>
                    {renderBillCapture(
                      guestCart.token,
                      !!guestCart.hasBillPhoto,
                      proofPartial(guestCart.status, guestCart.hasBillPhoto),
                      billEvidenceFrozen(guestCart),
                      guestCart.status
                    )}
                  </div>
                ) : null}
                {zone === "LONG_NUONG" || zone === "PICKLEBALL" ? (
                  <DeskBookingEdit
                    zone={zone}
                    token={guestCart.token}
                    onSaved={() => void load()}
                  />
                ) : null}
                {(() => {
                  const draft = spaDraftRows();
                  const preview =
                    !draft &&
                    !guestConfirmedBill &&
                    ((isMiaOi && miaCartOpen()) || (isPool && poolCartOpen()))
                      ? deskRedeemPreview()
                      : null;
                  const base = draft
                    ? cartTotal
                    : guestConfirmedBill
                      ? guestConfirmedBill.totalVnd || 0
                      : guestCart.totalVnd;
                  const afterDeskPoints = Math.max(
                    0,
                    base - (preview?.mainOff || 0)
                  );
                  const cartAlreadyMember = (guestCart.items || []).some((i) =>
                    String(i.id || "").startsWith(MIA_MEMBERSHIP_DISC_PREFIX)
                  );
                  const memberPct = deskMiaMembershipPercent();
                  const memberOff =
                    isMiaOi &&
                    !guestConfirmedBill &&
                    !draft &&
                    !cartAlreadyMember &&
                    memberPct > 0
                      ? miaOiMembershipDiscountVnd(afterDeskPoints, memberPct)
                      : 0;
                  const payable = Math.max(0, afterDeskPoints - memberOff);
                  if (
                    base <= 0 &&
                    !(preview && preview.mainOff > 0) &&
                    memberOff <= 0
                  ) {
                    return null;
                  }
                  const memberLabel =
                    memberPct > 0 && (memberOff > 0 || cartAlreadyMember)
                      ? ` · hội viên −${memberPct}%`
                      : "";
                  return (
                    <p
                      style={{
                        margin: "10px 0 0",
                        fontWeight: 800,
                        fontSize: 14,
                      }}
                    >
                      Tổng {formatVnd(payable)}
                      {preview && preview.mainUnits > 0
                        ? ` · đổi ${preview.mainUnits * (isPool ? DESK_REDEEM_SWIM_STEP : DESK_REDEEM_DRINK_STEP)} điểm`
                        : ""}
                      {memberLabel}
                    </p>
                  );
                })()}
                {guestCart.status === "PENDING_APPROVAL" && guestCart.token ? (
                  <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                      <button
                        type="button"
                        style={{
                          ...styles.btn,
                          height: 40,
                          padding: "0 14px",
                          background: "#16a34a",
                        }}
                        disabled={approvingToken === guestCart.token}
                        onClick={() => void approveCart(guestCart.token)}
                      >
                        {approvingToken === guestCart.token
                          ? "…"
                          : isLongNuong
                            ? "Đã gọi"
                            : "Duyệt thành công"}
                      </button>
                      <button
                        type="button"
                        style={{
                          ...styles.btn,
                          height: 40,
                          padding: "0 14px",
                          background: "#fff",
                          color: "#b91c1c",
                          border: "1px solid #fecaca",
                        }}
                        disabled={approvingToken === guestCart.token}
                        onClick={() => {
                          setRejectReason("");
                          setRejectTarget({
                            token: guestCart.token,
                            name: selected?.fullName || "Khách",
                          });
                        }}
                      >
                        Không
                      </button>
                    </div>
                ) : null}
              </div>
            ) : null}

            {miaOrderLocked() || (isSpa && guestCart && !spaCartEditable()) ? null : hasCatalog ? (
              <>
                {isMiaOlympic ? (
                  <div
                    style={{
                      marginTop: 18,
                      marginBottom: 14,
                      padding: 14,
                      borderRadius: 16,
                      border: "1px solid #bae6fd",
                      background: "#f0f9ff",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 8,
                        margin: "0 0 8px",
                      }}
                    >
                      <p
                        style={{
                          margin: 0,
                          fontWeight: 800,
                          color: "#0c4a6e",
                          fontSize: 15,
                        }}
                      >
                        1 · {poolService === "vip" ? "Hồ VIP" : "Hồ Olympic"} — Vé / gói
                      </p>
                      {poolServiceButtons()}
                    </div>
                    <p
                      style={{
                        margin: "0 0 8px",
                        fontSize: 12,
                        color: "#0c4a6e",
                        lineHeight: 1.45,
                        fontWeight: 600,
                      }}
                    >
                      {poolService === "vip"
                        ? "Vé lẻ VIP không giới hạn thời gian. Giá gói tháng là tổng phí cả kỳ."
                        : "Gói tháng cùng ngày vé bơi → −10% gói. Không giảm: vé bơi lẻ."}
                    </p>
                    {focusedPoolScanId ? (
                      <p style={{ margin: "0 0 8px", fontSize: 12, color: "#0369a1" }}>
                        Đang gắn vé vào lần quét{" "}
                        {formatTime(
                          focusedPoolScan()?.at || focusedTicket?.scanAt || ""
                        )}.
                      </p>
                    ) : null}
                    <div
                      style={{
                        display: "grid",
                        gap: 8,
                        maxHeight: 220,
                        overflow: "auto",
                      }}
                    >
                      {POOL_CATEGORIES.filter((cat) => cat.id !== "phu-kien").map((cat) => {
                        const items = poolItemsForService(poolService, cat.id);
                        if (!items.length) return null;
                        const appPackage = activeAppPackageLabel();
                        const membershipHeld =
                          cat.id === "goi-thang" &&
                          poolService === "olympic" &&
                          !!appPackage;
                        const scanId = BOARD_POOL_KEY;
                        const bonusCap = swimBonusCap();
                        return (
                          <div key={cat.id} style={{ display: "grid", gap: 6 }}>
                            <p
                              style={{
                                margin: 0,
                                fontSize: 11,
                                fontWeight: 800,
                                color: "#0c4a6e",
                                textTransform: "uppercase",
                                letterSpacing: "0.04em",
                              }}
                            >
                              {cat.nameVi}
                            </p>
                            {cat.id === "tu-chon" ? (
                              <p
                                style={{
                                  margin: 0,
                                  fontSize: 12,
                                  color: bonusCap > 0 ? "#0c4a6e" : "#9a3412",
                                  fontWeight: 700,
                                }}
                              >
                                {swimBonusHint(bonusCap)}
                              </p>
                            ) : null}
                            {membershipHeld ? (
                              <p
                                style={{
                                  margin: 0,
                                  fontSize: 12,
                                  color: "#9a3412",
                                  fontWeight: 700,
                                }}
                              >
                                Đang dùng gói {appPackage}. Hết hạn mới chọn gói Olympic mới. Vé và gói VIP vẫn thêm được.
                              </p>
                            ) : null}
                            {items.map((item) => {
                              const q = scanId ? scanQty(scanId, item.id) : 0;
                              const bonusHeld =
                                item.id === POOL_SWIM_BONUS_ID && q >= bonusCap;
                              return (
                                <div
                                  key={item.id}
                                  style={{
                                    ...styles.menuRow,
                                    opacity:
                                      membershipHeld ||
                                      (item.id === POOL_SWIM_BONUS_ID && bonusCap <= 0)
                                        ? 0.5
                                        : 1,
                                  }}
                                >
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontWeight: 700 }}>
                                      {item.nameVi}
                                    </div>
                                    <div
                                      style={{ fontSize: 12, color: "#64748b" }}
                                    >
                                      {poolMenuPriceLine(
                                        item,
                                        scanId,
                                        membershipHeld,
                                        false
                                      )}
                                    </div>
                                  </div>
                                  <div
                                    style={{
                                      display: "flex",
                                      alignItems: "center",
                                      gap: 8,
                                    }}
                                  >
                                    <button
                                      type="button"
                                      style={styles.qtyBtn}
                                      disabled={q <= 0 || membershipHeld}
                                      onClick={() =>
                                        setScanQty(scanId, item.id, q - 1)
                                      }
                                    >
                                      −
                                    </button>
                                    <span
                                      style={{
                                        width: 22,
                                        textAlign: "center",
                                        fontWeight: 800,
                                      }}
                                    >
                                      {q}
                                    </span>
                                    <button
                                      type="button"
                                      style={styles.qtyBtn}
                                      disabled={membershipHeld || bonusHeld}
                                      onClick={() =>
                                        setScanQty(scanId, item.id, q + 1)
                                      }
                                    >
                                      +
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
                {isMiaOlympic ? (
                  <div
                    style={{
                      marginTop: 0,
                      marginBottom: 14,
                      padding: 14,
                      borderRadius: 16,
                      border: "1px solid #e7e5e4",
                      background: "#fff",
                    }}
                  >
                    <p
                      style={{
                        margin: "0 0 6px",
                        fontWeight: 800,
                        color: "#1c1917",
                        fontSize: 15,
                      }}
                    >
                      2 · Phụ kiện
                    </p>
                    <p
                      style={{
                        margin: "0 0 8px",
                        fontSize: 12,
                        color: "#57534e",
                        lineHeight: 1.45,
                        fontWeight: 600,
                      }}
                    >
                      Cùng giá cho Olympic và VIP. Mua từ 02 món → −10% phần phụ kiện.
                      Vé và gói không giảm.
                    </p>
                    {accessoryDiscountNote()}
                    <div
                      style={{
                        display: "grid",
                        gap: 8,
                        maxHeight: 220,
                        overflow: "auto",
                      }}
                    >
                      {poolItemsForService(poolService, "phu-kien").map((item) => {
                        const q = scanQty(BOARD_POOL_KEY, item.id);
                        return (
                          <div key={item.id} style={styles.menuRow}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontWeight: 700 }}>{item.nameVi}</div>
                              <div style={{ fontSize: 12, color: "#64748b" }}>
                                {formatPoolPrice(item)}
                              </div>
                            </div>
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 8,
                              }}
                            >
                              <button
                                type="button"
                                style={styles.qtyBtn}
                                disabled={q <= 0}
                                onClick={() =>
                                  setScanQty(BOARD_POOL_KEY, item.id, q - 1)
                                }
                              >
                                −
                              </button>
                              <span
                                style={{
                                  width: 22,
                                  textAlign: "center",
                                  fontWeight: 800,
                                }}
                              >
                                {q}
                              </span>
                              <button
                                type="button"
                                style={styles.qtyBtn}
                                onClick={() =>
                                  setScanQty(BOARD_POOL_KEY, item.id, q + 1)
                                }
                              >
                                +
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
                <p style={{ marginTop: isMiaOlympic ? 8 : 18, marginBottom: 8, fontWeight: 800 }}>
                  {isMiaOlympic
                    ? "3 · Mía Ơi — Đồ uống"
                    : isMiaOi && miaCartOpen()
                      ? "Gọi thêm — tuỳ chọn"
                      : spaCartEditable()
                        ? "Sửa đơn gốc"
                        : catalogTitle()}
                </p>
                {isMiaOi && miaCartOpen() ? (
                  <p style={{ margin: "0 0 8px", fontSize: 12, color: "#334155" }}>
                    Khách không gọi thêm thì bấm xác nhận giỏ. Menu chỉ dùng khi
                    muốn gọi thêm.
                  </p>
                ) : null}
                <div
                  style={{
                    display: "flex",
                    gap: 6,
                    flexWrap: "wrap",
                    marginBottom: 10,
                  }}
                >
                  {catalogCategories.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setCategory(c.id)}
                      style={{
                        ...styles.chip,
                        background:
                          category === c.id ? accentColor() : "#f1f5f9",
                        color: category === c.id ? "#fff" : "#334155",
                      }}
                    >
                      {c.nameVi}
                    </button>
                  ))}
                </div>
                <div
                  style={{
                    display: "grid",
                    gap: 8,
                    maxHeight: 280,
                    overflow: "auto",
                  }}
                >
                  {categoryItems.map((item) => {
                    const variants: { useAlt: boolean; label: string }[] =
                      item.priceAltVnd
                        ? [
                            {
                              useAlt: false,
                              label: `${Math.round(item.priceVnd / 1000)}K`,
                            },
                            {
                              useAlt: true,
                              label: `${Math.round(item.priceAltVnd / 1000)}K`,
                            },
                          ]
                        : [{ useAlt: false, label: priceLabel(item, false) }];

                    return variants.map(({ useAlt, label }) => {
                      const q = qtyOf(item, useAlt);
                      const rowKey = lineKey(item.id, useAlt);
                      const bonusCap =
                        item.id === SPA_GOI_BONUS_ID ? swimBonusCap() : null;
                      return (
                        <div key={rowKey} style={{ display: "grid", gap: 6 }}>
                          {bonusCap != null ? (
                            <p
                              style={{
                                margin: 0,
                                fontSize: 12,
                                fontWeight: 700,
                                color: bonusCap > 0 ? "#1b3022" : "#9a3412",
                              }}
                            >
                              {swimBonusHint(bonusCap)}
                            </p>
                          ) : null}
                        <div
                          style={{
                            ...styles.menuRow,
                            opacity: bonusCap === 0 ? 0.5 : 1,
                          }}
                        >
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 700 }}>{item.nameVi}</div>
                            <div style={{ fontSize: 12, color: "#64748b" }}>
                              {label}
                              {"durationMin" in item && item.durationMin
                                ? ` · ${item.durationMin}'`
                                : ""}
                              {"note" in item && item.note
                                ? ` · ${item.note}`
                                : ""}
                            </div>
                          </div>
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 8,
                            }}
                          >
                            <button
                              type="button"
                              style={styles.qtyBtn}
                              onClick={() => setQty(item, q - 1, useAlt)}
                              disabled={q <= 0}
                            >
                              −
                            </button>
                            <span
                              style={{
                                width: 22,
                                textAlign: "center",
                                fontWeight: 800,
                              }}
                            >
                              {q}
                            </span>
                            <button
                              type="button"
                              style={{
                                ...styles.qtyBtn,
                                ...(q >= qtyCap(item)
                                  ? { opacity: 0.35, cursor: "not-allowed" }
                                  : {}),
                              }}
                              onClick={() => setQty(item, q + 1, useAlt)}
                              disabled={q >= qtyCap(item)}
                            >
                              +
                            </button>
                          </div>
                        </div>
                        </div>
                      );
                    });
                  })}
                </div>
                <div
                  style={{
                    marginTop: 12,
                    padding: 12,
                    borderRadius: 14,
                    background: cartLines.length
                      ? isSpa
                        ? "#eef5f0"
                        : "#ecfdf5"
                      : "#f8fafc",
                    display: "flex",
                    flexWrap: "wrap",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 10,
                  }}
                >
                  <div
                    style={{
                      flex: "1 1 200px",
                      minWidth: 0,
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      flexWrap: "wrap",
                    }}
                  >
                    {spaCartEditable() ? (
                      <button
                        type="button"
                        style={{
                          ...styles.btn,
                          flex: "0 0 auto",
                          background: "#fff",
                          color: "#1b3022",
                          border: "1px solid #1b3022",
                          opacity: cartLines.length && !ordering ? 1 : 0.45,
                        }}
                        disabled={!cartLines.length || ordering}
                        onClick={() => void saveOrder(false)}
                      >
                        {ordering ? "Đang lưu…" : "Cập nhật đơn"}
                      </button>
                    ) : null}
                    <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 800, lineHeight: 1.35 }}>
                      {boardSummaryLabel()}
                    </div>
                    {isMiaOlympic && boardDiscountNotes().length ? (
                      <div
                        style={{
                          marginTop: 6,
                          display: "grid",
                          gap: 2,
                        }}
                      >
                        {boardDiscountNotes().map((note) => (
                          <div
                            key={note}
                            style={{
                              fontSize: 12,
                              fontWeight: 600,
                              color: note.startsWith("✓")
                                ? "#047857"
                                : "#64748b",
                              lineHeight: 1.35,
                            }}
                          >
                            {note}
                          </div>
                        ))}
                      </div>
                    ) : null}
                    {orderMsg ? (
                      <div
                        style={{
                          fontSize: 13,
                          color: "#047857",
                          marginTop: 4,
                        }}
                      >
                        {orderMsg}
                      </div>
                    ) : null}
                    </div>
                  </div>
                  {isMiaOi && miaCartOpen() ? (
                    <div
                      style={{
                        display: "flex",
                        gap: 8,
                        flexWrap: "wrap",
                        flex: "1 1 320px",
                        alignItems: "center",
                        justifyContent: "flex-end",
                      }}
                    >
                      {renderDeskRedeemControl(ordering)}
                      {renderDeskVoucherButton(ordering)}
                      <button
                        type="button"
                        style={{
                          ...styles.btn,
                          flex: "0 0 auto",
                          background: "#0f766e",
                          whiteSpace: "nowrap",
                          opacity: ordering ? 0.45 : 1,
                        }}
                        disabled={ordering}
                        onClick={() => void confirmMiaCart("cart")}
                      >
                        {ordering ? "Đang lưu…" : "Xác nhận, không gọi thêm"}
                      </button>
                      <button
                        type="button"
                        style={{
                          ...styles.btn,
                          flex: "0 0 auto",
                          background: accentColor(),
                          whiteSpace: "nowrap",
                          opacity: cartLines.length && !ordering ? 1 : 0.45,
                        }}
                        disabled={!cartLines.length || ordering}
                        onClick={() => void confirmMiaCart("added")}
                      >
                        {ordering ? "Đang lưu…" : "Xác nhận và gọi thêm"}
                      </button>
                    </div>
                  ) : (
                    <div
                      style={{
                        display: "flex",
                        gap: 8,
                        flexWrap: "wrap",
                        alignItems: "center",
                        justifyContent: "flex-end",
                        flex: "1 1 280px",
                      }}
                    >
                      {isMiaOi ? renderDeskRedeemControl(ordering) : null}
                      {isMiaOi ? renderDeskVoucherButton(ordering) : null}
                      <button
                        type="button"
                        style={{
                          ...styles.btn,
                          flex: "0 0 auto",
                          background: accentColor(),
                          opacity:
                            (isMiaOlympic
                              ? boardCombinedQty() > 0
                              : cartLines.length > 0) &&
                            !ordering &&
                            !(
                              isMiaOlympic &&
                              deskManualDiscountRaw() > 0 &&
                              !manualDiscountNote.trim()
                            )
                              ? 1
                              : 0.45,
                        }}
                        disabled={
                          ordering ||
                          (isMiaOlympic
                            ? boardCombinedQty() <= 0
                            : !cartLines.length) ||
                          (isMiaOlympic &&
                            deskManualDiscountRaw() > 0 &&
                            !manualDiscountNote.trim())
                        }
                        onClick={() =>
                          void (spaCartEditable()
                            ? saveOrder(true)
                            : saveOrder(false))
                        }
                      >
                        {ordering
                          ? "Đang lưu…"
                          : spaCartEditable()
                            ? "Xác nhận"
                            : isMiaOlympic
                              ? boardSaveLabel()
                              : "Lưu đơn"}
                      </button>
                    </div>
                  )}
                  {renderManualDiscountRow(ordering)}
                </div>
              </>
            ) : null}

            <p style={{ marginTop: 18, marginBottom: 8, fontWeight: 800 }}>
              Lịch sử khu này hôm nay
            </p>

            {(() => {
                if (!guestTickets.length) {
                  return (
                    <p style={styles.mute}>Chưa có lần quét nào hôm nay.</p>
                  );
                }
                const focusedKey = focusedTicket?.key || guestTickets[0].key;
                return (
              <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
                {guestTickets.map((t, idx) => {
                  const s = t.scan;
                  const locked = poolTicketLocked(t);
                  const isFocus = t.key === focusedKey;
                  const totals = s
                    ? scanCartTotal(s.id)
                    : {
                        sum: 0,
                        qty: 0,
                        accessoryDiscount: 0,
                        membershipDiscount: 0,
                      };
                  const { sum, qty } = totals;
                  const busy = !!(s && verifyingScanId === s.id);
                  const cartLines = guestCartLines;
                  const billDetail =
                    withManualDiscount(
                      (t.billText && t.billText !== "—" ? t.billText : null) ||
                        s?.orderSummary ||
                        "",
                      t.manualDiscountVnd,
                      t.manualDiscountNote
                    ) || null;
                  const billTotal = t.billTotal ?? s?.totalVnd ?? null;
                  return (
                    <li
                      key={t.key}
                      style={{
                        padding: "12px 0",
                        cursor: t.key !== focusedKey ? "pointer" : "default",
                      }}
                      onClick={() => {
                        if (t.key !== focusedKey) setSelectedTicketKey(t.key);
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          gap: 10,
                          alignItems: "flex-start",
                        }}
                      >
                        <div>
                          {idx === 0 ? (
                            <>
                              <strong>
                                {zoneName || s?.serviceName || "Khu"}
                              </strong>
                              <span
                                style={{
                                  marginLeft: 8,
                                  fontSize: 12,
                                  fontWeight: 700,
                                  color: orderInk(locked || orderSettled(t)),
                                }}
                              >
                                {t.orderLabel}
                              </span>
                            </>
                          ) : null}
                          {billDetail ? (
                            <p
                              style={{
                                margin: idx === 0 ? "2px 0 0" : 0,
                                fontSize: 13,
                                color: "#334155",
                                fontWeight: idx === 0 ? 400 : 700,
                              }}
                            >
                              {billDetail}
                              {billTotal != null &&
                              !String(billDetail).includes("đ")
                                ? ` · ${formatVnd(billTotal)}`
                                : ""}
                            </p>
                          ) : idx > 0 ? (
                            <p
                              style={{
                                margin: 0,
                                fontSize: 13,
                                fontWeight: 700,
                                color: orderInk(locked || orderSettled(t)),
                              }}
                            >
                              {t.orderLabel}
                            </p>
                          ) : null}
                          {(isMiaOlympic ? poolHistoryTicket(t) : isPool) && locked ? (
                            <div
                              style={{
                                marginTop: 8,
                                display: "flex",
                                gap: 8,
                                flexWrap: "wrap",
                              }}
                            >
                              {s ? (
                                <button
                                  type="button"
                                  style={{
                                    ...styles.ghost,
                                    padding: "8px 12px",
                                    fontSize: 13,
                                    opacity: busy ? 0.5 : 1,
                                  }}
                                  disabled={busy}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    void undoPoolScan(s);
                                  }}
                                >
                                  {busy ? "…" : "Undo"}
                                </button>
                              ) : null}
                              <button
                                type="button"
                                style={{
                                  ...styles.btn,
                                  flex: "0 0 auto",
                                  padding: "8px 12px",
                                  fontSize: 13,
                                  background: "#0c4a6e",
                                }}
                                disabled={busy}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  sendPoolTicketBill(t);
                                }}
                              >
                                In bill
                              </button>
                            </div>
                          ) : null}
                          {isSpa &&
                          locked &&
                          (t.orderId ||
                            t.cart?.status === "USED" ||
                            s?.ticketVerified) ? (
                            <div style={{ marginTop: 8 }}>
                              <button
                                type="button"
                                style={{
                                  ...styles.ghost,
                                  padding: "8px 12px",
                                  fontSize: 13,
                                  opacity: verifyingScanId === t.key ? 0.5 : 1,
                                }}
                                disabled={verifyingScanId === t.key}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void undoSpaTicket(t);
                                }}
                              >
                                {verifyingScanId === t.key ? "…" : "Undo"}
                              </button>
                            </div>
                          ) : null}
                          {isMiaOi &&
                          miaHistoryOrderId(t) &&
                          selected.todayOrders.some(
                            (o) =>
                              o.id === miaHistoryOrderId(t) &&
                              o.status !== "CANCELLED" &&
                              !isFinalizedOrderStatus(o.status)
                          ) ? (
                            <div style={{ marginTop: 8 }}>
                              <button
                                type="button"
                                style={{
                                  ...styles.ghost,
                                  padding: "8px 12px",
                                  fontSize: 13,
                                }}
                                disabled={cancellingOrderId === miaHistoryOrderId(t)}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const id = miaHistoryOrderId(t);
                                  if (id) void cancelMiaOrder(id);
                                }}
                              >
                                {cancellingOrderId === miaHistoryOrderId(t)
                                  ? "…"
                                  : "Huỷ đơn"}
                              </button>
                            </div>
                          ) : null}
                        </div>
                        <span
                          style={{
                            fontFamily: "ui-monospace, monospace",
                            fontWeight: 700,
                            flexShrink: 0,
                          }}
                        >
                          {formatTime(t.scanAt || s?.at || "")}
                        </span>
                      </div>

                      {isPool && !isMiaOlympic && !locked && isFocus && s ? (
                        <div
                          style={{
                            marginTop: 10,
                            padding: 12,
                            borderRadius: 14,
                            background: "#f0f9ff",
                            border: "1px solid #bae6fd",
                          }}
                        >
                          <p
                            style={{
                              margin: "0 0 8px",
                              fontSize: 12,
                              fontWeight: 800,
                              color: "#0c4a6e",
                            }}
                          >
                            {cartLines.length
                              ? `Giỏ đã duyệt · check-in (giữ giờ vào ${formatTime(s.at)})`
                              : `Chọn vé → Xác thực (giữ giờ vào ${formatTime(s.at)})`}
                          </p>
                          {cartLines.length ? (
                            <p
                              style={{
                                margin: "0 0 8px",
                                fontSize: 12,
                                color: "#334155",
                              }}
                            >
                              Khách không mua thêm thì bấm xác thực giỏ. Bảng
                              dưới chỉ dùng khi muốn mua thêm.
                            </p>
                          ) : null}
                          {cartLines.length ? (
                            <p
                              style={{
                                margin: "0 0 8px",
                                fontSize: 12,
                                fontWeight: 800,
                                color: "#64748b",
                              }}
                            >
                              Mua thêm — tuỳ chọn
                            </p>
                          ) : null}
                          {poolServiceButtons("0 0 10px")}
                          <div style={{ display: "grid", gap: 8 }}>
                            {POOL_CATEGORIES.map((cat) => {
                              const items = poolItemsForService(
                                poolService,
                                cat.id
                              );
                              if (!items.length) return null;
                              const sameDay = poolSameDay(scanCartLines(s.id));
                              const appPackage = activeAppPackageLabel();
                              const membershipHeld =
                                cat.id === "goi-thang" &&
                                poolService === "olympic" &&
                                !!appPackage;
                              const bonusCap = swimBonusCap();
                              const membershipUntil = selected?.packageExpiresAt
                                ? new Date(selected.packageExpiresAt).toLocaleDateString(
                                    "vi-VN"
                                  )
                                : null;
                              return (
                                <div key={cat.id} style={{ display: "grid", gap: 8 }}>
                                  <p
                                    style={{
                                      margin: cat.id === "tre-em" ? "0" : "8px 0 0",
                                      fontSize: 12,
                                      fontWeight: 800,
                                      color: "#0c4a6e",
                                      textTransform: "uppercase",
                                      letterSpacing: "0.04em",
                                    }}
                                  >
                                    {cat.nameVi}
                                    {cat.id === "goi-thang" &&
                                    poolService === "olympic" &&
                                    sameDay &&
                                    !membershipHeld
                                      ? " · −10% cùng ngày với đơn Olympic"
                                      : ""}
                                  </p>
                                  {cat.id === "tu-chon" ? (
                                    <p
                                      style={{
                                        margin: 0,
                                        fontSize: 12,
                                        fontWeight: 700,
                                        color: bonusCap > 0 ? "#0c4a6e" : "#9a3412",
                                      }}
                                    >
                                      {swimBonusHint(bonusCap)}
                                    </p>
                                  ) : null}
                                  {membershipHeld ? (
                                    <p
                                      style={{
                                        margin: 0,
                                        fontSize: 12,
                                        fontWeight: 700,
                                        color: "#9a3412",
                                      }}
                                    >
                                      Đang dùng gói {appPackage}
                                      {membershipUntil ? ` đến ${membershipUntil}` : ""}. Hết hạn mới chọn gói Olympic mới. Vé và gói VIP vẫn thêm được.
                                    </p>
                                  ) : null}
                                  {items.map((item) => {
                                    const q = scanQty(s.id, item.id);
                                    const bonusHeld =
                                      item.id === POOL_SWIM_BONUS_ID && q >= bonusCap;
                                    const blocked = membershipHeld;
                                    return (
                                      <div
                                        key={item.id}
                                        style={{
                                          ...styles.menuRow,
                                          opacity:
                                            blocked ||
                                            (item.id === POOL_SWIM_BONUS_ID && bonusCap <= 0)
                                              ? 0.55
                                              : 1,
                                        }}
                                      >
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                          <div
                                            style={{
                                              fontWeight: 700,
                                              fontSize: 14,
                                            }}
                                          >
                                            {item.nameVi}
                                          </div>
                                          <div
                                            style={{
                                              fontSize: 12,
                                              color: "#64748b",
                                            }}
                                          >
                                            {poolMenuPriceLine(item, s.id, blocked, true)}
                                          </div>
                                        </div>
                                        <div
                                          style={{
                                            display: "flex",
                                            alignItems: "center",
                                            gap: 8,
                                          }}
                                        >
                                          <button
                                            type="button"
                                            style={styles.qtyBtn}
                                            onClick={() =>
                                              setScanQty(s.id, item.id, q - 1)
                                            }
                                            disabled={q <= 0 || busy || blocked}
                                          >
                                            −
                                          </button>
                                          <span
                                            style={{
                                              width: 22,
                                              textAlign: "center",
                                              fontWeight: 800,
                                            }}
                                          >
                                            {q}
                                          </span>
                                          <button
                                            type="button"
                                            style={styles.qtyBtn}
                                            onClick={() =>
                                              setScanQty(s.id, item.id, q + 1)
                                            }
                                            disabled={busy || blocked || bonusHeld}
                                          >
                                            +
                                          </button>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              );
                            })}
                          </div>
                          <div
                            style={{
                              marginTop: 10,
                              display: "flex",
                              flexDirection: "column",
                              gap: 8,
                            }}
                          >
                            <div
                              style={{
                                display: "flex",
                                flexWrap: "wrap",
                                justifyContent: "space-between",
                                alignItems: "center",
                                gap: 10,
                              }}
                            >
                              <div style={{ fontWeight: 800, fontSize: 13, flex: "1 1 200px", minWidth: 0, lineHeight: 1.35 }}>
                                {qty ? (
                                  <>
                                    Mua thêm {qty} món · {formatVnd(Math.max(0, sum - (isPool ? deskRedeemPreview().extraOff : 0)))}
                                    {isPool && deskRedeemPreview().extraUnits
                                      ? ` · −${deskRedeemPreview().extraUnits * DESK_REDEEM_SWIM_STEP} điểm`
                                      : ""}
                                    {totals.accessoryDiscount > 0 ? (
                                      <span
                                        style={{
                                          display: "block",
                                          fontWeight: 600,
                                          fontSize: 12,
                                          color: "#047857",
                                        }}
                                      >
                                        Phụ kiện −10% (−
                                        {formatVnd(totals.accessoryDiscount)})
                                      </span>
                                    ) : null}
                                    {totals.membershipDiscount > 0 ? (
                                      <span
                                        style={{
                                          display: "block",
                                          fontWeight: 600,
                                          fontSize: 12,
                                          color: "#047857",
                                        }}
                                      >
                                        Gói tháng −10% cùng ngày với đơn Olympic (−
                                        {formatVnd(totals.membershipDiscount)})
                                      </span>
                                    ) : null}
                                  </>
                                ) : cartLines.length ? (
                                  "Không mua thêm"
                                ) : (
                                  "Chưa chọn vé"
                                )}
                              </div>
                              <div
                                style={{
                                  display: "flex",
                                  gap: 8,
                                  alignItems: "center",
                                  flexWrap: "wrap",
                                  justifyContent: "flex-end",
                                  flex: "1 1 280px",
                                }}
                              >
                                {renderDeskRedeemControl(busy)}
                                {cartLines.length ? (
                                  <button
                                    type="button"
                                    style={{
                                      ...styles.btn,
                                      flex: "0 0 auto",
                                      background: "#0f766e",
                                      opacity: busy ? 0.45 : 1,
                                    }}
                                    disabled={busy}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      void verifyPoolScan(s, "cart");
                                    }}
                                  >
                                    {busy ? "Đang lưu…" : "Xác thực, không mua thêm"}
                                  </button>
                                ) : null}
                                <button
                                  type="button"
                                  style={{
                                    ...styles.btn,
                                    flex: "0 0 auto",
                                    background: "#0c4a6e",
                                    opacity: qty && !busy ? 1 : 0.45,
                                  }}
                                  disabled={!qty || busy}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    void verifyPoolScan(s, "added");
                                  }}
                                >
                                  {busy
                                    ? "Đang lưu…"
                                    : cartLines.length
                                      ? "Xác thực và mua thêm"
                                      : "Xác thực"}
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
                );
              })()}

          </div>
        </div>
        </>
      ) : null}
      {billViewer ? (
        <div
          onClick={() => setBillViewer(null)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15,23,42,.72)",
            zIndex: 80,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
          }}
        >
          <img
            src={billViewer}
            alt="Ảnh bill"
            style={{ maxWidth: "min(920px, 100%)", maxHeight: "88vh", borderRadius: 12, background: "#fff" }}
          />
        </div>
      ) : null}
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100dvh",
    background: "linear-gradient(180deg,#f8fafc 0%,#eef2ff 100%)",
    padding: "28px 20px 48px",
    fontFamily:
      'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    color: "#0f172a",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 16,
    marginBottom: 18,
    maxWidth: 1360,
    marginInline: "auto",
  },
  card: {
    maxWidth: 420,
    margin: "10vh auto",
    background: "#fff",
    borderRadius: 20,
    padding: 24,
    boxShadow: "0 12px 40px rgba(15,23,42,.08)",
  },
  eyebrow: {
    margin: 0,
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: "0.14em",
    textTransform: "uppercase",
    color: "#b45309",
  },
  h1: { margin: "6px 0 0", fontSize: 30, fontWeight: 800 },
  mute: { margin: "6px 0 0", color: "#64748b", fontSize: 14, lineHeight: 1.45 },
  input: {
    width: "100%",
    border: "1px solid #e2e8f0",
    borderRadius: 12,
    padding: "12px 14px",
    fontSize: 15,
    boxSizing: "border-box",
  },
  btn: {
    border: 0,
    borderRadius: 12,
    padding: "12px 16px",
    background: "#1e3a5f",
    color: "#fff",
    fontWeight: 800,
    cursor: "pointer",
    flex: 1,
  },
  ghost: {
    border: "1px solid #cbd5e1",
    borderRadius: 12,
    padding: "10px 14px",
    background: "#fff",
    fontWeight: 700,
    cursor: "pointer",
  },
  closeBtn: {
    border: "1px solid #cbd5e1",
    borderRadius: 12,
    height: 36,
    padding: "0 12px",
    background: "#fff",
    color: "#0f172a",
    fontWeight: 800,
    fontSize: 13,
    lineHeight: 1,
    cursor: "pointer",
    flex: "0 0 auto",
    alignSelf: "center",
    whiteSpace: "nowrap",
  },
  actionBtn: {
    border: 0,
    borderRadius: 12,
    padding: "0 14px",
    height: 42,
    background: "#1e3a5f",
    color: "#fff",
    fontFamily: "inherit",
    fontWeight: 800,
    fontSize: 14,
    lineHeight: 1,
    cursor: "pointer",
    flex: "0 0 auto",
    whiteSpace: "nowrap",
  },
  actionGhost: {
    border: "1px solid #cbd5e1",
    borderRadius: 12,
    padding: "0 14px",
    height: 42,
    background: "#fff",
    fontWeight: 700,
    fontSize: 14,
    cursor: "pointer",
    flex: "0 0 auto",
    whiteSpace: "nowrap",
  },
  zoneBtn: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 72,
    border: "1px solid #e2e8f0",
    borderRadius: 12,
    padding: "14px 10px",
    cursor: "pointer",
    textAlign: "center",
  },
  err: { color: "#dc2626", fontSize: 14, maxWidth: 980, margin: "0 auto 12px" },
  sheet: {
    maxWidth: 1360,
    margin: "0 auto",
    background: "#fff",
    borderRadius: 18,
    boxShadow: "0 10px 30px rgba(15,23,42,.06)",
  },
  sheetBar: {
    position: "sticky",
    top: 0,
    zIndex: 6,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
    padding: "14px 16px",
    background: "#fff",
    borderBottom: "1px solid #f1f5f9",
    borderRadius: "18px 18px 0 0",
  },
  sheetTitle: {
    margin: 0,
    flex: "1 1 auto",
    minWidth: 0,
    fontSize: 16,
    fontWeight: 800,
    lineHeight: 1.3,
  },
  sheetCount: {
    flex: "0 1 auto",
    maxWidth: "48%",
    fontSize: 13,
    lineHeight: 1.35,
    color: "#64748b",
    textAlign: "right",
  },
  tableWrap: {
    overflow: "auto",
    borderRadius: "0 0 18px 18px",
  },
  table: {
    width: "100%",
    minWidth: 1240,
    borderCollapse: "collapse",
    fontSize: 15,
  },
  billRow: {
    display: "flex",
    gap: 6,
    alignItems: "center",
    flexWrap: "nowrap",
  },
  billBtn: {
    display: "inline-flex",
    alignItems: "center",
    flex: "0 0 auto",
    height: 30,
    margin: 0,
    padding: "0 10px",
    border: "1px solid #cbd5e1",
    borderRadius: 12,
    background: "#fff",
    color: "#0f172a",
    fontWeight: 700,
    fontSize: 12,
    lineHeight: 1,
    whiteSpace: "nowrap",
    cursor: "pointer",
  },
  billBtnSolid: {
    background: "#0f766e",
    color: "#fff",
    border: 0,
  },
  th: {
    textAlign: "left",
    padding: "12px 16px",
    background: "#f8fafc",
    borderBottom: "1px solid #e2e8f0",
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    color: "#64748b",
  },
  td: {
    padding: "14px 16px",
    borderBottom: "1px solid #f1f5f9",
    verticalAlign: "middle",
  },
  badge: {
    display: "inline-block",
    padding: "3px 8px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 800,
  },
  pill: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    boxSizing: "border-box",
    height: 28,
    padding: "0 12px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 700,
    lineHeight: 1,
    whiteSpace: "nowrap",
  },
  modalBackdrop: {
    position: "fixed",
    inset: 0,
    background: "rgba(15,23,42,.45)",
    display: "grid",
    placeItems: "center",
    padding: 16,
    zIndex: 50,
  },
  modal: {
    width: "min(720px, 100%)",
    maxHeight: "92dvh",
    overflow: "auto",
    background: "#fff",
    borderRadius: 20,
    padding: 22,
    boxShadow: "0 20px 50px rgba(0,0,0,.2)",
  },
  chip: {
    border: 0,
    borderRadius: 999,
    padding: "7px 12px",
    fontSize: 12,
    fontWeight: 800,
    cursor: "pointer",
  },
  menuRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid #e2e8f0",
    background: "#fff",
  },
  qtyBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    border: "1px solid #cbd5e1",
    background: "#fff",
    fontWeight: 800,
    fontSize: 16,
    cursor: "pointer",
  },
};
