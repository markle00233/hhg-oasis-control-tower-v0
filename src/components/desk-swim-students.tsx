"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
  hasBillPhoto: boolean;
  updatedAt: string;
};

const BILL_MAX_CHARS = 700_000;

/** Shrink a phone photo until the data URL is small enough to store and send. */
async function fileToBillPhoto(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  try {
    let maxEdge = 1280;
    let quality = 0.72;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Không đọc được ảnh bill.");
    for (let attempt = 0; attempt < 6; attempt++) {
      const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
      const w = Math.max(1, Math.round(bitmap.width * scale));
      const h = Math.max(1, Math.round(bitmap.height * scale));
      canvas.width = w;
      canvas.height = h;
      ctx.drawImage(bitmap, 0, 0, w, h);
      const dataUrl = canvas.toDataURL("image/jpeg", quality);
      if (dataUrl.startsWith("data:image/jpeg") && dataUrl.length <= BILL_MAX_CHARS) {
        return dataUrl;
      }
      quality = Math.max(0.42, quality - 0.12);
      maxEdge = Math.round(maxEdge * 0.75);
    }
    throw new Error("Ảnh bill quá lớn. Chụp lại gần hơn hoặc rõ hơn.");
  } finally {
    bitmap.close();
  }
}

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
    overflow: "hidden",
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
    maxWidth: "100%",
    minWidth: 0,
    boxSizing: "border-box",
  } as const,
  select: {
    height: 44,
    borderRadius: 12,
    border: "1px solid #e2e8f0",
    padding: "0 12px",
    fontSize: 14,
    width: "100%",
    maxWidth: "100%",
    minWidth: 0,
    boxSizing: "border-box",
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
  const [billPhoto, setBillPhoto] = useState("");
  const [billName, setBillName] = useState("");
  const [viewingBill, setViewingBill] = useState<string | null>(null);
  const billInputRef = useRef<HTMLInputElement>(null);

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
    const delay = q.trim() ? 280 : 0;
    const timer = setTimeout(() => {
      void load();
    }, delay);
    return () => clearTimeout(timer);
  }, [load, q]);

  async function addStudent(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!billPhoto) {
      setError("Chụp ảnh bill trước khi chốt đơn.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/crm/desk/swim-students", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ fullName, phone, packageId, note, billPhoto }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Không thêm được");
      setFullName("");
      setPhone("");
      setNote("");
      setBillPhoto("");
      setBillName("");
      if (billInputRef.current) billInputRef.current.value = "";
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

  async function onPickBill(file: File | undefined) {
    if (!file) return;
    setError("");
    try {
      if (!file.type.startsWith("image/")) {
        throw new Error("Chỉ nhận ảnh bill.");
      }
      const dataUrl = await fileToBillPhoto(file);
      setBillPhoto(dataUrl);
      setBillName(file.name || "bill.jpg");
    } catch (err) {
      setBillPhoto("");
      setBillName("");
      setError(err instanceof Error ? err.message : "Không đọc được ảnh bill.");
    }
  }

  async function openBill(id: string) {
    setError("");
    try {
      const res = await fetch(
        `/api/crm/desk/swim-students?photoId=${encodeURIComponent(id)}`,
        { cache: "no-store" }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Không mở được bill");
      setViewingBill(String(data.billPhoto || ""));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không mở được bill");
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
              Oasis. Chụp bill bắt buộc để chốt đơn.
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
            width: "100%",
            minWidth: 0,
            gridTemplateColumns:
              "repeat(auto-fit, minmax(min(100%, 11rem), 1fr))",
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
          <button
            type="submit"
            style={{
              ...styles.btn,
              opacity: busy || !billPhoto ? 0.45 : 1,
              cursor: busy || !billPhoto ? "not-allowed" : "pointer",
            }}
            disabled={busy || !billPhoto}
          >
            {busy ? "…" : "Chốt đơn"}
          </button>
          <p style={{ ...styles.mute, gridColumn: "1 / -1", margin: 0 }}>
            SĐT trùng số trên tài khoản khách để họ thấy buổi và lượt còn lại.
          </p>
          <input
            style={{ ...styles.input, gridColumn: "1 / -1" }}
            placeholder="Ghi chú (tuỳ chọn)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <div
            style={{
              gridColumn: "1 / -1",
              display: "flex",
              gap: 12,
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <input
              ref={billInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                void onPickBill(file);
              }}
            />
            <button
              type="button"
              style={styles.ghost}
              onClick={() => billInputRef.current?.click()}
            >
              {billPhoto ? "Chụp lại bill" : "Chụp bill *"}
            </button>
            {billPhoto ? (
              <button
                type="button"
                onClick={() => setViewingBill(billPhoto)}
                style={{
                  border: "1px solid #e2e8f0",
                  background: "#fff",
                  borderRadius: 12,
                  padding: 0,
                  cursor: "pointer",
                  lineHeight: 0,
                }}
              >
                <img
                  src={billPhoto}
                  alt={billName || "Bill"}
                  style={{
                    height: 64,
                    width: 64,
                    objectFit: "cover",
                    borderRadius: 12,
                    display: "block",
                  }}
                />
              </button>
            ) : (
              <span style={{ ...styles.mute, margin: 0 }}>
                Bắt buộc ảnh bill thanh toán trước khi chốt đơn.
              </span>
            )}
          </div>
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
                        {s.hasBillPhoto ? (
                          <button
                            type="button"
                            style={{ ...styles.ghost, height: 34, fontSize: 12 }}
                            onClick={() => void openBill(s.id)}
                          >
                            Xem bill
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
      {viewingBill ? (
        <div
          role="dialog"
          aria-label="Ảnh bill"
          onClick={() => setViewingBill(null)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 80,
            background: "rgba(15,23,42,.72)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
        >
          <img
            src={viewingBill}
            alt="Bill thanh toán"
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: "100%",
              maxHeight: "90dvh",
              borderRadius: 12,
              background: "#fff",
            }}
          />
        </div>
      ) : null}
    </main>
  );
}
