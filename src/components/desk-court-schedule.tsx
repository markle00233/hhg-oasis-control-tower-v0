"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  COURT_COLORS,
  formatVnd,
  localDayKey,
  PICKLEBALL_CLOSE_MIN,
  PICKLEBALL_OPEN_MIN,
  priceForRange,
} from "@/lib/pickleball";

type Court = {
  id: string;
  code: string;
  name: string;
  status: string;
  capacity: number;
  activeSession: {
    id: string;
    startAt: string;
    customer: { fullName: string | null; phone: string | null } | null;
    note?: string | null;
  } | null;
};

type ScheduleBooking = {
  id: string;
  bookingCode: string;
  startAt: string;
  endAt: string;
  partySize: number;
  status: string;
  source: string;
  resource: { id: string; code: string; name: string } | null;
  customerName: string | null;
  phone: string | null;
  totalHint?: number | null;
};

const HOUR_HEIGHT = 56;
const DAY_START = PICKLEBALL_OPEN_MIN;
const DAY_END = PICKLEBALL_CLOSE_MIN;
const DAY_SPAN = DAY_END - DAY_START;

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function dayOffset(key: string, days: number) {
  const [y, m, d] = key.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  return localDayKey(dt);
}

function weekdayLabel(key: string) {
  const [y, m, d] = key.split("-").map(Number);
  const names = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
  return names[new Date(y, m - 1, d).getDay()];
}

function minutesOfDay(iso: string) {
  const d = new Date(iso);
  return d.getHours() * 60 + d.getMinutes();
}

function atLocal(dayKey: string, minutes: number) {
  const [y, m, d] = dayKey.split("-").map(Number);
  return new Date(y, m - 1, d, Math.floor(minutes / 60), minutes % 60, 0, 0);
}

