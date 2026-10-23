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
  POOL_MENU,
  formatPoolPrice,
} from "@/lib/olympic-pool-menu";
import {
  MIA_MEMBERSHIP_DISC_PREFIX,
  isOlympicMembershipActive,
  miaOiDiscountPercentForPlanLabel,
  miaOiMembershipDiscountVnd,
  segmentAtTime,
} from "@/lib/olympic-membership";
import { computePoolPricing } from "@/lib/pool-pricing";
import { printPoolBill } from "@/lib/pool-bill-print";
import { printDayBillsPdf, type DayBill } from "@/lib/day-bills-print";
import {
  DESK_ZONES,
  MIA_OLYMPIC_LABEL,
  dashboardTitle,
  getDeskZone,
  isSwimLessonDesk,
  isZoneDeskAdmin,
  miaOlympicSector,
  sameDeskSector,
  zoneAdminUsername,
  zoneHasResources,
  type DeskZone,
} from "@/lib/desk-zones";
import { DeskCourtSchedule } from "@/components/desk-court-schedule";
import { DeskVipSubscribers } from "@/components/desk-vip-subscribers";
import { DeskResourceGrid } from "@/components/desk-resource-grid";
import { DeskQrScanner } from "@/components/DeskQrScanner";
import { DeskSwimStudents } from "@/components/desk-swim-students";
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
  earnableVndFromPointLines,
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
import { billEvidenceFrozen } from "@/lib/bill-photo";

/** Tạm ẩn nút sơ đồ bàn Lòng Nướng. Đặt true khi mở lại. */
const SHOW_LONG_NUONG_TABLE_MAP = false;

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
  ticketItems?: ScanTicketItem[];
  /** Set when staff saved hồ + mía in one click. */
  deskBundleId?: string | null;
};

