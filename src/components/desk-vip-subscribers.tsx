"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { swimBonusExpiresAt } from "@/lib/swim-packages";

type Sector = "vip" | "swim" | "spa" | "grill";

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

type RedeemedVoucher = {
  id: string;
  at: string;
  offerTitle: string | null;
  phone: string | null;
  customerName: string | null;
  claimedByName: string | null;
};

const REDEEM_ZONE: Record<"spa" | "grill", string> = {
  spa: "SAUNA",
  grill: "LONG_NUONG",
};

function formatWhen(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Ho_Chi_Minh",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(d);
  const pick = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value || "";
  return `${pick("day")}/${pick("month")}/${pick("year")} ${pick("hour")}:${pick("minute")}`;
}

function sessionsLabel(row: SwimStudent) {
  if (row.sessionsTotal > 0) return `${row.sessionsLeft}/${row.sessionsTotal}`;
  return "Theo tháng";
}

function bonusLabel(row: SwimStudent) {
  if (row.bonusVisitsTotal <= 0) return "—";
  const count = `${row.bonusVisitsLeft}/${row.bonusVisitsTotal}`;
  if (!row.startedAt) return count;
  const until = swimBonusExpiresAt(new Date(row.startedAt));
  if (Number.isNaN(until.getTime())) return count;
  return `${count} · đến ${formatWhen(until.toISOString())}`;
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
  const [redeemed, setRedeemed] = useState<RedeemedVoucher[] | null>(null);
  const [error, setError] = useState("");
  const [logFor, setLogFor] = useState<{
    id: string;
    fullName: string;
    used: number;
    total: number;
  } | null>(null);
  const [logs, setLogs] = useState<BonusLog[] | null>(null);
  const [logError, setLogError] = useState("");
  const listReq = useRef(0);

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

  const loadRedeemed = useCallback(async (which: "spa" | "grill") => {
    const seq = ++listReq.current;
    setError("");
    setRedeemed(null);
    try {
      const zone = REDEEM_ZONE[which];
      const res = await fetch(
        `/api/crm/desk/offers?history=1&zone=${encodeURIComponent(zone)}`,
        { cache: "no-store" }
      );
      const data = await res.json().catch(() => ({}));
      if (seq !== listReq.current) return;
      if (res.status === 401 || res.status === 403) {
        setRedeemed(null);
        setError(data.error || "Phiên đăng nhập đã hết. Chọn lại khu.");
        return;
      }
      if (!res.ok) {
        setError(data.error || "Không tải được voucher đã đổi.");
        return;
      }
      setRedeemed(Array.isArray(data.logs) ? data.logs : []);
    } catch {
      if (seq !== listReq.current) return;
      setError("Không tải được voucher đã đổi.");
    }
  }, []);

  useEffect(() => {
    if (sector !== "swim") setLogFor(null);
    if (sector === "vip") {
      void loadVip().catch(() => setError("Không tải được danh sách."));
    } else if (sector === "swim") {
      void loadSwim().catch(() => setError("Không tải được danh sách học viên."));
    } else {
      void loadRedeemed(sector);
    }
  }, [sector, loadVip, loadSwim, loadRedeemed]);

  async function openLog(person: SwimStudent) {
    setLogFor({
      id: person.id,
      fullName: person.fullName,
      used: Math.max(0, person.bonusVisitsTotal - person.bonusVisitsLeft),
      total: person.bonusVisitsTotal,
    });
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
  const redeemedCount = redeemed?.length ?? 0;
  const title =
    sector === "vip"
      ? "Khách đang dùng gói VIP"
      : sector === "swim"
        ? "Khách học bơi"
        : sector === "spa"
          ? "Voucher Spa đã đổi"
          : "Voucher Lòng Nướng đã đổi";
  const subtitle =
    sector === "vip"
      ? rows
        ? `${vipCount} khách còn hạn`
        : "Tên, số điện thoại, ngày đăng ký, gói và ngày hết hạn."
      : sector === "swim"
        ? students
          ? `${swimCount} học viên`
          : "Cùng thông tin gói, thêm buổi và lượt tự chọn còn lại."
        : redeemed
          ? `${redeemedCount} lượt đã quét`
          : "Khách, số điện thoại, thời điểm và voucher đã đổi.";

  return (
    <main style={styles.page}>
      <div style={styles.card}>
        <p style={styles.eyebrow}>Admin</p>
        <div style={styles.head}>
          <div>
            <h1 style={styles.h1}>{title}</h1>
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
              <button
                type="button"
                style={{
                  ...styles.pill,
                  ...(sector === "spa" ? styles.pillOn : null),
                }}
                onClick={() => {
                  setRedeemed(null);
                  setSector("spa");
                }}
              >
                Voucher Spa
              </button>
              <button
                type="button"
                style={{
                  ...styles.pill,
                  ...(sector === "grill" ? styles.pillOn : null),
                }}
                onClick={() => {
                  setRedeemed(null);
                  setSector("grill");
                }}
              >
                Voucher Lòng Nướng
              </button>
            </div>
            <p style={styles.mute}>{subtitle}</p>
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
        ) : sector === "swim" ? (
          students === null ? (
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
        )
        ) : redeemed === null ? (
          error ? null : <p style={styles.mute}>Đang tải…</p>
        ) : redeemed.length === 0 ? (
          <p style={styles.mute}>Chưa có voucher đã đổi.</p>
        ) : (
          <div style={{ overflowX: "auto", marginTop: 16 }}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Họ tên</th>
                  <th style={styles.th}>Số điện thoại</th>
                  <th style={styles.th}>Thời điểm</th>
                  <th style={styles.th}>Voucher</th>
                  <th style={styles.th}>Nhân viên</th>
                </tr>
              </thead>
              <tbody>
                {redeemed.map((row) => (
                  <tr key={row.id}>
                    <td style={{ ...styles.td, fontWeight: 700 }}>
                      {row.customerName || "Khách"}
                    </td>
                    <td style={styles.td}>{row.phone || "—"}</td>
                    <td style={styles.td}>{formatWhen(row.at)}</td>
                    <td style={styles.td}>{row.offerTitle || "Voucher"}</td>
                    <td style={styles.td}>{row.claimedByName || "—"}</td>
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
              <p style={styles.mute}>
                {logFor.used > 0
                  ? `Đã dùng ${logFor.used}/${logFor.total} lượt. Chưa lưu chi tiết từng lần.`
                  : "Chưa dùng lượt tự chọn."}
              </p>
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
