"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from "react";

type DayCell = {
  date: string;
  day: number;
  visits: number;
  bookings: number;
};

const WEEKDAYS = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];

function monthLabel(year: number, month: number) {
  return `Tháng ${month}/${year}`;
}

export function DeskCalendar({
  zone,
  zoneName,
  onClose,
  onSelectDate,
}: {
  zone: string;
  zoneName: string;
  onClose: () => void;
  /** Chọn ngày → đóng lịch, dashboard lọc theo ngày đó */
  onSelectDate: (date: string) => void;
}) {
  const now = useMemo(() => new Date(), []);
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [days, setDays] = useState<DayCell[]>([]);
  const [today, setToday] = useState("");
  const [totals, setTotals] = useState({ visits: 0, bookings: 0 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const loadMonth = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(
        `/api/crm/desk/calendar?zone=${encodeURIComponent(zone)}&year=${year}&month=${month}`,
        { cache: "no-store" }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Không tải lịch");
      setDays(data.days || []);
      setToday(data.today || "");
      setTotals(data.totals || { visits: 0, bookings: 0 });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lỗi tải lịch");
    } finally {
      setBusy(false);
    }
  }, [zone, year, month]);

  useEffect(() => {
    void loadMonth();
  }, [loadMonth]);

  function shiftMonth(delta: number) {
    let m = month + delta;
    let y = year;
    if (m < 1) {
      m = 12;
      y -= 1;
    } else if (m > 12) {
      m = 1;
      y += 1;
    }
    setYear(y);
    setMonth(m);
  }

  const grid = useMemo(() => {
    const first = new Date(
      `${year}-${String(month).padStart(2, "0")}-01T12:00:00+07:00`
    );
    const jsDay = first.getDay();
    const offset = jsDay === 0 ? 6 : jsDay - 1;
    const cells: (DayCell | null)[] = [];
    for (let i = 0; i < offset; i++) cells.push(null);
    for (const d of days) cells.push(d);
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [days, year, month]);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 80,
        background: "rgba(15,23,42,.45)",
        display: "grid",
        placeItems: "center",
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: "min(720px, 100%)",
          maxHeight: "92dvh",
          overflow: "auto",
          background: "#fff",
          borderRadius: 20,
          padding: 20,
          boxShadow: "0 20px 50px rgba(15,23,42,.2)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
            alignItems: "flex-start",
          }}
        >
          <div>
            <p
              style={{
                margin: 0,
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: "#b45309",
              }}
            >
              Lịch · {zoneName}
            </p>
            <h2 style={{ margin: "6px 0 0", fontSize: 22, fontWeight: 800 }}>
              Chọn ngày xem trên dashboard
            </h2>
            <p style={{ margin: "6px 0 0", fontSize: 13, color: "#64748b" }}>
              Tháng này: <strong>{totals.visits}</strong> vào ·{" "}
              <strong>{totals.bookings}</strong> đặt · bấm ngày → quay về bảng
              chính
            </p>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button
              type="button"
              onClick={() => shiftMonth(-1)}
              style={btnGhost}
            >
              ←
            </button>
            <span
              style={{ fontWeight: 800, minWidth: 120, textAlign: "center" }}
            >
              {monthLabel(year, month)}
            </span>
            <button
              type="button"
              onClick={() => shiftMonth(1)}
              style={btnGhost}
            >
              →
            </button>
            <button type="button" onClick={onClose} style={btnGhost}>
              Đóng
            </button>
          </div>
        </div>

        {error ? (
          <p style={{ color: "#b91c1c", fontSize: 13, marginTop: 12 }}>
            {error}
          </p>
        ) : null}

        <div
          style={{
            marginTop: 16,
            display: "grid",
            gridTemplateColumns: "repeat(7, 1fr)",
            gap: 6,
          }}
        >
          {WEEKDAYS.map((w) => (
            <div
              key={w}
              style={{
                textAlign: "center",
                fontSize: 11,
                fontWeight: 700,
                color: "#64748b",
                padding: "4px 0",
              }}
            >
              {w}
            </div>
          ))}
          {grid.map((cell, i) => {
            if (!cell) {
              return (
                <div
                  key={`e-${i}`}
                  style={{
                    minHeight: 72,
                    borderRadius: 12,
                    background: "#f8fafc",
                  }}
                />
              );
            }
            const isToday = cell.date === today;
            const has = cell.visits > 0 || cell.bookings > 0;
            return (
              <button
                key={cell.date}
                type="button"
                disabled={busy}
                onClick={() => onSelectDate(cell.date)}
                style={{
                  minHeight: 72,
                  borderRadius: 12,
                  border: isToday ? "2px solid #38bdf8" : "1px solid #e2e8f0",
                  background: has ? "#f0f9ff" : "#fff",
                  padding: 8,
                  textAlign: "left",
                  cursor: "pointer",
                }}
              >
                <div style={{ fontWeight: 800, fontSize: 14 }}>{cell.day}</div>
                <div style={{ marginTop: 4, fontSize: 10, color: "#0369a1" }}>
                  {cell.visits ? `Vào ${cell.visits}` : ""}
                </div>
                <div style={{ fontSize: 10, color: "#0f766e" }}>
                  {cell.bookings ? `Đặt ${cell.bookings}` : ""}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

const btnGhost: CSSProperties = {
  height: 40,
  borderRadius: 12,
  border: "1px solid #e2e8f0",
  background: "#fff",
  padding: "0 14px",
  fontWeight: 700,
  cursor: "pointer",
};
