"use client";

import { useCallback, useEffect, useState } from "react";
import {
  SWIM_PACKAGES,
  formatSwimPrice,
  type SwimPackage,
} from "@/lib/swim-packages";

type Student = {
  id: string;
  fullName: string;
  phone: string | null;
  packageId: string;
  packageLabel: string;
  sessionsTotal: number;
  sessionsLeft: number;
  bonusVisitsTotal: number;
  bonusVisitsLeft: number;
  status: string;
  note: string | null;
  updatedAt: string;
};

const styles = {
  page: {
    minHeight: "100dvh",
    background: "#f1f5f9",
    padding: "20px 16px 48px",
    fontFamily:
      'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
  } as const,
  card: {
    maxWidth: 960,
    margin: "0 auto",
    background: "#fff",
    borderRadius: 20,
    padding: 20,
    boxShadow: "0 8px 30px rgba(15,23,42,.06)",
  } as const,
  h1: { margin: 0, fontSize: 26, fontWeight: 800, color: "#0f172a" } as const,
  mute: { margin: "6px 0 0", fontSize: 13, color: "#64748b" } as const,
  eyebrow: {
    margin: 0,
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.14em",
    textTransform: "uppercase" as const,
    color: "#b45309",
  },
  input: {
    height: 44,
    borderRadius: 12,
    border: "1px solid #e2e8f0",
    padding: "0 12px",
    fontSize: 14,
    width: "100%",
  } as const,
  select: {
    height: 44,
    borderRadius: 12,
    border: "1px solid #e2e8f0",
    padding: "0 12px",
    fontSize: 14,
    width: "100%",
    background: "#fff",
  } as const,
  btn: {
    height: 44,
    borderRadius: 12,
    border: "none",
    background: "#0c4a6e",
    color: "#fff",
    fontWeight: 700,
    fontSize: 14,
    padding: "0 16px",
    cursor: "pointer",
  } as const,
  ghost: {
    height: 44,
    borderRadius: 12,
    border: "1px solid #e2e8f0",
    background: "#fff",
    color: "#0f172a",
    fontWeight: 600,
    fontSize: 14,
    padding: "0 14px",
    cursor: "pointer",
  } as const,
  err: { color: "#b91c1c", fontSize: 13, margin: 0 } as const,
  table: {
    width: "100%",
    borderCollapse: "collapse" as const,
    fontSize: 13,
  },
  th: {
    textAlign: "left" as const,
    padding: "10px 8px",
    borderBottom: "1px solid #e2e8f0",
    color: "#64748b",
    fontSize: 11,
    fontWeight: 700,
    textTransform: "uppercase" as const,
  },
  td: {
    padding: "12px 8px",
    borderBottom: "1px solid #f1f5f9",
    verticalAlign: "top" as const,
  },
};

