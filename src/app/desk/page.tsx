"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  MIAOI_CATEGORIES,
  MIAOI_MENU,
  formatMenuPrice,
  formatVnd,
  type MiaOiMenuItem,
} from "@/lib/miaoi-menu";
import {
  SPA_CATEGORIES,
  SPA_MENU,
  formatSpaPrice,
  type SpaMenuItem,
} from "@/lib/spa-menu";
import { POOL_MENU, formatPoolPrice } from "@/lib/olympic-pool-menu";
import { computePoolPricing } from "@/lib/pool-pricing";
import { printPoolBill } from "@/lib/pool-bill-print";
import { printDayBillsPdf, type DayBill } from "@/lib/day-bills-print";
import {
  DESK_ZONES,
  dashboardTitle,
  getDeskZone,
  isSwimLessonDesk,
  isZoneDeskAdmin,
  zoneAdminUsername,
  zoneHasResources,
  type DeskZone,
} from "@/lib/desk-zones";
import { DeskCourtSchedule } from "@/components/desk-court-schedule";
import { DeskResourceGrid } from "@/components/desk-resource-grid";
import { DeskQrScanner } from "@/components/DeskQrScanner";
import { DeskSwimStudents } from "@/components/desk-swim-students";
import {
  checkInLabel,
  checkInUiFromCart,
  type CheckInUi,
} from "@/lib/cart-status";
import { parseCartPromo } from "@/lib/cart-promo";
import {
  REDEEM_DRINK_MAX_VND,
  foldPointsOntoItems,
} from "@/lib/bill-points";

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
};

type DayOrder = {
  id: string;
  at: string;
  status: string;
  totalVnd: number;
  items: { nameVi: string; qty: number; unitPriceVnd: number }[];
};

