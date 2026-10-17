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

type CatalogItem = MiaOiMenuItem | SpaMenuItem;

type ScanTicketItem = {
  nameVi: string;
  qty: number;
  unitPriceVnd: number;
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
  billItems: { nameVi: string; qty: number; priceVnd?: number }[];
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
  withCatalog: boolean
) {
  const z = (zoneCode || "").toUpperCase();
  if (status === "USED") {
    return z === "MIA_OI" ? "Đã TT · làm món" : "Đã dùng";
  }
  if (status === "OPEN") {
    if (z === "MIA_OI") return "Đã duyệt · chờ TT";
    return withCatalog ? "Đã duyệt · chờ order" : "Đã duyệt";
  }
  if (status === "PENDING_APPROVAL") return "Chờ duyệt";
  if (status === "REJECTED") return "Từ chối";
  if (status === "CANCELLED") return "Khách xoá";
  if (status === "NO_SHOW") return "Không tới";
  return status || "—";
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
      for (const cart of carts) {
        const ui = checkInUiFromCart({
          status: cart.status || "OPEN",
          expiresAt: cart.expiresAt,
          zoneCode: cart.zoneCode || zoneCode || undefined,
        });
        const need = cart.status === "PENDING_APPROVAL";
        const billItems = (cart.items || [])
          .filter(
            (i) =>
              !String(i.id || "").startsWith("voucher-") &&
              !String(i.id || "").startsWith("points-redeem-")
          )
          .map((i) => ({
            nameVi: i.nameVi,
            qty: i.qty,
            priceVnd: i.priceVnd,
          }));
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
          orderLabel: cartOrderLabel(cart.status, zoneCode, withCatalog),
          billText:
            cart.billText ||
            billItems.map((i) => `${i.qty}× ${i.nameVi}`).join(", ") ||
            "—",
          billTotal: cart.totalVnd,
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
          billItems: order.items.map((it) => ({
            nameVi: it.nameVi,
            qty: it.qty,
            priceVnd: it.unitPriceVnd,
          })),
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
  /** Hồ Olympic: giỏ vé theo từng lần quét */
  const [scanCarts, setScanCarts] = useState<
    Record<string, Record<string, number>>
  >({});
  const [orderMsg, setOrderMsg] = useState("");
  const [ordering, setOrdering] = useState(false);
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
  /** Claim voucher Spa / LN theo SĐT */
  const [claimOpen, setClaimOpen] = useState(false);
  const [claimPhone, setClaimPhone] = useState("");
  const [claimBusy, setClaimBusy] = useState(false);
  const [claimError, setClaimError] = useState("");
  const [claimCustomer, setClaimCustomer] = useState<{
    id: string;
    fullName: string | null;
    phone: string | null;
    pointsBalance?: number;
  } | null>(null);
  const [claimWallet, setClaimWallet] = useState<
    {
      offerId: string;
      title: string;
      subtitle: string;
      claimId: string;
    }[]
  >([]);
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

  const zone = picked?.code || null;
  const zoneName = picked?.name || "";
  const isMiaOi = zone === "MIA_OI";
  const isSpa = zone === "SAUNA";
  const isPool = zone === "OLYMPIC_POOL";
  const isLongNuong = zone === "LONG_NUONG";
  /** Claim quầy đã tắt — khách Collect trên Home */
  const canClaimOffers = false;
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

  const openOrderCount = useMemo(
    () => deskTickets.filter((t) => t.orderStatus === "pending" && hasCatalog).length,
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
    if (hasCatalog) {
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

  async function verifyPoolScan(scan: Scan) {
    if (!selected || !isPool) return;
    const row = scanCarts[scan.id] || {};
    const items = Object.entries(row)
      .filter(([, q]) => q > 0)
      .map(([itemId, qty]) => ({ itemId, qty }));
    if (!items.length) {
      setError("Chọn ít nhất 1 vé trước khi xác thực.");
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
      setScanCarts((prev) => {
        const next = { ...prev };
        delete next[scan.id];
        return next;
      });
      setScanManualDiscount((prev) => {
        const next = { ...prev };
        delete next[scan.id];
        return next;
      });
      patchSelectedScan(scan.id, {
        ticketVerified: true,
        orderSummary: data.orderSummary || null,
        totalVnd: data.order?.totalVnd ?? null,
        orderId: data.order?.id ?? null,
        ticketItems,
      });
      if (typeof data.pointsBalance === "number" && selected) {
        setSelected({ ...selected, pointsBalance: data.pointsBalance });
      }
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

  async function lookupClaimPhone() {
    if (!zone || !claimPhone.trim()) {
      setClaimError("Nhập SĐT khách.");
      return;
    }
    setClaimBusy(true);
    setClaimError("");
    setClaimCustomer(null);
    setClaimWallet([]);
    try {
      const q = new URLSearchParams({
        phone: claimPhone.trim(),
        zone,
      });
      const res = await fetch(`/api/crm/desk/offers?${q}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Không tìm thấy");
      setClaimCustomer(data.customer);
      setClaimWallet(Array.isArray(data.wallet) ? data.wallet : []);
    } catch (e) {
      setClaimError(e instanceof Error ? e.message : "Tra cứu thất bại");
    } finally {
      setClaimBusy(false);
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

  async function claimOffer(offerId: string) {
    if (!zone || !claimCustomer) return;
    if (!window.confirm("Claim voucher này tại quầy? Không hoàn lại.")) return;
    setClaimBusy(true);
    setClaimError("");
    try {
      const res = await fetch("/api/crm/desk/offers", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          zone,
          customerId: claimCustomer.id,
          offerId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Claim thất bại");
      setClaimWallet((prev) => prev.filter((v) => v.offerId !== offerId));
      void loadClaimHistory();
      setOrderMsg(`Đã claim · ${data.offerTitle || offerId}`);
    } catch (e) {
      setClaimError(e instanceof Error ? e.message : "Claim thất bại");
    } finally {
      setClaimBusy(false);
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
      patchSelectedScan(scan.id, {
        ticketVerified: false,
        orderSummary: null,
        totalVnd: null,
        orderId: null,
        ticketItems: [],
      });
      setOrderMsg(`Đã undo · ${formatTime(scan.at)}`);
      void load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không undo được");
    } finally {
      setVerifyingScanId(null);
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

  async function saveOrder() {
    if (!selected || !hasCatalog || isPool || cartLines.length === 0) return;
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
  return (
    <main style={styles.page}>
      <header style={styles.header}>
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
              ? " · duyệt QR → quét QR xác nhận TT mới làm món"
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
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {zone &&
          zone !== "SAUNA" &&
          zone !== "SPA" &&
          zoneHasResources(zone) &&
          zone !== "PICKLEBALL" ? (
            <button
              type="button"
              style={{
                ...styles.btn,
                background: "#7c2d12",
                height: 42,
                padding: "0 16px",
                fontSize: 14,
              }}
              onClick={() => setResourceMapOpen(true)}
            >
              {zone === "VIP_RESORT" ? "Sơ đồ VIP" : "Sơ đồ bàn"}
            </button>
          ) : null}
          <button
            type="button"
            style={{
              ...styles.btn,
              background: "#0f766e",
              height: 42,
              padding: "0 16px",
              fontSize: 14,
            }}
            onClick={() => {
              setScanError("");
              setManualToken("");
              setScanSession((n) => n + 1);
              setScanOpen(true);
            }}
          >
            Quét QR khách
          </button>
          <button
            type="button"
            style={{
              ...styles.btn,
              background: "#1d4ed8",
              height: 42,
              padding: "0 16px",
              fontSize: 14,
            }}
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
            + Member
          </button>
          <button
            type="button"
            style={styles.ghost}
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
            <button type="button" style={styles.ghost} onClick={backToPick}>
              Đổi khu
            </button>
          ) : null}
          <button type="button" style={styles.ghost} onClick={() => void load()}>
            Làm mới
          </button>
          <button type="button" style={styles.ghost} onClick={() => void logout()}>
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
                style={styles.ghost}
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
                gap: 12,
                marginBottom: 12,
              }}
            >
              <div>
                <h2 style={{ margin: 0, fontSize: 20 }}>+ Member</h2>
                <p style={{ ...styles.mute, marginTop: 4 }}>
                  Tạo tài khoản app (đăng nhập bằng SĐT) + hiện trên dashboard
                  khu.
                </p>
              </div>
              <button
                type="button"
                style={styles.ghost}
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
                    : "Tạo tài khoản + hiện dashboard"}
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
                style={styles.ghost}
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
                placeholder="oa_… / sc_… hoặc link /c/ /q/"
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
                style={{ ...styles.ghost, fontWeight: 800 }}
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

      <div style={styles.tableWrap}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            marginBottom: 8,
            gap: 8,
            flexWrap: "wrap",
          }}
        >
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>
            Yêu cầu / duyệt mã
          </h2>
          <span style={{ fontSize: 13, color: "#64748b" }}>
            {pendingApprovalCount} chờ duyệt · {deskTickets.length} dòng
            {zone === "LONG_NUONG"
              ? " · mở «Sơ đồ bàn» trên header khi cần"
              : ""}
          </span>
        </div>
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
                              {i.priceVnd != null
                                ? ` · ${formatVnd(i.priceVnd * i.qty)}`
                                : ""}
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
                            {approvingToken === cartTok ? "…" : "Duyệt"}
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
                            background: "#f1f5f9",
                            color: "#64748b",
                          }}
                        >
                          Khách xoá
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

      {selected ? (
        <div style={styles.modalBackdrop} onClick={() => setSelected(null)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
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
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {(isMiaOi || isPool || isAdmin) && selected ? (
                  <button
                    type="button"
                    style={{
                      ...styles.btn,
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
                  style={styles.ghost}
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
                  {guestCart.items.map((it) => (
                    <li key={`${it.id}-${it.nameVi}`}>
                      {it.qty}× {it.nameVi}
                      {it.priceVnd
                        ? ` · ${formatVnd(it.priceVnd * it.qty)}`
                        : ""}
                    </li>
                  ))}
                </ul>
                <div
                  style={{
                    marginTop: 10,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 10,
                  }}
                >
                  {guestCart.totalVnd ? (
                    <p style={{ margin: 0, fontWeight: 800, fontSize: 14 }}>
                      Tổng {formatVnd(guestCart.totalVnd)}
                    </p>
                  ) : (
                    <span />
                  )}
                  {guestCart.status === "PENDING_APPROVAL" && guestCart.token ? (
                    <div style={{ display: "flex", gap: 8 }}>
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
                        {approvingToken === guestCart.token ? "…" : "Duyệt"}
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
              </div>
            ) : null}

            {hasCatalog ? (
              <>
                <p style={{ marginTop: 18, marginBottom: 8, fontWeight: 800 }}>
                  {catalogTitle()}
                </p>
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
                      return (
                        <div
                          key={lineKey(item.id, useAlt)}
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
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 12,
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 800 }}>
                      {cartLines.length
                        ? `${cartLines.reduce((n, l) => n + l.qty, 0)} ${catalogUnit()} · ${formatVnd(cartTotal)}`
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
                };
                const rows: HistRow[] = [];
                for (const cart of selected.carts || []) {
                  const promo =
                    cart.promoLabel ||
                    parseCartPromo(cart.items).label;
                  const promoClean =
                    promo && promo !== "—" ? promo : null;
                  const menu = (cart.items || []).filter(
                    (i) =>
                      !String(i.id || "").startsWith("voucher-") &&
                      !String(i.id || "").startsWith("points-redeem-")
                  );
                  const detail =
                    cart.billText && cart.billText !== "—"
                      ? cart.billText
                      : menu.length
                        ? menu
                            .map((i) => `${i.qty}× ${i.nameVi}`)
                            .join(", ")
                        : null;
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
                    status: cartOrderLabel(st, zone, true),
                    statusColor,
                    detail,
                    promo: promoClean,
                    total: cart.totalVnd ?? null,
                    note:
                      st === "REJECTED" && cart.adminNote
                        ? cart.adminNote
                        : null,
                  });
                }
                for (const o of selected.todayOrders || []) {
                  rows.push({
                    key: `ord-${o.id}`,
                    at: o.at,
                    title: "Đơn order",
                    status: o.status,
                    statusColor: "#047857",
                    detail: billFromItems(o.items, o.totalVnd),
                    promo: null,
                    total: o.totalVnd,
                    note: null,
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
                          borderBottom: "1px solid #f1f5f9",
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
                          <span
                            style={{
                              fontFamily: "ui-monospace, monospace",
                              fontWeight: 700,
                              flexShrink: 0,
                            }}
                          >
                            {formatTime(r.at)}
                          </span>
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
                  const totals = scanCartTotal(s.id);
                  const { sum, qty } = totals;
                  const busy = verifyingScanId === s.id;
                  return (
                    <li
                      key={s.id}
                      style={{
                        padding: "12px 0",
                        borderBottom: "1px solid #f1f5f9",
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

                      {isPool && !verified ? (
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
                            Chọn vé → Xác thực (giữ giờ vào {formatTime(s.at)})
                          </p>
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
                                    {qty} món · {formatVnd(sum)}
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
                                ) : (
                                  "Chưa chọn vé"
                                )}
                              </div>
                              <button
                                type="button"
                                style={{
                                  ...styles.btn,
                                  flex: "0 0 auto",
                                  background: "#0c4a6e",
                                  opacity: qty && !busy ? 1 : 0.45,
                                }}
                                disabled={!qty || busy}
                                onClick={() => void verifyPoolScan(s)}
                              >
                                {busy ? "Đang lưu…" : "Xác thực"}
                              </button>
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

            <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
              {selected.pendingAdmin ? (
                <button
                  type="button"
                  style={styles.btn}
                  disabled={saving}
                  onClick={() => void markSeen()}
                >
                  {saving ? "Đang lưu…" : "Đã xem"}
                </button>
              ) : (
                <button
                  type="button"
                  style={styles.ghost}
                  onClick={() => setSelected(null)}
                >
                  Đóng
                </button>
              )}
            </div>
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
  tableWrap: {
    maxWidth: 1180,
    margin: "0 auto",
    background: "#fff",
    borderRadius: 18,
    overflow: "auto",
    boxShadow: "0 10px 30px rgba(15,23,42,.06)",
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