export function DeskSwimStudents({
  onBack,
  onLogout,
}: {
  onBack: () => void;
  onLogout: () => void;
}) {
  const [students, setStudents] = useState<Student[]>([]);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("ACTIVE");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [packageId, setPackageId] = useState(SWIM_PACKAGES[0]?.id || "");
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      params.set("status", statusFilter);
      const res = await fetch(
        `/api/crm/desk/swim-students?${params.toString()}`,
        { cache: "no-store" }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Không tải được danh sách");
      setStudents(data.students || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lỗi tải");
    }
  }, [q, statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  async function addStudent(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/crm/desk/swim-students", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ fullName, phone, packageId, note }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Không thêm được");
      setFullName("");
      setPhone("");
      setNote("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Thêm thất bại");
    } finally {
      setBusy(false);
    }
  }

  async function patch(
    id: string,
    body: Record<string, unknown>
  ) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/crm/desk/swim-students", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, ...body }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Không cập nhật được");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cập nhật thất bại");
    } finally {
      setBusy(false);
    }
  }

  const pkgGroups = SWIM_PACKAGES.reduce<Record<string, SwimPackage[]>>(
    (acc, p) => {
      (acc[p.programLabel] ||= []).push(p);
      return acc;
    },
    {}
  );

  return (
    <main style={styles.page}>
      <div style={styles.card}>
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
            <p style={styles.eyebrow}>adminAllplace · Học bơi</p>
            <h1 style={styles.h1}>Khách học bơi</h1>
            <p style={styles.mute}>
              Danh sách học viên · trừ buổi / lượt tự chọn · gói theo menu HHG
              Oasis
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

        <form
          onSubmit={addStudent}
          style={{
            marginTop: 20,
            display: "grid",
            gap: 10,
            gridTemplateColumns: "1.2fr 1fr 1.4fr auto",
          }}
        >
          <input
            style={styles.input}
            placeholder="Họ tên *"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            required
          />
          <input
            style={styles.input}
            placeholder="SĐT"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
          <select
            style={styles.select}
            value={packageId}
            onChange={(e) => setPackageId(e.target.value)}
          >
            {Object.entries(pkgGroups).map(([label, pkgs]) => (
              <optgroup key={label} label={label}>
                {pkgs.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} · {formatSwimPrice(p)}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <button type="submit" style={styles.btn} disabled={busy}>
            {busy ? "…" : "Thêm"}
          </button>
          <input
            style={{ ...styles.input, gridColumn: "1 / -1" }}
            placeholder="Ghi chú (tuỳ chọn)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </form>

        <div
          style={{
            marginTop: 16,
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <input
            style={{ ...styles.input, maxWidth: 240 }}
            placeholder="Tìm tên / SĐT / gói"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <select
            style={{ ...styles.select, maxWidth: 160 }}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="ACTIVE">Đang học</option>
            <option value="PAUSED">Tạm dừng</option>
            <option value="DONE">Xong</option>
            <option value="ALL">Tất cả</option>
          </select>
          <button type="button" style={styles.ghost} onClick={() => void load()}>
            Làm mới
          </button>
          <span style={{ ...styles.mute, margin: 0 }}>
            {students.length} học viên
          </span>
        </div>

        {error ? (
          <p style={{ ...styles.err, marginTop: 12 }}>{error}</p>
        ) : null}

        <div style={{ marginTop: 16, overflowX: "auto" }}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Họ tên</th>
                <th style={styles.th}>SĐT</th>
                <th style={styles.th}>Gói</th>
                <th style={styles.th}>Buổi</th>
                <th style={styles.th}>Lượt TC</th>
                <th style={styles.th}>TT</th>
                <th style={styles.th}>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {students.length === 0 ? (
                <tr>
                  <td style={styles.td} colSpan={7}>
                    Chưa có học viên. Thêm ở form trên.
                  </td>
                </tr>
              ) : (
                students.map((s) => (
                  <tr key={s.id}>
                    <td style={{ ...styles.td, fontWeight: 700 }}>
                      {s.fullName}
                      {s.note ? (
                        <div style={{ fontWeight: 400, color: "#64748b", fontSize: 12 }}>
                          {s.note}
                        </div>
                      ) : null}
                    </td>
                    <td style={styles.td}>{s.phone || "—"}</td>
                    <td style={styles.td}>{s.packageLabel}</td>
                    <td style={{ ...styles.td, fontWeight: 800 }}>
                      {s.sessionsTotal > 0
                        ? `${s.sessionsLeft}/${s.sessionsTotal}`
                        : "Theo tháng"}
                    </td>
                    <td style={styles.td}>
                      {s.bonusVisitsTotal > 0
                        ? `${s.bonusVisitsLeft}/${s.bonusVisitsTotal}`
                        : "—"}
                    </td>
                    <td style={styles.td}>
                      <span
                        style={{
                          display: "inline-block",
                          padding: "2px 8px",
                          borderRadius: 999,
                          fontSize: 11,
                          fontWeight: 700,
                          background:
                            s.status === "ACTIVE"
                              ? "#dbeafe"
                              : s.status === "PAUSED"
                                ? "#fef3c7"
                                : "#f1f5f9",
                          color:
                            s.status === "ACTIVE"
                              ? "#1e3a8a"
                              : s.status === "PAUSED"
                                ? "#92400e"
                                : "#475569",
                        }}
                      >
                        {s.status === "ACTIVE"
                          ? "Đang học"
                          : s.status === "PAUSED"
                            ? "Tạm dừng"
                            : "Xong"}
                      </span>
                    </td>
                    <td style={styles.td}>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {s.sessionsTotal > 0 ? (
                          <button
                            type="button"
                            style={{
                              ...styles.btn,
                              height: 34,
                              fontSize: 12,
                              background: "#0369a1",
                            }}
                            disabled={busy || s.sessionsLeft <= 0}
                            onClick={() =>
                              void patch(s.id, { action: "use-session" })
                            }
                          >
                            −1 buổi
                          </button>
                        ) : null}
                        {s.bonusVisitsTotal > 0 ? (
                          <button
                            type="button"
                            style={{
                              ...styles.btn,
                              height: 34,
                              fontSize: 12,
                              background: "#0f766e",
                            }}
                            disabled={busy || s.bonusVisitsLeft <= 0}
                            onClick={() =>
                              void patch(s.id, { action: "use-bonus" })
                            }
                          >
                            −1 lượt
                          </button>
                        ) : null}
                        {s.status === "ACTIVE" ? (
                          <button
                            type="button"
                            style={{ ...styles.ghost, height: 34, fontSize: 12 }}
                            disabled={busy}
                            onClick={() =>
                              void patch(s.id, { status: "PAUSED" })
                            }
                          >
                            Tạm dừng
                          </button>
                        ) : s.status === "PAUSED" ? (
                          <button
                            type="button"
                            style={{ ...styles.ghost, height: 34, fontSize: 12 }}
                            disabled={busy}
                            onClick={() =>
                              void patch(s.id, { status: "ACTIVE" })
                            }
                          >
                            Tiếp tục
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
