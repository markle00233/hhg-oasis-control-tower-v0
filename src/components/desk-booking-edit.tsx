"use client";

import { useCallback, useEffect, useState } from "react";

type CourtOption = {
  id: string;
  code: string;
  name: string;
  status: string;
};

type ReviseState = {
  editable: boolean;
  lockedReason: string | null;
  zone: "LONG_NUONG" | "PICKLEBALL";
  startAt: string;
  partySize: number;
  resourceId: string | null;
  resourceName: string | null;
  courts: CourtOption[];
};

function toLocalInput(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Sửa đặt chỗ trước khi chốt — hiện trong đơn quầy hoặc lịch sân. */
export function DeskBookingEdit({
  zone,
  token,
  bookingId,
  onSaved,
}: {
  zone: string;
  token?: string | null;
  bookingId?: string | null;
  onSaved?: () => void;
}) {
  const [state, setState] = useState<ReviseState | null>(null);
  const [arrival, setArrival] = useState("");
  const [partySize, setPartySize] = useState("2");
  const [resourceId, setResourceId] = useState("");
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!zone || (!token && !bookingId)) return;
    const q = new URLSearchParams({ zone });
    if (token) q.set("token", token);
    if (bookingId) q.set("bookingId", bookingId);
    try {
      const res = await fetch(`/api/crm/desk/revise-booking?${q}`, {
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Không tải được đặt chỗ");
      if (data.missing) {
        setState(null);
        return;
      }
      setState(data);
      setArrival(toLocalInput(data.startAt));
      setPartySize(String(data.partySize || 1));
      setResourceId(data.resourceId || "");
      setError("");
    } catch (e) {
      setState(null);
      setError(e instanceof Error ? e.message : "Không tải được đặt chỗ");
    }
  }, [zone, token, bookingId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    if (!state?.editable || busy || !arrival) return;
    const startAt = new Date(arrival);
    if (Number.isNaN(startAt.getTime())) {
      setError("Giờ đến không hợp lệ.");
      return;
    }
    setBusy(true);
    setError("");
    setMsg("");
    try {
      const res = await fetch("/api/crm/desk/revise-booking", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          zone,
          token: token || undefined,
          bookingId: bookingId || undefined,
          startAt: startAt.toISOString(),
          partySize: Number(partySize) || 1,
          resourceId: resourceId || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Không sửa được");
      setState((prev) =>
        prev
          ? {
              ...prev,
              startAt: data.startAt,
              partySize: data.partySize,
              resourceId: data.resourceId,
              resourceName: data.resourceName,
            }
          : prev
      );
      setArrival(toLocalInput(data.startAt));
      setPartySize(String(data.partySize || 1));
      setResourceId(data.resourceId || "");
      setMsg("Đã cập nhật đặt chỗ.");
      onSaved?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không sửa được");
    } finally {
      setBusy(false);
    }
  }

  if (!token && !bookingId) return null;
  if (!state) {
    return error ? (
      <p style={{ margin: "8px 0 0", fontSize: 12, fontWeight: 700, color: "#b91c1c" }}>
        {error}
      </p>
    ) : null;
  }

  const isLn = state.zone === "LONG_NUONG";
  const hint = isLn
    ? "Sửa số khách và giờ đến trước khi bấm Đã dùng."
    : "Sửa giờ đến và sân trước khi mở sân.";

  return (
    <div
      style={{
        marginTop: 12,
        padding: 12,
        borderRadius: 12,
        background: "#fff",
        border: "1px solid #e2e8f0",
      }}
    >
      <p style={{ margin: 0, fontWeight: 800, fontSize: 13, color: "#0f172a" }}>
        Sửa đặt chỗ
      </p>
      <p style={{ margin: "4px 0 0", fontSize: 12, color: "#64748b" }}>{hint}</p>
      {!state.editable ? (
        <p style={{ margin: "8px 0 0", fontSize: 13, fontWeight: 700, color: "#9a3412" }}>
          {state.lockedReason || "Đã chốt — không sửa được."}
        </p>
      ) : null}
      {state.editable ? (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 8,
            marginTop: 10,
            alignItems: "end",
          }}
        >
          {isLn ? (
            <label style={lab}>
              Số khách
              <input
                value={partySize}
                inputMode="numeric"
                style={inp}
                onChange={(e) =>
                  setPartySize(e.target.value.replace(/[^\d]/g, "").slice(0, 2))
                }
              />
            </label>
          ) : (
            <label style={lab}>
              Sân
              <select
                value={resourceId}
                style={inp}
                onChange={(e) => setResourceId(e.target.value)}
              >
                {(state.courts || []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.status === "OCCUPIED" ? " (đang dùng)" : ""}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label style={lab}>
            Giờ đến
            <input
              type="datetime-local"
              value={arrival}
              step={60}
              style={inp}
              onChange={(e) => setArrival(e.target.value)}
            />
          </label>
          <button
            type="button"
            disabled={busy || !arrival}
            onClick={() => void save()}
            style={{
              height: 38,
              padding: "0 14px",
              border: 0,
              borderRadius: 10,
              background: "#0f766e",
              color: "#fff",
              fontWeight: 800,
              cursor: busy ? "wait" : "pointer",
              opacity: busy || !arrival ? 0.5 : 1,
            }}
          >
            {busy ? "…" : "Cập nhật"}
          </button>
        </div>
      ) : null}
      {state.resourceName && isLn ? (
        <p style={{ margin: "8px 0 0", fontSize: 12, color: "#475569" }}>
          Bàn: {state.resourceName}
        </p>
      ) : null}
      {msg ? (
        <p style={{ margin: "8px 0 0", fontSize: 12, fontWeight: 700, color: "#047857" }}>
          {msg}
        </p>
      ) : null}
      {error ? (
        <p style={{ margin: "8px 0 0", fontSize: 12, fontWeight: 700, color: "#b91c1c" }}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

const lab: React.CSSProperties = {
  display: "grid",
  gap: 4,
  flex: "1 1 140px",
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
  background: "#fff",
};
