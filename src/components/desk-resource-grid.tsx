"use client";

import { useCallback, useEffect, useState } from "react";

type ResourceCard = {
  id: string;
  type: string;
  code: string;
  name: string;
  capacity: number;
  status: string;
  activeSession: {
    id: string;
    startAt: string;
    customer: { fullName: string | null; phone: string | null } | null;
    note?: string | null;
  } | null;
  upcomingBookings: {
    id: string;
    bookingCode: string;
    startAt: string;
    endAt: string;
    partySize: number;
    status: string;
    customerName: string | null;
    phone: string | null;
  }[];
};

function statusColor(status: string) {
  switch (status) {
    case "AVAILABLE":
      return { bg: "#ecfdf5", fg: "#047857", label: "Trống" };
    case "RESERVED":
      return { bg: "#eff6ff", fg: "#1d4ed8", label: "Đã đặt" };
    case "OCCUPIED":
      return { bg: "#fff7ed", fg: "#c2410c", label: "Đang dùng" };
    case "CLEANING":
      return { bg: "#f8fafc", fg: "#64748b", label: "Dọn" };
    case "BLOCKED":
      return { bg: "#fef2f2", fg: "#b91c1c", label: "Khóa" };
    default:
      return { bg: "#f1f5f9", fg: "#334155", label: status };
  }
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function DeskResourceGrid({
  zone,
  zoneName,
  onChanged,
}: {
  zone: string;
  zoneName: string;
  /** Sau Bắt đầu / Kết thúc — reload danh sách khách bên dưới */
  onChanged?: () => void;
}) {
  const [resources, setResources] = useState<ResourceCard[]>([]);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [guestById, setGuestById] = useState<
    Record<string, { name: string; phone: string; partySize: string }>
  >({});

  const load = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/crm/resources?zone=${encodeURIComponent(zone)}`,
        { cache: "no-store" }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Load resources failed");
      setResources(data.resources || []);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lỗi tải sơ đồ");
    }
  }, [zone]);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 5000);
    return () => clearInterval(t);
  }, [load]);

  function setGuest(
    id: string,
    patch: Partial<{ name: string; phone: string; partySize: string }>
  ) {
    setGuestById((prev) => ({
      ...prev,
      [id]: {
        name: patch.name ?? prev[id]?.name ?? "",
        phone: patch.phone ?? prev[id]?.phone ?? "",
        partySize: patch.partySize ?? prev[id]?.partySize ?? "1",
      },
    }));
  }

  async function act(
    resourceId: string,
    action: string,
    extra: Record<string, unknown> = {}
  ) {
    setBusyId(resourceId);
    try {
      const res = await fetch("/api/crm/resources", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ zone, resourceId, action, ...extra }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Thao tác thất bại");
      if (action === "START_SESSION") {
        setGuestById((prev) => {
          const next = { ...prev };
          delete next[resourceId];
          return next;
        });
      }
      await load();
      onChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Thao tác thất bại");
    } finally {
      setBusyId(null);
    }
  }

  const z = zone.toUpperCase();
  if (z === "SAUNA" || z === "SPA") {
    return null;
  }

  const title =
    z === "PICKLEBALL"
      ? "Sơ đồ sân"
      : z === "LONG_NUONG"
        ? "Sơ đồ bàn"
        : z === "VIP_RESORT"
          ? "VIP capacity"
          : `Tài nguyên ${zoneName}`;

  return (
    <section style={{ maxWidth: 1180, margin: "18px auto 0" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          marginBottom: 10,
        }}
      >
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>{title}</h2>
        <button
          type="button"
          onClick={() => void load()}
          style={{
            border: "1px solid #cbd5e1",
            borderRadius: 10,
            padding: "8px 12px",
            background: "#fff",
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          Làm mới sơ đồ
        </button>
      </div>
      <p style={{ margin: "0 0 10px", fontSize: 13, color: "#64748b" }}>
        Điền SĐT, họ tên, số người rồi Bắt đầu. Để trống tên →{" "}
        <strong>Khách lẻ</strong> ở danh sách dưới.
      </p>
      {error ? (
        <p style={{ color: "#dc2626", fontSize: 13, marginBottom: 8 }}>{error}</p>
      ) : null}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
          gap: 10,
        }}
      >
        {resources.map((r) => {
          const st = statusColor(r.status);
          const next = r.upcomingBookings[0];
          const guest = guestById[r.id] || {
            name: "",
            phone: "",
            partySize: "1",
          };
          return (
            <div
              key={r.id}
              style={{
                background: "#fff",
                borderRadius: 16,
                padding: 14,
                boxShadow: "0 8px 24px rgba(15,23,42,.06)",
                border: `1px solid ${st.bg}`,
              }}
            >
              <div style={{ fontWeight: 800, fontSize: 15 }}>{r.name}</div>
              <div
                style={{
                  marginTop: 8,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  background: st.bg,
                  color: st.fg,
                  borderRadius: 999,
                  padding: "4px 10px",
                  fontSize: 12,
                  fontWeight: 800,
                }}
              >
                ● {st.label}
              </div>
              {r.type === "VIP_AREA" ? (
                <p style={{ margin: "8px 0 0", fontSize: 12, color: "#64748b" }}>
                  Sức chứa {r.capacity}
                </p>
              ) : null}
              {r.activeSession ? (
                <p style={{ margin: "8px 0 0", fontSize: 12, color: "#334155" }}>
                  {r.activeSession.customer?.fullName ||
                    r.activeSession.note?.split(" · ")[0] ||
                    "Khách lẻ"}
                  {r.activeSession.customer?.phone
                    ? ` · ${r.activeSession.customer.phone}`
                    : ""}
                  {(() => {
                    const m = r.activeSession.note?.match(/(\d+)\s*người/);
                    return m ? ` · ${m[1]} người` : "";
                  })()}{" "}
                  · từ {formatTime(r.activeSession.startAt)}
                </p>
              ) : null}
              {next ? (
                <p style={{ margin: "6px 0 0", fontSize: 12, color: "#64748b" }}>
                  Next {formatTime(next.startAt)}–{formatTime(next.endAt)}
                  {next.customerName ? ` · ${next.customerName}` : ""}
                  {next.partySize > 1 ? ` · ${next.partySize} người` : ""}
                </p>
              ) : null}

              {r.status !== "OCCUPIED" ? (
                <div
                  style={{
                    marginTop: 10,
                    display: "grid",
                    gap: 8,
                    padding: 10,
                    background: "#f8fafc",
                    borderRadius: 12,
                    border: "1px solid #e2e8f0",
                  }}
                >
                  <label style={fieldLabel}>
                    SĐT
                    <input
                      value={guest.phone}
                      onChange={(e) =>
                        setGuest(r.id, { phone: e.target.value })
                      }
                      placeholder="09…"
                      inputMode="tel"
                      style={input}
                    />
                  </label>
                  <label style={fieldLabel}>
                    Họ tên
                    <input
                      value={guest.name}
                      onChange={(e) =>
                        setGuest(r.id, { name: e.target.value })
                      }
                      placeholder="Trống = Khách lẻ"
                      style={input}
                    />
                  </label>
                  <label style={fieldLabel}>
                    Số người
                    <input
                      value={guest.partySize}
                      onChange={(e) =>
                        setGuest(r.id, {
                          partySize: e.target.value.replace(/[^\d]/g, ""),
                        })
                      }
                      placeholder="1"
                      inputMode="numeric"
                      min={1}
                      max={Math.max(r.capacity || 20, 1)}
                      style={input}
                    />
                  </label>
                </div>
              ) : null}

              <div
                style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}
              >
                {r.status !== "OCCUPIED" ? (
                  <button
                    type="button"
                    disabled={busyId === r.id}
                    onClick={() => {
                      const n = Math.min(
                        Math.max(Number(guest.partySize) || 1, 1),
                        Math.max(r.capacity || 20, 1)
                      );
                      void act(r.id, "START_SESSION", {
                        guestName: guest.name.trim(),
                        guestPhone: guest.phone.trim(),
                        partySize: n,
                      });
                    }}
                    style={btn}
                  >
                    Bắt đầu
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={busyId === r.id}
                    onClick={() =>
                      void act(r.id, "COMPLETE_SESSION", {
                        sessionId: r.activeSession?.id,
                      })
                    }
                    style={btn}
                  >
                    Kết thúc
                  </button>
                )}
                {r.status === "CLEANING" ? (
                  <button
                    type="button"
                    disabled={busyId === r.id}
                    onClick={() =>
                      void act(r.id, "SET_STATUS", { status: "AVAILABLE" })
                    }
                    style={btn}
                  >
                    Sẵn sàng
                  </button>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
      {resources.length === 0 ? (
        <p style={{ color: "#64748b", fontSize: 14 }}>
          Chưa có resource — chạy <code>npx tsx prisma/seed-resources.ts</code>
        </p>
      ) : null}
    </section>
  );
}

const btn: React.CSSProperties = {
  border: "1px solid #cbd5e1",
  borderRadius: 10,
  padding: "8px 10px",
  background: "#fff",
  fontWeight: 700,
  cursor: "pointer",
  fontSize: 12,
};

const fieldLabel: React.CSSProperties = {
  display: "grid",
  gap: 4,
  fontSize: 11,
  fontWeight: 700,
  color: "#475569",
};

const input: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  border: "1px solid #cbd5e1",
  borderRadius: 10,
  padding: "8px 10px",
  fontSize: 13,
  fontWeight: 600,
  outline: "none",
  background: "#fff",
  color: "#0f172a",
};
