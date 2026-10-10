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
import { printPoolBill } from "@/lib/pool-bill-print";
import {
  DESK_ZONES,
  dashboardTitle,
  getDeskZone,
  type DeskZone,
} from "@/lib/desk-zones";

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

type Arrival = {
  id: string;
  customerCode: string;
  fullName: string | null;
  phone: string | null;
  shortId: string | null;
  segment: string;
  segmentLabel: string;
  updatedAt: string;
  lastVisitAt: string | null;
  pendingAdmin: boolean;
  todayScans: Scan[];
  todayOrders: DayOrder[];
  todayPackageVnd: number;
  todayScanCount: number;
  todayOrderCount: number;
};

type CartLine = { itemId: string; qty: number; useAltPrice?: boolean };

type Step = "pick" | "login" | "dashboard";

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
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

  const zone = picked?.code || null;
  const zoneName = picked?.name || "";
  const isMiaOi = zone === "MIA_OI";
  const isSpa = zone === "SAUNA";
  const isPool = zone === "OLYMPIC_POOL";
  /** Menu phía trên — pool bán vé dưới từng lần quét */
  const hasCatalog = isMiaOi || isSpa;
  const title = dashboardTitle(zoneName || "…");
  const catalogCategories = isSpa ? SPA_CATEGORIES : MIAOI_CATEGORIES;
  const catalogMenu = isSpa ? SPA_MENU : MIAOI_MENU;

  const pendingCount = useMemo(
    () => arrivals.filter((a) => a.pendingAdmin).length,
    [arrivals]
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

  useEffect(() => {
    if (step !== "dashboard" || !zone) return;
    void load();
    const t = setInterval(() => void load(), 4000);
    return () => clearInterval(t);
  }, [step, zone, load]);

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
      const deskZone = String(user?.deskZone || "").toUpperCase();
      if (!admin && deskZone !== picked.code) {
        await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
        throw new Error(
          `Tài khoản này không phải khu ${picked.name}. Dùng ${picked.username} hoặc ADMINISTRATION.`
        );
      }
      setIsAdmin(!!admin);
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
    backToPick();
  }

  function openCustomer(a: Arrival) {
    setSelected(a);
    setCart({});
    setScanCarts({});
    setOrderMsg("");
    setVerifyingScanId(null);
    setCategory(
      isSpa
        ? SPA_CATEGORIES[0]?.id || "gio-vang"
        : MIAOI_CATEGORIES[0]?.id || "mia"
    );
  }

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
    let sum = 0;
    let qty = 0;
    for (const [itemId, q] of Object.entries(row)) {
      const item = getPoolItemById(itemId);
      if (!item || q < 1) continue;
      sum += item.priceVnd * q;
      qty += q;
    }
    return { sum, qty };
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
      // Optimistic — không chờ load() cả desk (chậm)
      setScanCarts((prev) => {
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
      setOrderMsg(
        `Đã xác thực · vào lúc ${formatTime(scan.at)} · ${formatVnd(data.order?.totalVnd || 0)}`
      );
      void load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không xác thực được");
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
        `Đã lưu · ${formatVnd(data.order?.totalVnd || cartTotal)}`
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
          <p style={styles.eyebrow}>HHG Oasis · Laptop quầy</p>
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
                          : "#e2e8f0",
                  background:
                    z.code === "MIA_OI"
                      ? "#fff7ed"
                      : z.code === "SAUNA"
                        ? "#eef5f0"
                        : z.code === "OLYMPIC_POOL"
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
            Acc admin lớn: <strong>ADMINISTRATION</strong> — xem được mọi khu.
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
            Hoặc <strong>ADMINISTRATION</strong> (xem mọi khu).
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

  // ── 3) Dashboard khu ─────────────────────────────────────
  return (
    <main style={styles.page}>
      <header style={styles.header}>
        <div>
          <p style={styles.eyebrow}>HHG Oasis · Laptop quầy</p>
          <h1 style={styles.h1}>{title}</h1>
          <p style={styles.mute}>
            {arrivals.length} khách · {pendingCount} chưa xem
            {isMiaOi ? " · bấm khách để gọi món" : ""}
            {isSpa ? " · bấm khách để chọn dịch vụ spa" : ""}
            {isPool ? " · bấm khách → chọn vé dưới lần quét → Xác thực" : ""}
            {isAdmin ? " · admin" : ""}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {isAdmin ? (
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

      <div style={styles.tableWrap}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Họ tên</th>
              <th style={styles.th}>SĐT</th>
              <th style={styles.th}>ID</th>
              <th style={styles.th}>Quét lúc</th>
              <th style={styles.th}>Loại</th>
            </tr>
          </thead>
          <tbody>
            {arrivals.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  style={{ ...styles.td, color: "#64748b", padding: 28 }}
                >
                  Chưa có khách quét QR <strong>{zoneName}</strong> trong 12 giờ.
                </td>
              </tr>
            ) : (
              arrivals.map((a) => (
                <tr
                  key={a.id}
                  style={{
                    background: a.pendingAdmin ? "#fff7ed" : "transparent",
                    cursor: "pointer",
                  }}
                  onClick={() => openCustomer(a)}
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
                    {a.lastVisitAt ? formatTime(a.lastVisitAt) : "—"}
                  </td>
                  <td style={styles.td}>
                    <span
                      style={{
                        ...styles.badge,
                        background:
                          a.segment === "MEMBER" ? "#dbeafe" : "#f1f5f9",
                        color: a.segment === "MEMBER" ? "#1d4ed8" : "#334155",
                      }}
                    >
                      {a.segmentLabel}
                    </span>
                  </td>
                </tr>
              ))
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
                </p>
              </div>
              <button
                type="button"
                style={styles.ghost}
                onClick={() => setSelected(null)}
              >
                Đóng
              </button>
            </div>

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
            {selected.todayScans?.length ? (
              <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
                {selected.todayScans.map((s) => {
                  const verified = !!s.ticketVerified || !!s.orderSummary;
                  const { sum, qty } = scanCartTotal(s.id);
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
                              justifyContent: "space-between",
                              alignItems: "center",
                              gap: 10,
                            }}
                          >
                            <div style={{ fontWeight: 800, fontSize: 13 }}>
                              {qty
                                ? `${qty} vé · ${formatVnd(sum)}`
                                : "Chưa chọn vé"}
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
    maxWidth: 980,
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
    maxWidth: 980,
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