type DayOrder = {
  id: string;
  at: string;
  status: string;
  totalVnd: number;
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

type Arrival = {
  id: string;
  customerCode: string;
  fullName: string | null;
  phone: string | null;
  shortId: string | null;
  segment: string;
  segmentLabel: string;
  /** Current package start. Orders before this stay Khách lẻ. */
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
  /** Điểm cộng từ đơn này (10.000đ trước giảm = 1 điểm) */
  pointsEarned: number;
  /** both = một lần lưu hồ + mía. */
  orderKind?: "both" | "mia" | "olympic" | "other";
  /** Đơn đồ uống khi dòng là hồ + mía. Undo vẫn dùng scan hồ. */
  miaOrderId?: string | null;
};

function pointsEarnedFromLines(
  items: {
    id?: string;
    nameVi?: string;
    qty: number;
    priceVnd?: number;
    unitPriceVnd?: number;
    pointsRedeemQty?: number;
    pointsDiscountVnd?: number;
    pointsRedeemTier?: number | null;
  }[]
) {
  // Fold points-redeem rows / pointsRedeemQty onto drinks so redeemed cups earn 0.
  return pointsFromSubtotal(earnableVndFromPointLines(items));
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

function cartOrderLabel(
  status: string | undefined,
  zoneCode: string | null,
  withCatalog: boolean,
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
  if (status === "OPEN") {
    if (z === "MIA_OI") return "Đã duyệt · chờ TT";
    return withCatalog ? "Đã duyệt · chờ order" : "Đã duyệt";
  }
  if (status === "PENDING_APPROVAL") return "Chờ duyệt";
  if (status === "REJECTED") return "Từ chối";
  if (status === "CANCELLED") {
    return (adminNote || "").includes("huỷ") ? "Đã huỷ" : "Khách xoá";
  }
  if (status === "NO_SHOW") return "Không tới";
  return status || "—";
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
  return code === "OLYMPIC_POOL" || code === "OLYMPIC";
}

function ticketSide(t: DeskTicket): "mia" | "olympic" | "other" {
  const text = `${t.billText || ""} ${t.billItems.map((i) => i.nameVi).join(" ")}`.trim();
  const hasBill =
    t.billItems.length > 0 || (text !== "" && text !== "—" && text !== "-");
  if (!hasBill) return "other";
  const code = String(t.scan?.serviceCode || t.cart?.zoneCode || "").toUpperCase();
  const event = String(t.scan?.eventType || "").toUpperCase();
  if (event === "POOL_ORDER" || code === "OLYMPIC_POOL" || code === "OLYMPIC") {
    return "olympic";
  }
  if (event === "MIA_OI_ORDER" || code === "MIA_OI") return "mia";
  const lower = text.toLowerCase();
  const olympic = /vé bơi|bikini|kính|quần bơi|nón bơi|phao/.test(lower);
  const mia = /mía|mia |cà phê|trà |matcha|sinh tố|đá xay|topping/.test(lower);
  if (olympic && !mia) return "olympic";
  if (mia && !olympic) return "mia";
  return "other";
}

function ticketTime(t: DeskTicket) {
  const raw = t.scanAt || "";
  const n = raw ? new Date(raw).getTime() : 0;
  return Number.isFinite(n) ? n : 0;
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
    pointsEarned: (a.pointsEarned || 0) + (b.pointsEarned || 0),
    hasVoucher: a.hasVoucher || b.hasVoucher,
    hasPointsRedeem: a.hasPointsRedeem || b.hasPointsRedeem,
    promoLabel:
      [a.promoLabel, b.promoLabel].filter((p) => p && p !== "—").join(" · ") ||
      "—",
    orderKind: "both",
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
    const byBundle = new Map<string, DeskTicket[]>();
    for (const t of list) {
      if (ticketSide(t) === "other") continue;
      const id = String(t.scan?.deskBundleId || "").trim();
      if (!id) continue;
      const group = byBundle.get(id) || [];
      group.push(t);
      byBundle.set(id, group);
    }
    for (const [id, group] of byBundle) {
      if (group.length < 2) continue;
      const merged = group.slice(1).reduce((acc, t) => mergeOrderPair(acc, t), group[0]);
      merged.key = `bundle-${id}`;
      merged.orderKind = "both";
      out.push(merged);
      group.forEach((t) => used.add(t.key));
    }
    for (const t of list) {
      if (used.has(t.key)) continue;
      out.push({ ...t, orderKind: t.orderKind || ticketSide(t) });
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
        orderLabel: cartOrderLabel(
          cart.status,
          zoneCode,
          withCatalog,
          cart.adminNote
        ),
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
        pointsEarned: pointsEarnedFromLines(sourceItems),
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
        pointsEarned: pointsEarnedFromLines(lines),
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
          "pointsRedeemTier" in it ? Number(it.pointsRedeemTier) : 0;
        const tier = tierRaw === 50 || tierRaw === 100 ? tierRaw : null;
        return {
          id: "itemId" in it ? it.itemId : undefined,
          nameVi: it.nameVi,
          qty: it.qty,
          unitPriceVnd: it.unitPriceVnd,
          pointsDiscountVnd:
            "pointsDiscountVnd" in it ? Number(it.pointsDiscountVnd) || 0 : 0,
          pointsRedeemTier: tier as 50 | 100 | null,
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
        pointsEarned: pointsEarnedFromLines(orderLines),
      });
    }

    for (const scan of a.todayScans || []) {
      if (seenScanIds.has(scan.id)) continue;
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
        pointsEarned: pointsEarnedFromLines(lines),
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
      if (scanLooksFinalized(scan)) continue;
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
      });
    }
  }

  return tickets.sort((a, b) => {
    const ta = a.scanAt ? new Date(a.scanAt).getTime() : 0;
    const tb = b.scanAt ? new Date(b.scanAt).getTime() : 0;
    return tb - ta;
  });
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
  const [voucherPickerOpen, setVoucherPickerOpen] = useState(false);
  /** Hồ Olympic: giỏ vé theo từng lần quét */
  const [scanCarts, setScanCarts] = useState<
    Record<string, Record<string, number>>
  >({});
  const [orderMsg, setOrderMsg] = useState("");
  const [orderFilter, setOrderFilter] = useState<
    "all" | "both" | "mia" | "olympic"
  >("all");
  const [ordering, setOrdering] = useState(false);
  const [billViewer, setBillViewer] = useState<string | null>(null);
  const [billBusyToken, setBillBusyToken] = useState<string | null>(null);
  const [cancellingOrderId, setCancellingOrderId] = useState<string | null>(
    null
  );
  const [verifyingScanId, setVerifyingScanId] = useState<string | null>(null);
  const [scanOpen, setScanOpen] = useState(false);
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
  /** Quầy gộp: vé hồ và đồ uống trên cùng một đơn nhân viên. */
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
    if (!isMiaOlympic || orderFilter === "all") return groupedTickets;
    return groupedTickets.filter((t) => t.orderKind === orderFilter);
  }, [groupedTickets, isMiaOlympic, orderFilter]);

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

  /** Lần quét hồ đang chọn — vé trên đơn gộp gắn vào đây. */
  const focusedPoolScanId = (() => {
    if (!isMiaOlympic) return null;
    const open = (scan: Scan | null | undefined) =>
      !!scan?.id && !scan.ticketVerified && !scan.orderId &&
      (scan.serviceCode === "OLYMPIC_POOL" || scan.serviceCode === "OLYMPIC");
    if (open(focusedTicket?.scan)) return focusedTicket!.scan!.id;
    if (!poolCartOpen()) return null;
    const pending = guestTickets.filter((t) => open(t.scan));
    return pending.length === 1 ? pending[0].scan!.id : null;
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

  const openOrderCount = useMemo(
    () =>
      deskTickets.filter((t) => {
        if (!hasCatalog || t.orderStatus !== "pending") return false;
        const status = t.cart?.status;
        return !status || status === "OPEN" || status === "PENDING_APPROVAL";
      }).length,
    [deskTickets, hasCatalog]
  );

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
    const requested = zone;
    try {
      const res = await fetch(
        `/api/crm/desk?hours=12&zone=${encodeURIComponent(requested)}`,
        { cache: "no-store" }
      );
      if (zoneRef.current !== requested) return;
      if (res.status === 401 || res.status === 403) {
        setStep("login");
        setArrivals([]);
        return;
      }
      const data = await res.json();
      if (zoneRef.current !== requested) return;
      if (!res.ok) throw new Error(data.error || "Load failed");
      setIsAdmin(!!data.isAdmin);
      setIsSystemAdminUser(!!data.isSystemAdmin);
      setArrivals(data.arrivals || []);
      setError("");
      setStep("dashboard");
      setSelected((prev) => {
        if (!prev) return null;
        return (data.arrivals || []).find((a: Arrival) => a.id === prev.id) || prev;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
    }
  }, [zone]);

  useEffect(() => {
    if (!isSpa) return;
    const cap =
      typeof selected?.swimBonusLeft === "number"
        ? Math.min(1, Math.max(0, selected.swimBonusLeft))
        : 1;
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
        const res = await fetch("/api/auth/me", { cache: "no-store" });
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
    void load();
    const ms = pendingApprovalCount > 0 ? 1200 : 2500;
    const t = setInterval(() => void load(), ms);
    return () => clearInterval(t);
  }, [step, zone, load, pendingApprovalCount]);

  async function approveCart(
    token: string,
    e?: React.MouseEvent,
    action: "approve" | "reject" = "approve",
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
      setOrderMsg("Đã lưu ảnh bill.");
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
    required = true,
    frozen = false
  ) {
    if (!token) return null;
    if (frozen && !has) return null;
    return (
      <div
        style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}
        onClick={(e) => e.stopPropagation()}
      >
        {frozen ? null : (
          <label
            style={{
              ...styles.ghost,
              height: 30,
              padding: "0 10px",
              fontSize: 12,
              display: "inline-flex",
              alignItems: "center",
              cursor: "pointer",
              margin: 0,
            }}
          >
            {billBusyToken === token ? "Đang lưu…" : has ? "Đổi ảnh bill" : "Chụp bill"}
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
            style={{ ...styles.ghost, height: 30, padding: "0 10px", fontSize: 12 }}
            onClick={() => void openBillPhoto(token)}
          >
            Xem bill
          </button>
        ) : required ? (
          <span style={{ fontSize: 12, fontWeight: 700, color: "#b45309", whiteSpace: "nowrap" }}>
            Cần ảnh bill để chốt
          </span>
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
    setPicked({ code: "ADMIN", name: "Admin", username: "ADMINISTRATION" });
    setUsername("ADMINISTRATION");
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
            "Tài khoản này không phải Admin. Dùng ADMINISTRATION."
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
            ? `Tài khoản này không phải quầy ${MIA_OLYMPIC_LABEL}. Dùng MIAOI, GYM, ADMINISTRATIONMIAOI, ADMINISTRATIONGYM hoặc ADMINISTRATION.`
            : `Tài khoản này không phải khu ${picked.name}. Dùng ${picked.username}, ${zoneAdminUsername(picked.username)} hoặc ADMINISTRATION.`
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

  async function submitCreateGuest() {
    if (!zone || createGuestBusy) return;
    const fullName = guestName.trim();
    const phone = guestPhone.trim();
    if (!fullName || !phone) {
      setCreateGuestError("Nhập đủ tên và số điện thoại.");
      return;
    }
    setCreateGuestBusy(true);
    setCreateGuestError("");
    try {
      const res = await fetch("/api/crm/desk/create-guest", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          zone,
          fullName,
          phone,
        }),
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
      const segment =
        cust.segment === "VIP" || fromList?.segment === "VIP"
          ? "VIP"
          : "WALK_IN";
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
          }
        : null;
      const arrival: Arrival = fromList
        ? {
            ...fromList,
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
            segmentLabel:
              cust.segmentLabel || (segment === "VIP" ? "VIP" : "Khách lẻ"),
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
        const segment =
          cust.segment === "MEMBER" || fromList?.segment === "MEMBER"
            ? "MEMBER"
            : "WALK_IN";
        const arrival: Arrival = fromList || {
          id: cust.id,
          customerCode: cust.customerCode,
          fullName: cust.fullName,
          phone: cust.phone,
          shortId: cust.shortId,
          segment,
          segmentLabel: segment === "MEMBER" ? "Member" : "Khách lẻ",
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

        // Hồ: prefill vé từ QR giỏ vào lần quét vừa tạo
        if (zone === "OLYMPIC_POOL" && data.cart?.items) {
          const scanId =
            String(data.scanEventId || "") ||
            arrival.todayScans.find(
              (s) =>
                s.eventType === "SERVICE_USE" &&
                !s.ticketVerified &&
                s.serviceCode === "OLYMPIC_POOL"
            )?.id;
          if (scanId) {
            const rawItems = Array.isArray(data.cart.items)
              ? data.cart.items
              : [];
            const next: Record<string, number> = {};
            for (const it of rawItems as {
              id?: string;
              qty?: number;
            }[]) {
              const id = String(it.id || "").trim();
              if (!id || !getPoolItemById(id)) continue;
              next[id] = Math.min(99, Math.max(1, Number(it.qty) || 1));
            }
            if (Object.keys(next).length) {
              setScanCarts((prev) => ({ ...prev, [scanId]: next }));
            }
          }
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

  function setScanQty(scanId: string, itemId: string, qty: number) {
    const item = getPoolItemById(itemId);
    if (
      qty > 0 &&
      item?.category === "goi-thang" &&
      olympicMembershipLocked()
    ) {
      return;
    }
    setScanCarts((prev) => {
      const row = { ...(prev[scanId] || {}) };
      if (qty <= 0) delete row[itemId];
      else row[itemId] = Math.min(qty, 99);
      const next = { ...prev };
      if (Object.keys(row).length === 0) delete next[scanId];
      else next[scanId] = row;
      return next;
    });
  }

  function olympicMembershipLocked() {
    if (!selected) return false;
    return isOlympicMembershipActive({
      segment: selected.segment,
      vipExpiresAt: selected.packageExpiresAt,
    });
  }

  function guestHasSameDayOlympicOrder() {
    return (selected?.todayOrders || []).some((o) => {
      const st = String(o.status || "").toUpperCase();
      return st !== "CANCELLED" && st !== "PENDING" && st !== "SUBMITTED";
    });
  }

  function scanCartTotal(scanId: string) {
    const row = scanCarts[scanId] || {};
    const lines = Object.entries(row)
      .filter(([, q]) => q > 0)
      .map(([itemId, qty]) => ({ itemId, qty }));
    const priced = computePoolPricing(lines, {
      sameDayMembership: guestHasSameDayOlympicOrder(),
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
    return POOL_MENU.find((i) => i.id === id) || null;
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
    if (
      olympicMembershipLocked() &&
      items.some((i) => getPoolItemById(i.itemId)?.category === "goi-thang")
    ) {
      setError(
        "Khách đang dùng gói hội viên. Hết hạn mới chọn gói mới."
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
      const memNote = data.membership?.planLabel
        ? ` · gói ${data.membership.planLabel}`
        : "";
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
      billText: t.billText,
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
      });
      setOrderMsg(`Đã gửi in bill · ${formatTime(at)}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không mở được máy in");
    }
  }

  function qtyCap(item: CatalogItem) {
    if (item.id !== SPA_GOI_BONUS_ID) return 99;
    const left = selected?.swimBonusLeft;
    if (typeof left === "number") return Math.min(1, Math.max(0, left));
    return 1;
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
    if (!isMiaOi || !selected) return 0;
    if (
      !isOlympicMembershipActive({
        segment: selected.segment,
        vipExpiresAt: selected.packageExpiresAt,
      })
    ) {
      return 0;
    }
    return miaOiDiscountPercentForPlanLabel(selected.packageLabel);
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

  /** Vé trên lần quét đang chọn: giỏ khách đã duyệt cộng vé quầy vừa thêm. */
  function focusedPoolLines() {
    if (!isMiaOlympic || !focusedPoolScanId) return [];
    const row = scanCarts[focusedPoolScanId] || {};
    const added = Object.entries(row)
      .filter(([, q]) => q > 0)
      .map(([itemId, qty]) => ({ itemId, qty }));
    return mergePoolLines(approvedCartPoolLines(), added);
  }

  function boardPoolTotals() {
    const lines = focusedPoolLines();
    if (!lines.length) {
      return { sum: 0, qty: 0, accessoryDiscount: 0, membershipDiscount: 0 };
    }
    const priced = computePoolPricing(lines, {
      sameDayMembership: guestHasSameDayOlympicOrder(),
    });
    return {
      sum: priced.totalVnd,
      qty: priced.lines.reduce((s, l) => s + l.qty, 0),
      accessoryDiscount: priced.accessoryDiscountVnd,
      membershipDiscount: priced.membershipDiscountVnd,
    };
  }

  function boardSaveLabel() {
    const pool = boardPoolTotals().qty > 0;
    const mia = cartLines.length > 0;
    if (pool && mia) return "Lưu đơn (hồ + mía)";
    if (pool) return "Xác thực";
    return "Lưu đơn";
  }

  /** Tiền Mía sau điểm và % hội viên. */
  function deskMiaPayable() {
    const pointsOff = isMiaOi ? deskRedeemPreview().extraOff : 0;
    const afterPoints = Math.max(0, cartTotal - pointsOff);
    const memberOff = isMiaOi
      ? miaOiMembershipDiscountVnd(afterPoints, deskMiaMembershipPercent())
      : 0;
    return Math.max(0, afterPoints - memberOff);
  }

  function deskCatalogPayable() {
    if (!isMiaOlympic) return deskMiaPayable();
    return deskMiaPayable() + boardPoolTotals().sum;
  }

  function boardCombinedQty() {
    const miaQty = cartLines.reduce((n, l) => n + l.qty, 0);
    return miaQty + boardPoolTotals().qty;
  }

  function boardSummaryLabel() {
    const pool = boardPoolTotals();
    const miaQty = cartLines.reduce((n, l) => n + l.qty, 0);
    const totalQty = miaQty + pool.qty;
    if (totalQty <= 0) return "Chưa chọn vé / đồ uống";
    const parts: string[] = [];
    if (pool.qty > 0) parts.push(`hồ ${formatVnd(pool.sum)}`);
    if (miaQty > 0) parts.push(`mía ${formatVnd(deskMiaPayable())}`);
    const pct = deskMiaMembershipPercent();
    const redeem = deskRedeemPreview();
    return `${totalQty} món · ${formatVnd(deskCatalogPayable())}${
      parts.length ? ` (${parts.join(" + ")})` : ""
    }${pct > 0 && miaQty > 0 ? ` · hội viên −${pct}%` : ""}${
      redeem.extraUnits
        ? ` · −${redeem.extraUnits * DESK_REDEEM_DRINK_STEP} điểm`
        : ""
    }`;
  }

  function boardDiscountNotes(): string[] {
    if (!isMiaOlympic) return [];
    const pool = boardPoolTotals();
    const notes = [
      "Không giảm: vé bơi lẻ · đồ uống Mía (trừ hội viên trong hạn hoặc đổi điểm)",
    ];
    if (pool.accessoryDiscount > 0) {
      notes.unshift(
        `Phụ kiện ≥2 món: −10% phần phụ kiện (−${formatVnd(pool.accessoryDiscount)})`
      );
    }
    if (pool.membershipDiscount > 0) {
      notes.unshift(
        `Gói tháng cùng ngày vé bơi: −10% (−${formatVnd(pool.membershipDiscount)})`
      );
    }
    return notes;
  }

  function renderDeskVoucherButton(disabled?: boolean) {
    if (isMiaOi) return null;
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
    const extras = mode === "added" ? cartLines : [];
    if (mode === "added" && extras.length === 0) {
      setError("Chọn món gọi thêm, hoặc bấm xác nhận giỏ.");
      return;
    }
    const poolLines = focusedPoolLines();
    const poolScan = focusedPoolScan();
    const bundleId =
      poolLines.length > 0 && poolScan ? `b${Date.now().toString(36)}` : "";
    setOrdering(true);
    setOrderMsg("");
    setError("");
    const notes: string[] = [];
    try {
      if (poolLines.length && poolScan && focusedPoolScanId) {
        const poolRes = await fetch("/api/crm/pool/orders", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            customerId: selected.id,
            scanEventId: poolScan.id,
            items: poolLines,
            ...(bundleId ? { deskBundleId: bundleId } : {}),
          }),
        });
        const poolData = await poolRes.json();
        if (!poolRes.ok) throw new Error(poolData.error || "Không xác thực được vé hồ");
        notes.push(`hồ ${formatVnd(poolData.order?.totalVnd || 0)}`);
        setScanCarts((prev) => {
          const next = { ...prev };
          delete next[focusedPoolScanId];
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
      setOrdering(false);
    }
  }

  /** Lưu đơn gộp: xác thực vé hồ (nếu có) rồi lưu đồ uống Mía (nếu có). */
  async function saveMiaOlympicBoard() {
    if (!selected || !isMiaOlympic || ordering) return;
    const pool = boardPoolTotals();
    const miaPay = deskMiaPayable();
    const hasMia = cartLines.length > 0;
    const scan = focusedPoolScan();
    const poolLines = focusedPoolLines();
    const hasPool = poolLines.length > 0 && !!scan && !!focusedPoolScanId;
    if (!hasMia && !hasPool) {
      setError("Chọn vé hồ hoặc đồ uống Mía trước khi lưu.");
      return;
    }
    setOrdering(true);
    setOrderMsg("");
    setError("");
    const notes: string[] = [];
    const bundleId =
      hasMia && hasPool ? `b${Date.now().toString(36)}` : "";
    try {
      if (hasPool && scan && focusedPoolScanId) {
        const items = poolLines;
        if (!items.length) throw new Error("Chọn ít nhất 1 vé hồ trước khi lưu.");
        const res = await fetch("/api/crm/pool/orders", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            customerId: selected.id,
            scanEventId: scan.id,
            items,
            ...(bundleId ? { deskBundleId: bundleId } : {}),
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Không lưu được vé hồ");
        notes.push(`hồ ${formatVnd(data.order?.totalVnd || pool.sum)}`);
        setScanCarts((prev) => {
          const next = { ...prev };
          delete next[focusedPoolScanId];
          return next;
        });
      }
      if (hasMia) {
        const res = await fetch("/api/crm/miaoi/orders", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            customerId: selected.id,
            items: cartLines,
            pointsRedeemUnits: deskRedeemUnits,
            ...(bundleId ? { deskBundleId: bundleId } : {}),
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Không lưu được đơn Mía");
        notes.push(`mía ${formatVnd(data.order?.totalVnd || miaPay)}`);
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
      setOrderMsg(`Đã lưu · ${notes.join(" + ")}`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không lưu được");
    } finally {
      setOrdering(false);
    }
  }

  async function saveOrder(finalize = false) {
    if (isMiaOlympic) {
      await saveMiaOlympicBoard();
      return;
    }
    if (!selected || !hasCatalog || isPool || cartLines.length === 0) return;
    if (miaOrderLocked()) return;
    const revisingSpa = spaCartEditable();
    if (finalize && !revisingSpa) return;
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
            {DESK_ZONES.filter((z) => z.code !== "OLYMPIC_POOL").map((z) => (
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
            Acc admin lớn: <strong>ADMINISTRATION</strong> — mọi khu.
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
                Acc admin: <strong>ADMINISTRATION</strong> · mk{" "}
                <strong>12345678!</strong>
              </>
            ) : miaOlympicSector(picked.code) ? (
              <>
                Acc khu: <strong>MIAOI</strong> hoặc <strong>GYM</strong>
                <br />
                Acc admin khu: <strong>ADMINISTRATIONMIAOI</strong> /{" "}
                <strong>ADMINISTRATIONGYM</strong> · mk <strong>12345678</strong>
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
                Hoặc <strong>ADMINISTRATION</strong> (mọi khu).
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
          <p style={styles.mute}>
            {hasCatalog
              ? `${visibleTickets.length} dòng · ${openOrderCount} chưa order · ${pendingApprovalCount} chờ duyệt`
              : `${arrivals.length} khách · ${pendingApprovalCount} chờ duyệt`}
            {pendingApprovalCount > 0
              ? " · bấm Xác nhận để mở QR cho khách"
              : ""}
            {isMiaOlympic
              ? " · Tạo đơn → chọn vé hồ và đồ uống → Lưu đơn (hồ + mía)"
              : isMiaOi
                ? " · duyệt QR → mở khách → Xác nhận, không gọi thêm / Xác nhận và gọi thêm"
                : ""}
            {isSpa ? " · bấm dòng để chọn spa" : ""}
            {isPool && !isMiaOlympic ? " · sau duyệt: Quét QR → Xác thực, không mua thêm / Xác thực và mua thêm" : ""}
            {zone === "PICKLEBALL"
              ? " · duyệt đặt sân online · ghi khách tại quầy trên lịch · Kết thúc = reset sân"
              : ""}
            {zone === "LONG_NUONG" && SHOW_LONG_NUONG_TABLE_MAP
              ? " · bảng dưới = duyệt mã · sơ đồ bàn mở bằng nút riêng"
              : zone === "LONG_NUONG"
                ? " · bảng dưới = duyệt mã"
                : ""}
            {isAdmin ? " · admin" : ""}
          </p>
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
              {zone === "VIP_RESORT" ? "Sơ đồ VIP" : "Sơ đồ bàn"}
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
          style={{
            display: "flex",
            gap: 6,
            flexWrap: "wrap",
            justifyContent: "flex-end",
            margin: "0 0 12px",
          }}
        >
          {(
            [
              ["all", "All"],
              ["both", "Mía Ơi + Olympic"],
              ["mia", "Mía Ơi"],
              ["olympic", "Olympic"],
            ] as const
          ).map(([id, label]) => {
            const on = orderFilter === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setOrderFilter(id)}
                style={{
                  border: on ? "1px solid #1e3a5f" : "1px solid #cbd5e1",
                  background: on ? "#1e3a5f" : "#fff",
                  color: on ? "#fff" : "#0f172a",
                  borderRadius: 999,
                  height: 30,
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
                  Khách lẻ tại quầy. Đăng nhập app: SĐT + mật khẩu là số điện
                  thoại. VIP chỉ khi khách đăng ký gói.
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
                            color:
                              hit.segmentLabel === "VIP"
                                ? "#1d4ed8"
                                : "#64748b",
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
                      Không thấy khách. Nhập họ tên + SĐT bên dưới để tạo mới.
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
                onClick={() => void submitCreateGuest()}
              >
                {createGuestBusy ? "Đang tạo…" : "Tạo đơn"}
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

      {/* Modal sơ đồ bàn / VIP — Spa không dùng giường */}
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
                {zone === "VIP_RESORT" ? "Sơ đồ VIP" : "Sơ đồ bàn"}
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
          <h2 style={styles.sheetTitle}>Yêu cầu / duyệt mã</h2>
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
              <th style={styles.th}>SĐT</th>
              <th style={styles.th}>ID</th>
              <th style={styles.th}>Tạo / Quét</th>
              <th style={styles.th}>Loại</th>
              <th style={styles.th}>Hoá đơn</th>
              <th style={styles.th}>Voucher / Điểm</th>
              {hasCatalog ? <th style={styles.th}>Order</th> : null}
              <th style={styles.th}>Duyệt</th>
              <th style={styles.th}>Đã check in</th>
            </tr>
          </thead>
          <tbody>
            {visibleTickets.length === 0 ? (
              <tr>
                <td
                  colSpan={hasCatalog ? 10 : 9}
                  style={{ ...styles.td, color: "#64748b", padding: 28 }}
                >
                  {orderFilter === "all"
                    ? "Chưa có khách gửi yêu cầu / quét QR "
                    : "Không có đơn cho bộ lọc này. "}
                  {orderFilter === "all" ? <strong>{zoneName}</strong> : null}
                  {orderFilter === "all" ? " trong 12 giờ." : ""}
                </td>
              </tr>
            ) : (
              visibleTickets.map((t) => {
                const a = t.arrival;
                const needApprove = t.needsApproval;
                const cartTok = t.cart?.token || "";
                const ci = t.checkInUi;
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
                    <td style={{ ...styles.td, fontWeight: 700 }}>
                      {a.fullName || "—"}
                    </td>
                    <td style={styles.td}>{a.phone || "—"}</td>
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
                    <td style={styles.td}>
                      <span
                        style={{
                          ...styles.badge,
                          background:
                            shown.segment === "MEMBER" ? "#dbeafe" : "#f1f5f9",
                          color:
                            shown.segment === "MEMBER" ? "#1d4ed8" : "#334155",
                        }}
                      >
                        {shown.segmentLabel}
                      </span>
                    </td>
                    <td
                      style={{
                        ...styles.td,
                        maxWidth: 320,
                        fontSize: 12,
                        color: "#334155",
                        whiteSpace: "normal",
                        lineHeight: 1.4,
                      }}
                    >
                      {isLongNuong
                        ? renderBillCapture(
                            t.cart?.token,
                            !!t.cart?.hasBillPhoto,
                            !!t.cart &&
                              (t.cart.status === "OPEN" ||
                                t.cart.status === "PENDING_APPROVAL" ||
                                (t.cart.status === "USED" &&
                                  !longNuongVisitDone(t.cart.adminNote))),
                            !!t.cart && billEvidenceFrozen(t.cart)
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
                        <div style={{ color: "#64748b" }}>{t.billText}</div>
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
                              title="Điểm cộng từ đơn này (10.000đ trước giảm = 1 điểm)"
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
                      <td style={styles.td}>
                        <span
                          style={{
                            ...styles.badge,
                            background:
                              t.orderStatus === "ordered"
                                ? "#d1fae5"
                                : "#ffedd5",
                            color:
                              t.orderStatus === "ordered"
                                ? "#047857"
                                : "#c2410c",
                          }}
                        >
                          {t.orderLabel}
                        </span>
                      </td>
                    ) : null}
                    <td style={styles.td} onClick={(e) => e.stopPropagation()}>
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
                                : "Duyệt"}
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
                            ...styles.badge,
                            background: "#fee2e2",
                            color: "#b91c1c",
                          }}
                        >
                          Từ chối
                        </span>
                      ) : t.cart?.status === "CANCELLED" ? (
                        <span
                          style={{
                            ...styles.badge,
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
                          style={{
                            ...styles.badge,
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
                              title={
                                !isLongNuong || t.cart?.hasBillPhoto
                                  ? "Kết thúc lượt"
                                  : "Chụp ảnh bill trước"
                              }
                              style={{
                                ...styles.btn,
                                flex: "0 0 auto",
                                height: 32,
                                padding: "0 10px",
                                fontSize: 12,
                                background: "#0f766e",
                                whiteSpace: "nowrap",
                                opacity:
                                  approvingToken === cartTok ||
                                  (isLongNuong && !t.cart?.hasBillPhoto)
                                    ? 0.45
                                    : 1,
                              }}
                              disabled={
                                approvingToken === cartTok ||
                                (isLongNuong && !t.cart?.hasBillPhoto)
                              }
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
                  {selected.segmentLabel}
                  {typeof selected.pointsBalance === "number"
                    ? ` · ${selected.pointsBalance} điểm`
                    : ""}
                </p>
                {selected.packageLabel ? (
                  <p style={{ ...styles.mute, marginTop: 4 }}>
                    Gói <strong>{selected.packageLabel}</strong>
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
                    ? "Yêu cầu chờ duyệt"
                    : spaCartEditable()
                      ? "Giỏ QR đã duyệt"
                      : guestConfirmedBill
                        ? "Đơn đã xác thực"
                        : "Giỏ QR đã duyệt"}
                  {guestCart.zoneName ? ` · ${guestCart.zoneName}` : ""}
                </p>
                {spaCartEditable() ? (
                  <p style={{ margin: "6px 0 0", fontSize: 12, color: "#334155" }}>
                    Cập nhật đơn lưu thay đổi, kể cả khi khách đang dùng. Xác nhận
                    hoặc quét QR chuyển sang Đang dùng. Đã dùng khi khách xong.
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
                      {it.pointsLabel ? ` · ${it.pointsLabel}` : ""}
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
                        opacity:
                          approvingToken === guestCart.token ||
                          (isLongNuong && !guestCart.hasBillPhoto)
                            ? 0.45
                            : 1,
                      }}
                      title={
                        !isLongNuong || guestCart.hasBillPhoto
                          ? "Kết thúc lượt"
                          : "Chụp ảnh bill trước"
                      }
                      disabled={
                        approvingToken === guestCart.token ||
                        (isLongNuong && !guestCart.hasBillPhoto)
                      }
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
                {isLongNuong ? (
                  <div style={{ marginTop: 8 }}>
                    {renderBillCapture(
                      guestCart.token,
                      !!guestCart.hasBillPhoto,
                      guestCart.status === "OPEN" ||
                        guestCart.status === "PENDING_APPROVAL" ||
                        (guestCart.status === "USED" &&
                          !longNuongVisitDone(guestCart.adminNote)),
                      billEvidenceFrozen(guestCart)
                    )}
                  </div>
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
                            : "Duyệt"}
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
                    <p
                      style={{
                        margin: "0 0 6px",
                        fontWeight: 800,
                        color: "#0c4a6e",
                        fontSize: 15,
                      }}
                    >
                      1 · Hồ Olympic — Vé / phụ kiện
                    </p>
                    <p
                      style={{
                        margin: "0 0 8px",
                        fontSize: 12,
                        color: "#0c4a6e",
                        lineHeight: 1.45,
                        fontWeight: 600,
                      }}
                    >
                      Giảm: phụ kiện ≥2 món → −10% phần phụ kiện · gói tháng
                      cùng ngày vé bơi → −10% gói. Không giảm: vé bơi lẻ.
                    </p>
                    {!focusedPoolScanId ? (
                      <p style={{ margin: "0 0 8px", fontSize: 12, color: "#64748b" }}>
                        Chọn dòng quét hồ bên trên để gắn vé, rồi +/− bên dưới.
                      </p>
                    ) : (
                      <p style={{ margin: "0 0 8px", fontSize: 12, color: "#0369a1" }}>
                        Đang gắn vé vào lần quét{" "}
                        {formatTime(focusedPoolScan()?.at || focusedTicket?.scanAt || "")}.
                      </p>
                    )}
                    <div
                      style={{
                        display: "grid",
                        gap: 8,
                        maxHeight: 220,
                        overflow: "auto",
                        opacity: focusedPoolScanId ? 1 : 0.55,
                        pointerEvents: focusedPoolScanId ? "auto" : "none",
                      }}
                    >
                      {POOL_CATEGORIES.map((cat) => {
                        const items = POOL_MENU.filter(
                          (item) => item.category === cat.id
                        );
                        if (!items.length) return null;
                        const membershipHeld =
                          cat.id === "goi-thang" && olympicMembershipLocked();
                        const scanId = focusedPoolScanId || "";
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
                            {membershipHeld ? (
                              <p
                                style={{
                                  margin: 0,
                                  fontSize: 12,
                                  color: "#9a3412",
                                  fontWeight: 700,
                                }}
                              >
                                Đang dùng gói hội viên — hết hạn mới chọn gói mới.
                              </p>
                            ) : null}
                            {items.map((item) => {
                              const q = scanId ? scanQty(scanId, item.id) : 0;
                              return (
                                <div key={item.id} style={styles.menuRow}>
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontWeight: 700, fontSize: 14 }}>
                                      {item.nameVi}
                                    </div>
                                    <div style={{ fontSize: 12, color: "#64748b" }}>
                                      {formatPoolPrice(item)}
                                      {item.durationMin ? ` · ${item.durationMin}'` : ""}
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
                                      disabled={!scanId || q <= 0 || membershipHeld}
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
                                      disabled={!scanId || membershipHeld}
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
                <p style={{ marginTop: isMiaOlympic ? 8 : 18, marginBottom: 8, fontWeight: 800 }}>
                  {isMiaOlympic
                    ? "2 · Mía Ơi — đồ uống"
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
                      return (
                        <div
                          key={rowKey}
                          style={styles.menuRow}
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
                              {"id" in item &&
                              item.id === SPA_GOI_BONUS_ID &&
                              selected?.swimBonusLeft != null
                                ? ` · còn ${selected.swimBonusLeft}`
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
                      {isMiaOlympic
                        ? boardSummaryLabel()
                        : cartLines.length
                          ? (() => {
                              const pct = deskMiaMembershipPercent();
                              const redeem = deskRedeemPreview();
                              const voucher = selectedDeskVoucher();
                              return `${isMiaOi && miaCartOpen() ? "Gọi thêm " : ""}${cartLines.reduce((n, l) => n + l.qty, 0)} ${catalogUnit()} · ${formatVnd(deskCatalogPayable())}${
                                pct > 0 ? ` · hội viên −${pct}%` : ""
                              }${
                                isMiaOi && redeem.extraUnits
                                  ? ` · −${redeem.extraUnits * DESK_REDEEM_DRINK_STEP} điểm`
                                  : ""
                              }${voucher ? ` · ${voucher.title}` : ""}`;
                            })()
                          : isMiaOi && miaCartOpen()
                            ? "Không gọi thêm"
                            : `Chưa chọn ${catalogUnit()}`}
                    </div>
                    {isMiaOlympic && boardDiscountNotes().length ? (
                      <div style={{ marginTop: 6, display: "grid", gap: 2 }}>
                        {boardDiscountNotes().map((note) => (
                          <div
                            key={note}
                            style={{
                              fontSize: 12,
                              fontWeight: 600,
                              color: "#64748b",
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
                              : cartLines.length > 0) && !ordering
                              ? 1
                              : 0.45,
                        }}
                        disabled={
                          ordering ||
                          (isMiaOlympic
                            ? boardCombinedQty() <= 0
                            : !cartLines.length)
                        }
                        onClick={() =>
                          void (spaCartEditable() ? saveOrder(true) : saveOrder(false))
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
                    (t.billText && t.billText !== "—" ? t.billText : null) ||
                    s?.orderSummary ||
                    null;
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
                                  color: locked ? "#047857" : "#b45309",
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
                                color: locked ? "#047857" : "#b45309",
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
                          <div style={{ display: "grid", gap: 8 }}>
                            {POOL_CATEGORIES.map((cat) => {
                              const items = POOL_MENU.filter(
                                (item) => item.category === cat.id
                              );
                              if (!items.length) return null;
                              const sameDay = guestHasSameDayOlympicOrder();
                              const membershipHeld =
                                cat.id === "goi-thang" && olympicMembershipLocked();
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
                                    {cat.id === "goi-thang" && sameDay && !membershipHeld
                                      ? " · −10% cùng ngày với đơn Olympic"
                                      : ""}
                                  </p>
                                  {membershipHeld ? (
                                    <p
                                      style={{
                                        margin: 0,
                                        fontSize: 12,
                                        fontWeight: 700,
                                        color: "#9a3412",
                                      }}
                                    >
                                      Đang dùng {selected?.packageLabel || "gói hội viên"}
                                      {membershipUntil ? ` đến ${membershipUntil}` : ""}. Hết hạn mới chọn gói mới.
                                    </p>
                                  ) : null}
                                  {items.map((item) => {
                                    const q = scanQty(s.id, item.id);
                                    const blocked = membershipHeld;
                                    return (
                                      <div
                                        key={item.id}
                                        style={{
                                          ...styles.menuRow,
                                          opacity: blocked ? 0.55 : 1,
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
                                            {item.category === "goi-thang" &&
                                            sameDay &&
                                            !blocked
                                              ? `${Math.round((item.priceVnd * 0.9) / 1000)}K (−10%)`
                                              : formatPoolPrice(item)}
                                            {item.durationMin
                                              ? ` · ${item.durationMin}'`
                                              : ""}
                                            {item.note ? ` · ${item.note}` : ""}
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
                                            disabled={busy || blocked}
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
    maxWidth: 1180,
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
    maxWidth: 1180,
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
  table: { width: "100%", borderCollapse: "collapse", fontSize: 15 },
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