type GuestCartPreview = {
  token: string;
  zoneCode: string;
  zoneName: string | null;
  items: { id: string; nameVi: string; qty: number; priceVnd: number }[];
  totalVnd: number;
  status?: string;
  adminNote?: string | null;
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
  pointsBalance?: number;
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
type DeskTicket = {
  key: string;
  arrival: Arrival;
  cart: GuestCartPreview | null;
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
};

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
    return z === "MIA_OI" ? "Đã TT · làm món" : "Đã dùng";
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

function poolScanGroupKey(row: Scan) {
  if (row.eventType !== "SERVICE_USE") return `scan:${row.id}`;
  if (row.orderId) return `order:${row.orderId}`;
  if (!row.ticketVerified && !row.orderSummary) return "unverified";
  return `scan:${row.id}`;
}

/** One confirmed check-in per order, even if several scans were merged. */
function confirmedPoolBills(scans: Scan[]): Scan[] {
  const byOrder = new Map<string, Scan>();
  for (const s of scans) {
    if (!s.ticketVerified || !s.orderId || !s.ticketItems?.length) continue;
    const prev = byOrder.get(s.orderId);
    if (!prev || (!prev.cartToken && s.cartToken)) byOrder.set(s.orderId, s);
  }
  return [...byOrder.values()];
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
    return bills[0];
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

    if (carts.length) {
      const usedCartCount = carts.filter((c) => c.status === "USED").length;
      const confirmedBills = confirmedPoolBills(a.todayScans || []);
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
        const billItems = confirmed
          ? billItemsFromPoints(
              (confirmed.ticketItems || []).map((i) => ({
                id: i.itemId,
                nameVi: i.nameVi,
                qty: i.qty,
                unitPriceVnd: i.unitPriceVnd,
                pointsDiscountVnd: i.pointsDiscountVnd,
                pointsRedeemTier: i.pointsRedeemTier,
              }))
            )
          : billItemsFromPoints(
              (cart.items || []).map((i) => ({
                id: i.id,
                nameVi: i.nameVi,
                qty: i.qty,
                unitPriceVnd: i.priceVnd,
              }))
            );
        const promo = parseCartPromo(cart.items);
        const promoLabel =
          cart.promoLabel && cart.promoLabel !== "—"
            ? cart.promoLabel
            : promo.label;
        tickets.push({
          key: `cart-${cart.token}`,
          arrival: a,
          cart,
          scanAt: cart.createdAt || a.lastVisitAt,
          orderStatus:
            cart.status === "USED" || ui === "yes" ? "ordered" : "pending",
          orderLabel: cartOrderLabel(
            cart.status,
            zoneCode,
            withCatalog,
            cart.adminNote
          ),
          billText:
            (confirmed ? confirmed.orderSummary : cart.billText) ||
            billItems.map((i) => `${i.qty}× ${i.nameVi}`).join(", ") ||
            "—",
          billTotal: confirmed ? confirmed.totalVnd ?? cart.totalVnd : cart.totalVnd,
          billItems,
          pendingAdmin: need,
          needsApproval: need,
          checkInUi: ui,
          promoLabel,
          hasVoucher: promo.hasVoucher || !!cart.hasVoucher,
          hasPointsRedeem:
            promo.hasPointsRedeem || !!cart.hasPointsRedeem,
        });
      }
      continue;
    }

    // Legacy: chỉ có scan / order, chưa có cart
    if (!withCatalog) {
      const verified = (a.todayScans || []).some((s) => s.ticketVerified);
      tickets.push({
        key: `guest-${a.id}`,
        arrival: a,
        cart: null,
        scanAt: a.lastVisitAt,
        orderStatus: verified ? "ordered" : "pending",
        orderLabel: verified ? "Đã check-in" : "Chờ check-in",
        billText: a.cartBillText || "—",
        billTotal: null,
        billItems: [],
        pendingAdmin: a.pendingAdmin,
        needsApproval: false,
        checkInUi: verified ? "yes" : "pending",
        promoLabel: "—",
        hasVoucher: false,
        hasPointsRedeem: false,
      });
      continue;
    }

    const scans = (a.todayScans || [])
      .filter(
        (s) => s.eventType === "SERVICE_USE" && s.serviceCode === zoneCode
      )
      .slice()
      .sort((x, y) => new Date(x.at).getTime() - new Date(y.at).getTime());
    const orders = (a.todayOrders || [])
      .filter((o) => o.status !== "CANCELLED")
      .slice()
      .sort((x, y) => new Date(x.at).getTime() - new Date(y.at).getTime());
    const slots = Math.max(scans.length, orders.length);
    for (let i = 0; i < slots; i++) {
      const scan = scans[i];
      const order = orders[i];
      if (order) {
        tickets.push({
          key: `order-${order.id}`,
          arrival: a,
          cart: null,
          scanAt: scan?.at || order.at,
          orderStatus: "ordered",
          orderLabel: "Đã order",
          billText: billFromItems(order.items, order.totalVnd),
          billTotal: order.totalVnd,
          billItems: billItemsFromPoints(
            order.items.map((it) => ({
              nameVi: it.nameVi,
              qty: it.qty,
              unitPriceVnd: it.unitPriceVnd,
            }))
          ),
          pendingAdmin: false,
          needsApproval: false,
          checkInUi: "yes",
          promoLabel: "—",
          hasVoucher: false,
          hasPointsRedeem: false,
        });
      } else if (scan) {
        tickets.push({
          key: `scan-${scan.id}`,
          arrival: a,
          cart: null,
          scanAt: scan.at,
          orderStatus: "pending",
          orderLabel: "Chưa có order",
          billText: "—",
          billTotal: null,
          billItems: [],
          pendingAdmin: a.pendingAdmin,
          needsApproval: false,
          checkInUi: scan.ticketVerified ? "yes" : "pending",
          promoLabel: "—",
          hasVoucher: false,
          hasPointsRedeem: false,
        });
      }
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
  const [saving, setSaving] = useState(false);
  const [category, setCategory] = useState(MIAOI_CATEGORIES[0]?.id || "mia");
  const [cart, setCart] = useState<Record<string, CartLine>>({});
  const [extraRedeemKey, setExtraRedeemKey] = useState<string | null>(null);
  /** Hồ Olympic: giỏ vé theo từng lần quét */
  const [scanCarts, setScanCarts] = useState<
    Record<string, Record<string, number>>
  >({});
  const [orderMsg, setOrderMsg] = useState("");
  const [ordering, setOrdering] = useState(false);
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
  const [guestSegment, setGuestSegment] = useState<"WALK_IN" | "MEMBER">(
    "MEMBER"
  );
  const [createGuestBusy, setCreateGuestBusy] = useState(false);
  const [createGuestError, setCreateGuestError] = useState("");
  const [guestReissuePassword, setGuestReissuePassword] = useState(false);
  const [guestAccountInfo, setGuestAccountInfo] = useState<{
    loginHint: string;
    temporaryPassword: string | null;
    customerCode: string;
    phone: string;
    created: boolean;
  } | null>(null);
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
  /** Giảm tay theo lần quét hồ */
  const [scanManualDiscount, setScanManualDiscount] = useState<
    Record<string, number>
  >({});
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
  const zoneName = picked?.name || "";
  const isMiaOi = zone === "MIA_OI";
  const isSpa = zone === "SAUNA";
  const isPool = zone === "OLYMPIC_POOL";
  const isLongNuong = zone === "LONG_NUONG";
  /** Menu phía trên — pool bán vé dưới từng lần quét */
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

  const poolScanGroups = useMemo(() => {
    const groups = new Map<string, Scan[]>();
    if (!isPool || !selected) return groups;
    for (const row of selected.todayScans || []) {
      if (row.eventType !== "SERVICE_USE") continue;
      const key = poolScanGroupKey(row);
      const list = groups.get(key);
      if (list) list.push(row);
      else groups.set(key, [row]);
    }
    for (const list of groups.values()) {
      list.sort(
        (a, b) => new Date(a.at).getTime() - new Date(b.at).getTime()
      );
    }
    return groups;
  }, [isPool, selected]);

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
    try {
      const res = await fetch(
        `/api/crm/desk?hours=12&zone=${encodeURIComponent(zone)}`,
        { cache: "no-store" }
      );
      if (res.status === 401 || res.status === 403) {
        setStep("login");
        setArrivals([]);
        return;
      }
      const data = await res.json();
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
    if (step !== "dashboard" || !zone) return;
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

  function chooseZone(z: DeskZone) {
    setPicked(z);
    setUsername(z.username);
    setPassword("");
    setLoginError("");
    setError("");
    setArrivals([]);
    setSelected(null);
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
      const zoneAdmin = isZoneDeskAdmin(user, picked.code);
      const deskZone = String(user?.deskZone || "").toUpperCase();
      if (!admin && deskZone !== picked.code) {
        await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
        throw new Error(
          `Tài khoản này không phải khu ${picked.name}. Dùng ${picked.username}, ${zoneAdminUsername(picked.username)} hoặc ADMINISTRATION.`
        );
      }
      setIsAdmin(!!admin || zoneAdmin);
      setIsSystemAdminUser(!!admin);
      setPassword("");
      setStep("dashboard");
      await load();
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

  function openCustomer(a: Arrival, cart?: GuestCartPreview | null) {
    setSelected(a);
    setCart({});
    setExtraRedeemKey(null);
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
    const pick =
      cart ||
      a.carts?.find((c) => c.status === "PENDING_APPROVAL") ||
      a.openCart ||
      a.carts?.[0] ||
      null;
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
          segment: guestSegment,
          reissuePassword: guestReissuePassword,
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
          : cust.segment === "MEMBER" || fromList?.segment === "MEMBER"
            ? "MEMBER"
            : "WALK_IN";
      const arrival: Arrival =
        fromList || {
          id: cust.id,
          customerCode: cust.customerCode,
          fullName: cust.fullName,
          phone: cust.phone,
          shortId: cust.shortId,
          segment,
          segmentLabel:
            cust.segmentLabel ||
            (segment === "MEMBER" ? "Member" : "Khách lẻ"),
          updatedAt: new Date().toISOString(),
          lastVisitAt: new Date().toISOString(),
          pendingAdmin: false,
          checkedIn: true,
          todayScans: [],
          todayOrders: [],
          todayPackageVnd: 0,
          todayScanCount: 0,
          todayOrderCount: 0,
        };
      setGuestAccountInfo({
        loginHint: String(data.loginHint || ""),
        temporaryPassword: data.temporaryPassword
          ? String(data.temporaryPassword)
          : null,
        customerCode: cust.customerCode,
        phone: cust.phone || phone,
        created: !!data.created,
      });
      setGuestName("");
      setGuestPhone("");
      setGuestReissuePassword(false);
      openCustomer(arrival);
      setOrderMsg(data.message || "Đã lưu khách + tài khoản app.");
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
    } | null
  ) {
    if (!cartPayload) {
      setGuestCart(null);
      setExtraRedeemKey(null);
      return;
    }
    const rawItems = Array.isArray(cartPayload.items)
      ? (cartPayload.items as {
          id?: string;
          nameVi?: string;
          qty?: number;
          priceVnd?: number;
        }[])
      : [];
    const items = rawItems
      .map((i) => ({
        id: String(i.id || "").trim(),
        nameVi: String(i.nameVi || "").trim(),
        qty: Math.max(1, Number(i.qty) || 1),
        priceVnd: Math.max(0, Number(i.priceVnd) || 0),
      }))
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
    });
    if (hasCatalog && zone !== "MIA_OI") {
      const next: Record<string, CartLine> = {};
      for (const it of items) {
        const menuItem = catalogMenu.find((m) => m.id === it.id);
        if (!menuItem) continue;
        next[lineKey(menuItem.id, false)] = {
          itemId: menuItem.id,
          qty: it.qty,
        };
      }
      if (Object.keys(next).length) setCart(next);
    }
    setOrderMsg(
      `Đã tải giỏ QR khách${
        cartPayload.totalVnd
          ? ` · ${formatVnd(Number(cartPayload.totalVnd))}`
          : ""
      }`
    );
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
              ? `Đã xác nhận thanh toán trước · được làm món${
                  data.cart?.totalVnd
                    ? ` · ${formatVnd(Number(data.cart.totalVnd))}`
                    : ""
                }`
              : `Đã xác nhận thanh toán — được làm món${
                  data.cart?.totalVnd
                    ? ` · ${formatVnd(Number(data.cart.totalVnd))}`
                    : ""
                }`
          );
        } else if (data.table?.activated && data.table?.resource) {
          setOrderMsg(
            data.table.already
              ? `${data.table.resource.name} đang hoạt động`
              : `Đã kích hoạt ${data.table.resource.name} — bàn chuyển đỏ (đang dùng)`
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

  function scanCartTotal(scanId: string) {
    const row = scanCarts[scanId] || {};
    const lines = Object.entries(row)
      .filter(([, q]) => q > 0)
      .map(([itemId, qty]) => ({ itemId, qty }));
    const priced = computePoolPricing(lines, {
      manualDiscountVnd: scanManualDiscount[scanId] || 0,
    });
    const qty = priced.lines.reduce((s, l) => s + l.qty, 0);
    return {
      sum: priced.totalVnd,
      qty,
      subtotal: priced.subtotalVnd,
      accessoryDiscount: priced.accessoryDiscountVnd,
      manualDiscount: priced.manualDiscountVnd,
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
    if (poolOrderLocked()) {
      setError("Đơn đã xác thực. Không mua thêm.");
      return;
    }
    const row = scanCarts[scan.id] || {};
    const added = Object.entries(row)
      .filter(([, q]) => q > 0)
      .map(([itemId, qty]) => ({ itemId, qty }));
    const fromCart = approvedCartPoolLines();
    const items =
      mode === "cart" ? fromCart : mergePoolLines(fromCart, added);
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
          manualDiscountVnd: scanManualDiscount[scan.id] || 0,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Không xác thực được");
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
      setScanManualDiscount((prev) => {
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
    const todayTickets = deskTickets.filter((t) => {
      if (!t.scanAt) return false;
      return new Date(t.scanAt).getTime() >= start.getTime();
    });
    const bills: DayBill[] = todayTickets.map((t) => ({
      customerName: t.arrival.fullName || "Khách",
      phone: t.arrival.phone,
      shortId: t.arrival.shortId,
      segmentLabel: t.arrival.segmentLabel,
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

  function setQty(item: CatalogItem, qty: number, useAlt = false) {
    const key = lineKey(item.id, useAlt);
    if (qty <= 0) {
      setExtraRedeemKey((prev) => (prev === key ? null : prev));
    }
    setCart((prev) => {
      const next = { ...prev };
      if (qty <= 0) delete next[key];
      else
        next[key] = {
          itemId: item.id,
          qty: Math.min(qty, 99),
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

  async function markSeen() {
    if (!selected || !zone) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/crm/desk/${selected.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          confirm: true,
          segment: selected.segment,
          zone,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  function poolOrderLocked() {
    if (!isPool || !selected) return false;
    return (selected.todayScans || []).some(
      (s) => !!s.ticketVerified || !!s.orderId
    );
  }

  function miaOrderLocked() {
    if (!isMiaOi) return false;
    if (guestConfirmedBill) return true;
    if (String(guestCart?.status || "") === "USED") return true;
    return (selected?.todayOrders || []).some((o) => o.status !== "CANCELLED");
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
    return guestCart.items.some(
      (it) =>
        !it.id.startsWith("voucher-") && !it.id.startsWith("points-redeem-")
    );
  }

  function extraRedeemSelection() {
    if (!isMiaOi || !extraRedeemKey) return null;
    if ((selected?.pointsBalance ?? 0) < 50) return null;
    const line = cart[extraRedeemKey];
    if (!line || line.qty < 1) return null;
    const item = MIAOI_MENU.find((i) => i.id === line.itemId);
    if (!item) return null;
    const unit =
      line.useAltPrice && item.priceAltVnd ? item.priceAltVnd : item.priceVnd;
    if (unit <= 0 || unit > REDEEM_DRINK_MAX_VND) return null;
    return {
      itemId: line.itemId,
      useAltPrice: !!line.useAltPrice,
      unit,
    };
  }

  async function confirmMiaCart(mode: "cart" | "added") {
    if (!selected || !guestCart?.token || !miaCartOpen() || ordering) return;
    const extras = mode === "added" ? cartLines : [];
    const redeem = mode === "added" ? extraRedeemSelection() : null;
    if (mode === "added" && extras.length === 0) {
      setError("Chọn món gọi thêm, hoặc bấm xác nhận giỏ.");
      return;
    }
    setOrdering(true);
    setOrderMsg("");
    setError("");
    try {
      const res = await fetch("/api/crm/miaoi/confirm-cart", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          zone: "MIA_OI",
          token: guestCart.token,
          extraItems: extras,
          pointsRedeem: redeem
            ? {
                tier: 50,
                itemId: redeem.itemId,
                useAltPrice: redeem.useAltPrice,
              }
            : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Không xác nhận được");
      setCart({});
      setExtraRedeemKey(null);
      setGuestCart((prev) => (prev ? { ...prev, status: "USED" } : prev));
      if (typeof data.pointsBalance === "number") {
        setSelected((prev) =>
          prev ? { ...prev, pointsBalance: data.pointsBalance } : prev
        );
      }
      setOrderMsg(
        `Đã xác nhận · ${formatVnd(data.order?.totalVnd || guestCart.totalVnd)}`
      );
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không xác nhận được");
    } finally {
      setOrdering(false);
    }
  }

  async function saveOrder() {
    if (!selected || !hasCatalog || isPool || cartLines.length === 0) return;
    if (miaOrderLocked()) return;
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
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Không lưu được đơn");
      setCart({});
      setOrderMsg(
        `Đã lưu · ${formatVnd(data.order?.totalVnd || cartTotal)} · order thêm = hàng mới trên bảng`
      );
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
            {DESK_ZONES.map((z) => (
              <button
                key={z.code}
                type="button"
                onClick={() => chooseZone(z)}
                style={{
                  ...styles.zoneBtn,
                  borderColor:
                    z.code === "MIA_OI"
                      ? "#b45309"
                      : z.code === "SAUNA"
                        ? "#1b3022"
                        : z.code === "OLYMPIC_POOL"
                          ? "#0c4a6e"
                          : z.code === "SWIM_LESSON"
                            ? "#0369a1"
                            : "#e2e8f0",
                  background:
                    z.code === "MIA_OI"
                      ? "#fff7ed"
                      : z.code === "SAUNA"
                        ? "#eef5f0"
                        : z.code === "OLYMPIC_POOL"
                          ? "#e0f2fe"
                          : z.code === "SWIM_LESSON"
                            ? "#e0f2fe"
                            : "#f1f5f9",
                }}
              >
                <strong style={{ fontSize: 15, textTransform: "lowercase" }}>
                  {z.name}
                </strong>
              </button>
            ))}
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
          <p style={styles.eyebrow}>Khu vực · {picked.name}</p>
          <h1 style={styles.h1}>Đăng nhập</h1>
          <p style={styles.mute}>
            Acc khu: <strong>{picked.username}</strong>
            <br />
            Acc admin khu:{" "}
            <strong>{zoneAdminUsername(picked.username)}</strong> · mk{" "}
            <strong>12345678</strong>
            <br />
            Hoặc <strong>ADMINISTRATION</strong> (mọi khu).
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
  const poolLocked = poolOrderLocked();
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
              ? `${deskTickets.length} dòng · ${openOrderCount} chưa order · ${pendingApprovalCount} chờ duyệt`
              : `${arrivals.length} khách · ${pendingApprovalCount} chờ duyệt`}
            {pendingApprovalCount > 0
              ? " · bấm Xác nhận để mở QR cho khách"
              : ""}
            {isMiaOi
              ? " · duyệt QR → mở khách → Xác nhận (gọi thêm nếu cần) mới làm món"
              : ""}
            {isSpa ? " · bấm dòng để chọn spa" : ""}
            {isPool ? " · sau duyệt: Quét QR khách → Xác thực = check-in" : ""}
            {zone === "PICKLEBALL"
              ? " · duyệt đặt sân online · ghi khách tại quầy trên lịch · Kết thúc = reset sân"
              : ""}
            {zone === "LONG_NUONG"
              ? " · bảng dưới = duyệt mã · sơ đồ bàn mở bằng nút riêng"
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
          zone !== "PICKLEBALL" ? (
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
            style={{ ...styles.actionBtn, background: "#1d4ed8" }}
            onClick={() => {
              setCreateGuestError("");
              setGuestName("");
              setGuestPhone("");
              setGuestSegment("MEMBER");
              setGuestReissuePassword(false);
              setGuestAccountInfo(null);
              setCreateGuestOpen(true);
            }}
          >
            Thêm Member
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
                <h2 style={{ margin: 0, fontSize: 20 }}>Thêm Member</h2>
                <p style={{ ...styles.mute, marginTop: 4 }}>
                  Tạo tài khoản app (đăng nhập bằng SĐT) + hiện trên dashboard
                  khu.
                </p>
              </div>
              <button
                type="button"
                style={styles.closeBtn}
                disabled={createGuestBusy}
                onClick={() => {
                  setCreateGuestOpen(false);
                  setGuestAccountInfo(null);
                }}
              >
                Đóng
              </button>
            </div>
            {guestAccountInfo ? (
              <div style={{ display: "grid", gap: 12 }}>
                <div
                  style={{
                    padding: 14,
                    borderRadius: 14,
                    background: "#ecfdf5",
                    border: "1px solid #a7f3d0",
                  }}
                >
                  <p style={{ margin: 0, fontWeight: 800, color: "#047857" }}>
                    {guestAccountInfo.created
                      ? "Đã tạo tài khoản My Oasis"
                      : "Đã mở khách trên dashboard"}
                  </p>
                  <p style={{ ...styles.mute, marginTop: 8 }}>
                    Mã khách: <strong>{guestAccountInfo.customerCode}</strong>
                    <br />
                    Đăng nhập app: <strong>{guestAccountInfo.phone}</strong>
                  </p>
                  {guestAccountInfo.temporaryPassword ? (
                    <p
                      style={{
                        margin: "10px 0 0",
                        padding: 10,
                        borderRadius: 10,
                        background: "#fff",
                        fontFamily: "ui-monospace, monospace",
                        fontWeight: 800,
                        fontSize: 15,
                      }}
                    >
                      Mật khẩu tạm: {guestAccountInfo.temporaryPassword}
                    </p>
                  ) : null}
                  <p style={{ ...styles.mute, marginTop: 8, fontSize: 12 }}>
                    {guestAccountInfo.loginHint}
                  </p>
                </div>
                <button
                  type="button"
                  style={{ ...styles.btn, background: "#1d4ed8" }}
                  onClick={() => {
                    setGuestAccountInfo(null);
                    setCreateGuestOpen(false);
                  }}
                >
                  Đã ghi — đóng
                </button>
              </div>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
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
                    autoFocus
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
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    type="button"
                    disabled={createGuestBusy}
                    onClick={() => setGuestSegment("MEMBER")}
                    style={{
                      ...styles.ghost,
                      flex: 1,
                      background:
                        guestSegment === "MEMBER" ? "#dbeafe" : "#fff",
                      borderColor:
                        guestSegment === "MEMBER" ? "#2563eb" : "#cbd5e1",
                      fontWeight: 800,
                    }}
                  >
                    Member
                  </button>
                  <button
                    type="button"
                    disabled={createGuestBusy}
                    onClick={() => setGuestSegment("WALK_IN")}
                    style={{
                      ...styles.ghost,
                      flex: 1,
                      background:
                        guestSegment === "WALK_IN" ? "#ffedd5" : "#fff",
                      borderColor:
                        guestSegment === "WALK_IN" ? "#ea580c" : "#cbd5e1",
                      fontWeight: 800,
                    }}
                  >
                    Khách lẻ
                  </button>
                </div>
                <label
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 8,
                    fontSize: 12,
                    color: "#475569",
                    cursor: "pointer",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={guestReissuePassword}
                    onChange={(e) =>
                      setGuestReissuePassword(e.target.checked)
                    }
                    disabled={createGuestBusy}
                    style={{ marginTop: 2 }}
                  />
                  <span>
                    Nếu SĐT đã có tài khoản: cấp lại mật khẩu tạm = số điện
                    thoại
                  </span>
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
                  {createGuestBusy
                    ? "Đang tạo…"
                    : "Tạo tài khoản"}
                </button>
              </div>
            )}
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
            {pendingApprovalCount} chờ duyệt · {deskTickets.length} dòng
            {zone === "LONG_NUONG"
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
            {deskTickets.length === 0 ? (
              <tr>
                <td
                  colSpan={hasCatalog ? 10 : 9}
                  style={{ ...styles.td, color: "#64748b", padding: 28 }}
                >
                  Chưa có khách gửi yêu cầu / quét QR{" "}
                  <strong>{zoneName}</strong> trong 12 giờ.
                </td>
              </tr>
            ) : (
              deskTickets.map((t) => {
                const a = t.arrival;
                const needApprove = t.needsApproval;
                const cartTok = t.cart?.token || "";
                const ci = t.checkInUi;
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
                    onClick={() => openCustomer(a, t.cart)}
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
                            a.segment === "MEMBER" ? "#dbeafe" : "#f1f5f9",
                          color:
                            a.segment === "MEMBER" ? "#1d4ed8" : "#334155",
                        }}
                      >
                        {a.segmentLabel}
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
                      <div style={{ fontWeight: 800, color: "#0f172a" }}>
                        {t.billTotal != null
                          ? formatVnd(t.billTotal)
                          : "—"}
                      </div>
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
                      {t.hasVoucher || t.hasPointsRedeem ? (
                        <span
                          style={{
                            ...styles.badge,
                            background: t.hasPointsRedeem
                              ? "#fef3c7"
                              : "#ecfdf5",
                            color: t.hasPointsRedeem ? "#b45309" : "#047857",
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
                      ) : typeof a.pointsBalance === "number" &&
                        a.pointsBalance > 0 ? (
                        <span
                          style={{
                            fontSize: 12,
                            fontWeight: 700,
                            color: "#64748b",
                          }}
                          title="Số điểm trong ví (chưa áp trên QR này)"
                        >
                          {a.pointsBalance} điểm
                        </span>
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
                    <td style={styles.td}>
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
        <div style={styles.modalBackdrop} onClick={() => setSelected(null)}>
          <div
            style={{ ...styles.modal, width: "min(860px, 100%)" }}
            onClick={(e) => e.stopPropagation()}
          >
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
                {(isMiaOi || isPool || isAdmin) && selected ? (
                  <button
                    type="button"
                    style={{
                      ...styles.btn,
                      flex: "0 0 auto",
                      background: "#b45309",
                      height: 36,
                      padding: "0 12px",
                      fontSize: 13,
                    }}
                    onClick={() => void openRedeem(isPool ? 100 : 50)}
                  >
                    Đổi điểm
                  </button>
                ) : null}
                <button
                  type="button"
                  style={styles.closeBtn}
                  onClick={() => setSelected(null)}
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
                    : guestConfirmedBill
                      ? "Đơn đã xác thực"
                      : "Giỏ QR đã duyệt"}
                  {guestCart.zoneName ? ` · ${guestCart.zoneName}` : ""}
                </p>
                <ul
                  style={{
                    margin: "8px 0 0",
                    padding: "0 0 0 18px",
                    fontSize: 13,
                    color: "#334155",
                  }}
                >
                  {(guestConfirmedBill
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
                    : foldPointsOntoItems(
                        guestCart.items.map((it) => ({
                          id: it.id,
                          nameVi: it.nameVi,
                          qty: it.qty,
                          unitPriceVnd: it.priceVnd,
                        }))
                      )
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
                {(guestConfirmedBill
                  ? guestConfirmedBill.totalVnd || 0
                  : guestCart.totalVnd) ? (
                  <p
                    style={{
                      margin: "10px 0 0",
                      fontWeight: 800,
                      fontSize: 14,
                    }}
                  >
                    Tổng{" "}
                    {formatVnd(
                      guestConfirmedBill
                        ? guestConfirmedBill.totalVnd || 0
                        : guestCart.totalVnd
                    )}
                  </p>
                ) : null}
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

            {miaOrderLocked() ? null : hasCatalog ? (
              <>
                <p style={{ marginTop: 18, marginBottom: 8, fontWeight: 800 }}>
                  {isMiaOi && miaCartOpen()
                    ? "Gọi thêm — tuỳ chọn"
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
                      const unit =
                        useAlt && item.priceAltVnd
                          ? item.priceAltVnd
                          : item.priceVnd;
                      const canRedeemExtra =
                        isMiaOi &&
                        miaCartOpen() &&
                        q > 0 &&
                        unit > 0 &&
                        unit <= REDEEM_DRINK_MAX_VND &&
                        (selected?.pointsBalance ?? 0) >= 50;
                      const redeemOn = canRedeemExtra && extraRedeemKey === rowKey;
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
                            </div>
                          </div>
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 8,
                            }}
                          >
                            {canRedeemExtra ? (
                              <button
                                type="button"
                                onClick={() =>
                                  setExtraRedeemKey(redeemOn ? null : rowKey)
                                }
                                style={{
                                  height: 32,
                                  padding: "0 8px",
                                  borderRadius: 10,
                                  border: redeemOn
                                    ? "1px solid #f59e0b"
                                    : "1px solid #e2e8f0",
                                  background: redeemOn ? "#fffbeb" : "#fff",
                                  color: "#b45309",
                                  fontSize: 11,
                                  fontWeight: 800,
                                  cursor: "pointer",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {redeemOn ? "✓ Đổi 50 điểm" : "Đổi 50 điểm"}
                              </button>
                            ) : null}
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
                              style={styles.qtyBtn}
                              onClick={() => setQty(item, q + 1, useAlt)}
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
                    flexWrap: "nowrap",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 12,
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 800, whiteSpace: "nowrap" }}>
                      {cartLines.length
                        ? `${isMiaOi && miaCartOpen() ? "Gọi thêm " : ""}${cartLines.reduce((n, l) => n + l.qty, 0)} ${catalogUnit()} · ${formatVnd(Math.max(0, cartTotal - (extraRedeemSelection()?.unit || 0)))}${extraRedeemSelection() ? " · Đổi 50 điểm" : ""}`
                        : isMiaOi && miaCartOpen()
                          ? "Không gọi thêm"
                          : `Chưa chọn ${catalogUnit()}`}
                    </div>
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
                  {isMiaOi && miaCartOpen() ? (
                    <div
                      style={{
                        display: "flex",
                        gap: 8,
                        flexWrap: "nowrap",
                        flex: "0 0 auto",
                      }}
                    >
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
                    <button
                      type="button"
                      style={{
                        ...styles.btn,
                        flex: "0 0 auto",
                        background: accentColor(),
                        opacity: cartLines.length && !ordering ? 1 : 0.45,
                      }}
                      disabled={!cartLines.length || ordering}
                      onClick={() => void saveOrder()}
                    >
                      {ordering ? "Đang lưu…" : "Lưu đơn"}
                    </button>
                  )}
                </div>
              </>
            ) : null}

            <p style={{ marginTop: 18, marginBottom: 8, fontWeight: 800 }}>
              Lịch sử khu này hôm nay
            </p>
            {orderMsg && isPool ? (
              <p
                style={{
                  margin: "0 0 10px",
                  fontSize: 13,
                  color: "#047857",
                  fontWeight: 700,
                }}
              >
                {orderMsg}
              </p>
            ) : null}

            {hasCatalog ? (
              (() => {
                type HistRow = {
                  key: string;
                  at: string;
                  title: string;
                  status: string;
                  statusColor: string;
                  detail: string | null;
                  promo: string | null;
                  total: number | null;
                  note: string | null;
                  orderId: string | null;
                };
                const rows: HistRow[] = [];
                const confirmedBills = confirmedPoolBills(selected.todayScans || []);
                const usedCarts = (selected.carts || []).filter(
                  (c) => c.status === "USED"
                ).length;
                for (const cart of selected.carts || []) {
                  if (
                    matchConfirmedBill(confirmedBills, cart, usedCarts)
                  ) {
                    continue;
                  }
                  const promo = parseCartPromo(cart.items);
                  const views = foldPointsOntoItems(
                    (cart.items || []).map((i) => ({
                      id: i.id,
                      nameVi: i.nameVi,
                      qty: i.qty,
                      unitPriceVnd: i.priceVnd,
                    }))
                  );
                  const detail = views.length
                    ? views
                        .map(
                          (v) =>
                            `${v.qty}× ${v.nameVi} · ${formatVnd(v.netVnd)}${v.pointsLabel ? ` · ${v.pointsLabel}` : ""}`
                        )
                        .join(", ")
                    : null;
                  const promoClean = promo.hasVoucher ? "Voucher" : null;
                  const st = cart.status || "—";
                  const statusColor =
                    st === "USED"
                      ? "#047857"
                      : st === "REJECTED" ||
                          st === "CANCELLED" ||
                          st === "NO_SHOW"
                        ? "#b91c1c"
                        : st === "PENDING_APPROVAL" || st === "OPEN"
                          ? "#b45309"
                          : "#64748b";
                  rows.push({
                    key: `cart-${cart.token}`,
                    at: cart.createdAt || selected.updatedAt,
                    title: "Yêu cầu QR",
                    status: cartOrderLabel(st, zone, true, cart.adminNote),
                    statusColor,
                    detail,
                    promo: promoClean,
                    total: cart.totalVnd ?? null,
                    note:
                      st === "REJECTED" && cart.adminNote
                        ? cart.adminNote
                        : null,
                    orderId: null,
                  });
                }
                for (const o of selected.todayOrders || []) {
                  rows.push({
                    key: `ord-${o.id}`,
                    at: o.at,
                    title: "Đơn order",
                    status: o.status,
                    statusColor:
                      o.status === "CANCELLED" ? "#b91c1c" : "#047857",
                    detail: billFromItems(o.items, o.totalVnd),
                    promo: null,
                    total: o.totalVnd,
                    note: null,
                    orderId: o.id,
                  });
                }
                rows.sort(
                  (a, b) =>
                    new Date(b.at).getTime() - new Date(a.at).getTime()
                );
                if (!rows.length) {
                  return (
                    <p style={styles.mute}>
                      Chưa có yêu cầu / đơn nào hôm nay.
                    </p>
                  );
                }
                return (
                  <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
                    {rows.map((r) => (
                      <li
                        key={r.key}
                        style={{
                          padding: "12px 0",
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
                          <div style={{ minWidth: 0 }}>
                            <strong>{r.title}</strong>
                            <span
                              style={{
                                marginLeft: 8,
                                fontSize: 12,
                                fontWeight: 700,
                                color: r.statusColor,
                              }}
                            >
                              {r.status}
                            </span>
                            {r.detail ? (
                              <p
                                style={{
                                  margin: "4px 0 0",
                                  fontSize: 13,
                                  color: "#334155",
                                  lineHeight: 1.4,
                                }}
                              >
                                {r.detail}
                                {r.total != null && !r.detail.includes("đ")
                                  ? ` · ${formatVnd(r.total)}`
                                  : ""}
                              </p>
                            ) : r.total != null ? (
                              <p
                                style={{
                                  margin: "4px 0 0",
                                  fontSize: 13,
                                  color: "#64748b",
                                }}
                              >
                                {formatVnd(r.total)}
                              </p>
                            ) : null}
                            {r.promo ? (
                              <p
                                style={{
                                  margin: "4px 0 0",
                                  fontSize: 12,
                                  fontWeight: 700,
                                  color: "#b45309",
                                }}
                              >
                                {r.promo}
                              </p>
                            ) : null}
                            {r.note ? (
                              <p
                                style={{
                                  margin: "4px 0 0",
                                  fontSize: 12,
                                  color: "#b91c1c",
                                }}
                              >
                                Lý do: {r.note}
                              </p>
                            ) : null}
                          </div>
                          <div
                            style={{
                              display: "flex",
                              flexDirection: "column",
                              alignItems: "flex-end",
                              gap: 8,
                              flexShrink: 0,
                            }}
                          >
                            <span
                              style={{
                                fontFamily: "ui-monospace, monospace",
                                fontWeight: 700,
                              }}
                            >
                              {formatTime(r.at)}
                            </span>
                            {isMiaOi &&
                            r.orderId &&
                            r.status !== "CANCELLED" ? (
                              <button
                                type="button"
                                style={{
                                  ...styles.ghost,
                                  padding: "6px 10px",
                                  fontSize: 12,
                                }}
                                disabled={cancellingOrderId === r.orderId}
                                onClick={() => void cancelMiaOrder(r.orderId!)}
                              >
                                {cancellingOrderId === r.orderId
                                  ? "…"
                                  : "Huỷ đơn"}
                              </button>
                            ) : null}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                );
              })()
            ) : selected.todayScans?.length ? (
              <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
                {selected.todayScans.map((s) => {
                  const verified = !!s.ticketVerified || !!s.orderSummary;
                  const poolGroup =
                    isPool && s.eventType === "SERVICE_USE"
                      ? poolScanGroups.get(poolScanGroupKey(s)) || [s]
                      : [s];
                  if (
                    isPool &&
                    s.eventType === "SERVICE_USE" &&
                    s.id !== poolGroup[0]?.id
                  ) {
                    return null;
                  }
                  const totals = scanCartTotal(s.id);
                  const { sum, qty } = totals;
                  const busy = verifyingScanId === s.id;
                  const cartLines = guestCartLines;
                  return (
                    <li
                      key={s.id}
                      style={{
                        padding: "12px 0",
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
                          <strong>{s.serviceName}</strong>
                          <span
                            style={{
                              marginLeft: 8,
                              fontSize: 12,
                              fontWeight: 700,
                              color: verified ? "#047857" : "#b45309",
                            }}
                          >
                            {verified ? "Đã xác thực" : "Chưa xác thực"}
                            {poolGroup.length > 1
                              ? ` · gộp ${poolGroup.length} lần quét`
                              : ""}
                          </span>
                          {s.orderSummary ? (
                            <p
                              style={{
                                margin: "2px 0 0",
                                fontSize: 13,
                                color: "#64748b",
                              }}
                            >
                              {s.orderSummary}
                              {s.totalVnd
                                ? ` · ${formatVnd(s.totalVnd)}`
                                : ""}
                            </p>
                          ) : null}
                          {isPool && verified ? (
                            <div
                              style={{
                                marginTop: 8,
                                display: "flex",
                                gap: 8,
                                flexWrap: "wrap",
                              }}
                            >
                              <button
                                type="button"
                                style={{
                                  ...styles.ghost,
                                  padding: "8px 12px",
                                  fontSize: 13,
                                  opacity: busy ? 0.5 : 1,
                                }}
                                disabled={busy}
                                onClick={() => void undoPoolScan(s)}
                              >
                                {busy ? "…" : "Undo"}
                              </button>
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
                                onClick={() => sendPoolBill(s)}
                              >
                                In bill
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
                          {formatTime(s.at)}
                        </span>
                      </div>

                      {isPool && !verified && !poolLocked ? (
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
                            {POOL_MENU.map((item) => {
                              const q = scanQty(s.id, item.id);
                              return (
                                <div key={item.id} style={styles.menuRow}>
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontWeight: 700, fontSize: 14 }}>
                                      {item.nameVi}
                                    </div>
                                    <div
                                      style={{
                                        fontSize: 12,
                                        color: "#64748b",
                                      }}
                                    >
                                      {formatPoolPrice(item)}
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
                                      disabled={q <= 0 || busy}
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
                                      disabled={busy}
                                    >
                                      +
                                    </button>
                                  </div>
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
                            <label
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 8,
                                fontSize: 13,
                              }}
                            >
                              <span style={{ color: "#64748b", minWidth: 90 }}>
                                Giảm tay (đ)
                              </span>
                              <input
                                type="number"
                                min={0}
                                step={1000}
                                value={scanManualDiscount[s.id] || ""}
                                placeholder="0"
                                onChange={(e) => {
                                  const n = Math.max(
                                    0,
                                    Math.round(Number(e.target.value) || 0)
                                  );
                                  setScanManualDiscount((prev) => ({
                                    ...prev,
                                    [s.id]: n,
                                  }));
                                }}
                                style={{
                                  flex: 1,
                                  height: 36,
                                  borderRadius: 10,
                                  border: "1px solid #cbd5e1",
                                  padding: "0 10px",
                                  fontSize: 14,
                                }}
                              />
                            </label>
                            <div
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                                gap: 10,
                              }}
                            >
                              <div style={{ fontWeight: 800, fontSize: 13 }}>
                                {qty ? (
                                  <>
                                    Mua thêm {qty} món · {formatVnd(sum)}
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
                                    {totals.manualDiscount > 0 ? (
                                      <span
                                        style={{
                                          display: "block",
                                          fontWeight: 600,
                                          fontSize: 12,
                                          color: "#b45309",
                                        }}
                                      >
                                        Giảm tay (−
                                        {formatVnd(totals.manualDiscount)})
                                      </span>
                                    ) : null}
                                  </>
                                ) : cartLines.length ? (
                                  "Không mua thêm"
                                ) : (
                                  "Chưa chọn vé"
                                )}
                              </div>
                              <div style={{ display: "flex", gap: 8 }}>
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
                                    onClick={() => void verifyPoolScan(s, "cart")}
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
                                  onClick={() => void verifyPoolScan(s, "added")}
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
            ) : (
              <p style={styles.mute}>Chưa có lần quét nào hôm nay.</p>
            )}

            {selected.pendingAdmin ? (
              <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
                <button
                  type="button"
                  style={styles.btn}
                  disabled={saving}
                  onClick={() => void markSeen()}
                >
                  {saving ? "Đang lưu…" : "Đã xem"}
                </button>
              </div>
            ) : null}
          </div>
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
    fontWeight: 800,
    fontSize: 14,
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