function hm(min: number) {
  return `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;
}

function sourceLabel(source: string) {
  const s = (source || "").toUpperCase();
  if (s === "CUSTOMER") return "Order nhà";
  if (s === "STAFF") return "Quầy ghi";
  if (s === "OASIS_SPORT") return "Oasis Sport";
  return source || "—";
}

export function DeskCourtSchedule({
  zone,
  onChanged,
}: {
  zone: string;
  onChanged?: () => void;
}) {
  const [dayKey, setDayKey] = useState(() => localDayKey());
  const [courts, setCourts] = useState<Court[]>([]);
  const [bookings, setBookings] = useState<ScheduleBooking[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState({
    resourceId: "",
    fullName: "",
    phone: "",
    partySize: "2",
    fromHm: "08:00",
    toHm: "09:00",
    paidVnd: "",
    startNow: true,
  });

  const hours = useMemo(() => {
    const out: number[] = [];
    for (let m = DAY_START; m < DAY_END; m += 60) out.push(m);
    return out;
  }, []);

  const load = useCallback(async () => {
    try {
      const [resR, resB] = await Promise.all([
        fetch(`/api/crm/resources?zone=${encodeURIComponent(zone)}`, {
          cache: "no-store",
        }),
        fetch(
          `/api/crm/bookings?zone=${encodeURIComponent(zone)}&date=${encodeURIComponent(dayKey)}`,
          { cache: "no-store" }
        ),
      ]);
      const dataR = await resR.json();
      const dataB = await resB.json();
      if (!resR.ok) throw new Error(dataR.error || "Lỗi tải sân");
      if (!resB.ok) throw new Error(dataB.error || "Lỗi tải lịch");
      setCourts(dataR.resources || []);
      setBookings(dataB.bookings || []);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lỗi tải lịch sân");
    }
  }, [zone, dayKey]);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 8000);
    return () => clearInterval(t);
  }, [load]);

  async function endSession(resourceId: string, sessionId?: string) {
    setBusy(true);
    try {
      const res = await fetch("/api/crm/resources", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          zone,
          resourceId,
          action: "COMPLETE_SESSION",
          sessionId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Không kết thúc được");
      await load();
      onChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lỗi kết thúc");
    } finally {
      setBusy(false);
    }
  }

  async function submitWalkIn() {
    if (!form.resourceId || !form.fullName.trim() || busy) return;
    const fromParts = form.fromHm.split(":").map(Number);
    const toParts = form.toHm.split(":").map(Number);
    const startAt = atLocal(
      dayKey,
      (fromParts[0] || 0) * 60 + (fromParts[1] || 0)
    );
    const endAt = atLocal(dayKey, (toParts[0] || 0) * 60 + (toParts[1] || 0));
    if (endAt <= startAt) {
      setError("Giờ kết thúc phải sau giờ bắt đầu.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/crm/pickleball/walk-in", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          resourceId: form.resourceId,
          fullName: form.fullName.trim(),
          phone: form.phone.trim(),
          partySize: Number(form.partySize) || 2,
          startAt: startAt.toISOString(),
          endAt: endAt.toISOString(),
          paidVnd: form.paidVnd ? Number(form.paidVnd) : undefined,
          startSession: form.startNow,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Không lưu được");
      setFormOpen(false);
      setForm((f) => ({
        ...f,
        fullName: "",
        phone: "",
        paidVnd: "",
      }));
      await load();
      onChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lỗi walk-in");
    } finally {
      setBusy(false);
    }
  }

  const pricedHint = useMemo(() => {
    try {
      const fp = form.fromHm.split(":").map(Number);
      const tp = form.toHm.split(":").map(Number);
      const s = atLocal(dayKey, (fp[0] || 0) * 60 + (fp[1] || 0));
      const e = atLocal(dayKey, (tp[0] || 0) * 60 + (tp[1] || 0));
      if (e <= s) return 0;
      return priceForRange(s, e);
    } catch {
      return 0;
    }
  }, [form.fromHm, form.toHm, dayKey]);

  const gridHeight = (DAY_SPAN / 60) * HOUR_HEIGHT;

  return (
    <section style={{ maxWidth: 1180, margin: "18px auto 0" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
          marginBottom: 12,
        }}
      >
        <div>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>
            Lịch 6 sân
          </h2>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "#64748b" }}>
            Thanh màu = sân · Order nhà / Quầy ghi · Kết thúc để reset sân trống
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <button type="button" style={navBtn} onClick={() => setDayKey((k) => dayOffset(k, -1))}>
            ←
          </button>
          <div style={{ fontWeight: 800, minWidth: 140, textAlign: "center" }}>
            {weekdayLabel(dayKey)} · {dayKey.split("-").reverse().join("/")}
          </div>
          <button type="button" style={navBtn} onClick={() => setDayKey((k) => dayOffset(k, 1))}>
            →
          </button>
          <button type="button" style={navBtn} onClick={() => setDayKey(localDayKey())}>
            Hôm nay
          </button>
          <button
            type="button"
            style={{ ...navBtn, background: "#1d4ed8", color: "#fff", borderColor: "#1d4ed8" }}
            onClick={() => {
              setForm((f) => ({
                ...f,
                resourceId: f.resourceId || courts[0]?.id || "",
              }));
              setFormOpen(true);
            }}
          >
            + Ghi khách tại quầy
          </button>
          <button type="button" style={navBtn} onClick={() => void load()}>
            Làm mới
          </button>
        </div>
      </div>

      {error ? (
        <p style={{ color: "#dc2626", fontSize: 13, marginBottom: 8 }}>{error}</p>
      ) : null}

      {/* Legend */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
        {courts.map((c, i) => {
          const col = COURT_COLORS[i % COURT_COLORS.length];
          return (
            <span
              key={c.id}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                background: col.bg,
                color: col.fg,
                border: `1px solid ${col.border}`,
                borderRadius: 999,
                padding: "4px 10px",
                fontSize: 12,
                fontWeight: 800,
              }}
            >
              {c.name}
              {c.status === "OCCUPIED" ? " · đang dùng" : ""}
            </span>
          );
        })}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: `56px repeat(${Math.max(courts.length, 1)}, minmax(120px, 1fr))`,
          background: "#fff",
          borderRadius: 16,
          border: "1px solid #e2e8f0",
          overflow: "auto",
          boxShadow: "0 8px 24px rgba(15,23,42,.06)",
        }}
      >
        <div style={{ ...cellHead, position: "sticky", left: 0, zIndex: 2 }}>
          Giờ
        </div>
        {courts.map((c, i) => {
          const col = COURT_COLORS[i % COURT_COLORS.length];
          return (
            <div
              key={c.id}
              style={{
                ...cellHead,
                background: col.bg,
                color: col.fg,
                borderBottom: `2px solid ${col.border}`,
              }}
            >
              {c.name}
              {c.activeSession ? (
                <div style={{ fontWeight: 600, fontSize: 11, marginTop: 2 }}>
                  {c.activeSession.customer?.fullName ||
                    c.activeSession.note?.split(" · ")[0] ||
                    "Đang dùng"}
                </div>
              ) : null}
            </div>
          );
        })}

        <div style={{ gridColumn: "1 / -1", display: "contents" }}>
          <div
            style={{
              gridColumn: "1 / -1",
              display: "grid",
              gridTemplateColumns: `56px repeat(${Math.max(courts.length, 1)}, minmax(120px, 1fr))`,
              position: "relative",
              minHeight: gridHeight,
            }}
          >
            {/* Time gutter */}
            <div style={{ position: "relative", borderRight: "1px solid #e2e8f0" }}>
              {hours.map((m) => (
                <div
                  key={m}
                  style={{
                    height: HOUR_HEIGHT,
                    fontSize: 11,
                    fontWeight: 700,
                    color: "#64748b",
                    padding: "4px 6px",
                    borderBottom: "1px solid #f1f5f9",
                  }}
                >
                  {hm(m)}
                </div>
              ))}
            </div>

            {/* Court columns */}
            {courts.map((c, ci) => {
              const col = COURT_COLORS[ci % COURT_COLORS.length];
              const courtBooks = bookings.filter((b) => b.resource?.id === c.id);
              return (
                <div
                  key={c.id}
                  style={{
                    position: "relative",
                    borderRight: "1px solid #f1f5f9",
                    background:
                      c.status === "OCCUPIED"
                        ? "linear-gradient(180deg, #fff7ed22, transparent)"
                        : "#fff",
                  }}
                >
                  {hours.map((m) => (
                    <div
                      key={m}
                      style={{
                        height: HOUR_HEIGHT,
                        borderBottom: "1px solid #f1f5f9",
                      }}
                    />
                  ))}
                  {courtBooks.map((b) => {
                    const startM = Math.max(DAY_START, minutesOfDay(b.startAt));
                    const endM = Math.min(DAY_END, minutesOfDay(b.endAt));
                    if (endM <= startM) return null;
                    const top = ((startM - DAY_START) / 60) * HOUR_HEIGHT;
                    const height = Math.max(
                      28,
                      ((endM - startM) / 60) * HOUR_HEIGHT - 4
                    );
                    const online = (b.source || "").toUpperCase() === "CUSTOMER";
                    return (
                      <div
                        key={b.id}
                        title={`${b.customerName || "Khách"} · ${sourceLabel(b.source)}`}
                        style={{
                          position: "absolute",
                          left: 4,
                          right: 4,
                          top: top + 2,
                          height,
                          background: col.bg,
                          border: `1.5px solid ${col.border}`,
                          borderLeft: `4px solid ${online ? "#2563eb" : "#ea580c"}`,
                          borderRadius: 10,
                          padding: "4px 6px",
                          overflow: "hidden",
                          fontSize: 11,
                          color: col.fg,
                          boxShadow: "0 2px 8px rgba(15,23,42,.08)",
                          zIndex: 1,
                        }}
                      >
                        <div style={{ fontWeight: 800, lineHeight: 1.2 }}>
                          {b.customerName || "Khách"}
                        </div>
                        <div style={{ opacity: 0.9 }}>
                          {hm(startM)}–{hm(endM)} · {sourceLabel(b.source)}
                        </div>
                        {b.phone ? (
                          <div style={{ opacity: 0.85 }}>{b.phone}</div>
                        ) : null}
                        <div style={{ opacity: 0.8 }}>
                          {b.partySize} người
                          {b.status === "IN_SERVICE" ? " · đang chơi" : ""}
                          {b.status === "COMPLETED" ? " · xong" : ""}
                        </div>
                      </div>
                    );
                  })}
                  {c.activeSession ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void endSession(c.id, c.activeSession?.id)
                      }
                      style={{
                        position: "absolute",
                        bottom: 8,
                        left: 8,
                        right: 8,
                        zIndex: 2,
                        border: "1px solid #c2410c",
                        background: "#fff7ed",
                        color: "#9a3412",
                        borderRadius: 10,
                        padding: "8px 10px",
                        fontWeight: 800,
                        fontSize: 12,
                        cursor: "pointer",
                      }}
                    >
                      Kết thúc · reset sân
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <p style={{ margin: "10px 0 0", fontSize: 12, color: "#64748b" }}>
        Viền xanh dương = order từ app · viền cam = nhân viên ghi tại quầy
      </p>

      {formOpen ? (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15,23,42,.45)",
            zIndex: 80,
            display: "grid",
            placeItems: "center",
            padding: 16,
          }}
          onClick={() => !busy && setFormOpen(false)}
        >
          <div
            style={{
              background: "#fff",
              borderRadius: 16,
              padding: 20,
              width: "min(440px, 100%)",
              boxShadow: "0 20px 50px rgba(15,23,42,.25)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: "0 0 12px", fontSize: 18 }}>Ghi khách tại quầy</h3>
            <div style={{ display: "grid", gap: 10 }}>
              <label style={lab}>
                Sân
                <select
                  value={form.resourceId}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, resourceId: e.target.value }))
                  }
                  style={inp}
                >
                  {courts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                      {c.status === "OCCUPIED" ? " (đang dùng)" : ""}
                    </option>
                  ))}
                </select>
              </label>
              <label style={lab}>
                Họ tên *
                <input
                  value={form.fullName}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, fullName: e.target.value }))
                  }
                  style={inp}
                  placeholder="Tên khách"
                />
              </label>
              <label style={lab}>
                SĐT
                <input
                  value={form.phone}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, phone: e.target.value }))
                  }
                  style={inp}
                  inputMode="tel"
                  placeholder="09…"
                />
              </label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                <label style={lab}>
                  Từ
                  <input
                    value={form.fromHm}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, fromHm: e.target.value }))
                    }
                    style={inp}
                    placeholder="08:00"
                  />
                </label>
                <label style={lab}>
                  Đến
                  <input
                    value={form.toHm}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, toHm: e.target.value }))
                    }
                    style={inp}
                    placeholder="09:00"
                  />
                </label>
                <label style={lab}>
                  Số người
                  <input
                    value={form.partySize}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        partySize: e.target.value.replace(/[^\d]/g, ""),
                      }))
                    }
                    style={inp}
                    inputMode="numeric"
                  />
                </label>
              </div>
              <label style={lab}>
                Tiền thu (đ) — gợi ý {formatVnd(pricedHint)}
                <input
                  value={form.paidVnd}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      paidVnd: e.target.value.replace(/[^\d]/g, ""),
                    }))
                  }
                  style={inp}
                  inputMode="numeric"
                  placeholder={String(pricedHint || "")}
                />
              </label>
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 13,
                  fontWeight: 700,
                }}
              >
                <input
                  type="checkbox"
                  checked={form.startNow}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, startNow: e.target.checked }))
                  }
                />
                Bắt đầu ngay (sân chuyển đang dùng)
              </label>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 16, justifyContent: "flex-end" }}>
              <button type="button" style={navBtn} disabled={busy} onClick={() => setFormOpen(false)}>
                Huỷ
              </button>
              <button
                type="button"
                disabled={busy || !form.fullName.trim()}
                onClick={() => void submitWalkIn()}
                style={{
                  ...navBtn,
                  background: "#1d4ed8",
                  color: "#fff",
                  borderColor: "#1d4ed8",
                  opacity: busy || !form.fullName.trim() ? 0.6 : 1,
                }}
              >
                {busy ? "Đang lưu…" : "Lưu + hiện dashboard"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

const cellHead: React.CSSProperties = {
  padding: "10px 8px",
  fontWeight: 800,
  fontSize: 13,
  background: "#f8fafc",
  borderBottom: "1px solid #e2e8f0",
  textAlign: "center",
};

const navBtn: React.CSSProperties = {
  border: "1px solid #cbd5e1",
  borderRadius: 10,
  padding: "8px 12px",
  background: "#fff",
  fontWeight: 700,
  cursor: "pointer",
  fontSize: 13,
};

const lab: React.CSSProperties = {
  display: "grid",
  gap: 4,
  fontSize: 12,
  fontWeight: 700,
  color: "#334155",
};

const inp: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  border: "1px solid #cbd5e1",
  borderRadius: 10,
  padding: "8px 10px",
  fontSize: 14,
  fontWeight: 600,
};
