"use client";

import { useCallback, useEffect, useState } from "react";

type Sector = "vip" | "swim";

type Subscriber = {
  id: string;
  fullName: string;
  phone: string;
  planLabel: string;
  startedAt: string | null;
  expiresAt: string | null;
};

type SwimStudent = {
  id: string;
  fullName: string;
  phone: string | null;
  packageLabel: string;
  sessionsTotal: number;
  sessionsLeft: number;
  bonusVisitsTotal: number;
  bonusVisitsLeft: number;
  startedAt: string | null;
  expiresAt: string | null;
};

type BonusLog = {
  id: string;
  purpose: string;
  usedAt: string;
};

function formatWhen(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function sessionsLabel(row: SwimStudent) {
  if (row.sessionsTotal > 0) return `${row.sessionsLeft}/${row.sessionsTotal}`;
  return "Theo tháng";
}

function bonusLabel(row: SwimStudent) {
  if (row.bonusVisitsTotal > 0) {
    return `${row.bonusVisitsLeft}/${row.bonusVisitsTotal}`;
  }
  return "—";
}

export function DeskVipSubscribers({
  onBack,
  onLogout,
}: {
  onBack: () => void;
  onLogout: () => void;
}) {
  const [sector, setSector] = useState<Sector>("vip");
  const [rows, setRows] = useState<Subscriber[] | null>(null);
  const [students, setStudents] = useState<SwimStudent[] | null>(null);
  const [error, setError] = useState("");
  const [logFor, setLogFor] = useState<{ id: string; fullName: string } | null>(
    null
  );
  const [logs, setLogs] = useState<BonusLog[] | null>(null);
  const [logError, setLogError] = useState("");

  const loadVip = useCallback(async () => {
    setError("");
    const res = await fetch("/api/crm/desk/vip-subscribers", { cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 || res.status === 403) {
      setRows(null);
      setError(data.error || "Phiên đăng nhập đã hết. Chọn lại khu.");
      return;
    }
    if (!res.ok) {
      setError(data.error || "Không tải được danh sách.");
      return;
    }
    setRows(Array.isArray(data.subscribers) ? data.subscribers : []);
  }, []);

  const loadSwim = useCallback(async () => {
    setError("");
    const res = await fetch("/api/crm/desk/swim-students?status=ALL", {
      cache: "no-store",
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 || res.status === 403) {
      setStudents(null);
      setError(data.error || "Phiên đăng nhập đã hết. Chọn lại khu.");
      return;
    }
    if (!res.ok) {
      setError(data.error || "Không tải được danh sách học viên.");
      return;
    }
    setStudents(Array.isArray(data.students) ? data.students : []);
  }, []);

  useEffect(() => {
    if (sector === "vip") {
      void loadVip().catch(() => setError("Không tải được danh sách."));
    } else {
      void loadSwim().catch(() => setError("Không tải được danh sách học viên."));
    }
  }, [sector, loadVip, loadSwim]);

  async function openLog(person: { id: string; fullName: string }) {
    setLogFor(person);
    setLogs(null);
    setLogError("");
    const url = `/api/crm/desk/swim-bonus-log?studentId=${encodeURIComponent(person.id)}`;
    try {
      const res = await fetch(url, { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Không mở được nhật ký.");
      setLogs(Array.isArray(data.logs) ? data.logs : []);
    } catch (err) {
      setLogError(err instanceof Error ? err.message : "Không mở được nhật ký.");
    }
  }

  const swimCount = students?.length ?? 0;
  const vipCount = rows?.length ?? 0;

  return (
    <main style={styles.page}>
      <div style={styles.card}>
        <p style={styles.eyebrow}>Admin</p>
        <div style={styles.head}>
          <div>
            <h1 style={styles.h1}>
              {sector === "vip" ? "Khách đang dùng gói VIP" : "Khách học bơi"}
            </h1>
            <div style={styles.pills}>
              <button
                type="button"
                style={{
                  ...styles.pill,
                  ...(sector === "vip" ? styles.pillOn : null),
                }}
                onClick={() => setSector("vip")}
              >
                Gói VIP
              </button>
              <button
                type="button"
                style={{
                  ...styles.pill,
                  ...(sector === "swim" ? styles.pillOn : null),
                }}
                onClick={() => setSector("swim")}
              >
                Khách học bơi
              </button>
            </div>
            <p style={styles.mute}>
              {sector === "vip"
                ? rows
                  ? `${vipCount} khách còn hạn`
                  : "Tên, số điện thoại, ngày đăng ký, gói và ngày hết hạn."
                : students
                  ? `${swimCount} học viên`
                  : "Cùng thông tin gói, thêm buổi và lượt tự chọn còn lại."}
            </p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" style={styles.ghost} onClick={onBack}>
              ← Đổi khu
            </button>
            <button type="button" style={styles.ghost} onClick={onLogout}>
              Đăng xuất
            </button>
          </div>
        </div>

        {error ? <p style={styles.err}>{error}</p> : null}

        {sector === "vip" ? (
          rows === null ? (
            error ? null : <p style={styles.mute}>Đang tải…</p>
          ) : rows.length === 0 ? (
            <p style={styles.mute}>Chưa có khách đang dùng gói VIP.</p>
          ) : (
            <div style={{ overflowX: "auto", marginTop: 16 }}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Họ tên</th>
                    <th style={styles.th}>Số điện thoại</th>
                    <th style={styles.th}>Ngày đăng ký</th>
                    <th style={styles.th}>Gói</th>
                    <th style={styles.th}>Hết hạn</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id}>
                      <td style={{ ...styles.td, fontWeight: 700 }}>{row.fullName}</td>
                      <td style={styles.td}>{row.phone}</td>
                      <td style={styles.td}>{formatWhen(row.startedAt)}</td>
                      <td style={styles.td}>{row.planLabel}</td>
                      <td style={styles.td}>{formatWhen(row.expiresAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : students === null ? (
          error ? null : <p style={styles.mute}>Đang tải…</p>
        ) : students.length === 0 ? (
          <p style={styles.mute}>Chưa có học viên.</p>
        ) : (
          <div style={{ overflowX: "auto", marginTop: 16 }}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Họ tên</th>
                  <th style={styles.th}>Số điện thoại</th>
                  <th style={styles.th}>Ngày đăng ký</th>
                  <th style={styles.th}>Gói</th>
                  <th style={styles.th}>Hết hạn</th>
                  <th style={styles.th}>Buổi</th>
                  <th style={styles.th}>Lượt tự chọn</th>
                  <th style={styles.th}>Nhật ký</th>
                </tr>
              </thead>
              <tbody>
                {students.map((row) => (
                  <tr key={row.id}>
                    <td style={{ ...styles.td, fontWeight: 700 }}>{row.fullName}</td>
                    <td style={styles.td}>{row.phone || "—"}</td>
                    <td style={styles.td}>{formatWhen(row.startedAt)}</td>
                    <td style={styles.td}>{row.packageLabel}</td>
                    <td style={styles.td}>{formatWhen(row.expiresAt)}</td>
                    <td style={{ ...styles.td, fontWeight: 800 }}>{sessionsLabel(row)}</td>
                    <td style={{ ...styles.td, fontWeight: 800 }}>{bonusLabel(row)}</td>
                    <td style={styles.td}>
                      <button
                        type="button"
                        style={styles.logBtn}
                        onClick={() => void openLog(row)}
                      >
                        Log
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {logFor ? (
        <div style={styles.backdrop} onClick={() => setLogFor(null)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div style={styles.head}>
              <div>
                <h2 style={{ margin: 0, fontSize: 20 }}>Lượt tự chọn</h2>
                <p style={styles.mute}>{logFor.fullName}</p>
              </div>
              <button type="button" style={styles.ghost} onClick={() => setLogFor(null)}>
                Đóng
              </button>
            </div>
            {logError ? <p style={styles.err}>{logError}</p> : null}
            {logs === null && !logError ? (
              <p style={styles.mute}>Đang tải…</p>
            ) : logs && logs.length === 0 ? (
              <p style={styles.mute}>Chưa dùng lượt tự chọn.</p>
            ) : (
              <ul style={styles.logList}>
                {(logs || []).map((entry) => (
                  <li key={entry.id} style={styles.logItem}>
                    <strong>{entry.purpose}</strong>
                    <span style={{ color: "#64748b" }}>{formatWhen(entry.usedAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}
    </main>
  );
}

const styles = {
  page: {
    minHeight: "100dvh",
    background: "#f8fafc",
    padding: "28px 16px 48px",
    fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
  } as const,
  card: {
    maxWidth: 1100,
    margin: "0 auto",
    background: "#fff",
    borderRadius: 16,
    padding: "22px 22px 18px",
    boxShadow: "0 1px 2px rgba(15,23,42,.06)",
  } as const,
  eyebrow: {
    margin: 0,
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: "0.08em",
    textTransform: "uppercase" as const,
    color: "#a16207",
  },
  head: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
    marginTop: 8,
  } as const,
  h1: { margin: 0, fontSize: 28, lineHeight: 1.15 } as const,
  pills: { display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" as const },
  pill: {
    height: 34,
    padding: "0 14px",
    borderRadius: 999,
    border: "1px solid #e2e8f0",
    background: "#fff",
    fontWeight: 700,
    cursor: "pointer",
  } as const,
  pillOn: {
    background: "#0f172a",
    color: "#fff",
    border: "1px solid #0f172a",
  } as const,
  mute: { margin: "8px 0 0", color: "#64748b", fontSize: 14 } as const,
  err: { margin: "14px 0 0", color: "#b91c1c", fontWeight: 700, fontSize: 14 } as const,
  ghost: {
    height: 36,
    padding: "0 12px",
    borderRadius: 10,
    border: "1px solid #e2e8f0",
    background: "#fff",
    fontWeight: 700,
    cursor: "pointer",
    flex: "0 0 auto",
  } as const,
  logBtn: {
    height: 32,
    padding: "0 12px",
    borderRadius: 10,
    border: "1px solid #bae6fd",
    background: "#e0f2fe",
    color: "#0369a1",
    fontWeight: 800,
    cursor: "pointer",
  } as const,
  table: { width: "100%", borderCollapse: "collapse" as const, fontSize: 14 },
  th: {
    textAlign: "left" as const,
    fontSize: 11,
    letterSpacing: "0.06em",
    textTransform: "uppercase" as const,
    color: "#64748b",
    padding: "10px 8px",
    borderBottom: "1px solid #e2e8f0",
    whiteSpace: "nowrap" as const,
  },
  td: {
    padding: "12px 8px",
    borderBottom: "1px solid #f1f5f9",
    verticalAlign: "middle" as const,
  },
  backdrop: {
    position: "fixed" as const,
    inset: 0,
    background: "rgba(15,23,42,.45)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
    zIndex: 40,
  },
  modal: {
    width: "min(480px, 100%)",
    background: "#fff",
    borderRadius: 16,
    padding: 18,
  } as const,
  logList: { listStyle: "none", margin: "14px 0 0", padding: 0 } as const,
  logItem: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    padding: "10px 0",
    borderBottom: "1px solid #f1f5f9",
  } as const,
};
