"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Shell } from "@/components/Shell";
import { OrderQrSuccess } from "@/components/OrderQrSuccess";
import {
  LONG_NUONG_CLOSE_MIN,
  LONG_NUONG_OPEN_MIN,
  buildDateOptions,
  localDayKey,
  minutesToHm,
  tableTone,
  validateArrival,
  type TableVisualStatus,
} from "@/lib/long-nuong";

type Table = {
  id: string;
  code: string;
  name: string;
  shortLabel: string;
  status: TableVisualStatus;
  bookings: { id: string; startAt: string; endAt: string }[];
};

export default function LongNuongBookPage() {
  const router = useRouter();
  const dates = useMemo(() => buildDateOptions(14), []);
  const todayKey = useMemo(() => localDayKey(), []);

  const [step, setStep] = useState<"board" | "confirm" | "success">("board");
  const [tables, setTables] = useState<Table[]>([]);
  const [tableId, setTableId] = useState("");
  const [dateKey, setDateKey] = useState(todayKey);
  const [arriveHm, setArriveHm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [pointsBalance, setPointsBalance] = useState(0);
  const [success, setSuccess] = useState<{
    tableName: string;
    bookingCode: string;
    arriveLabel: string;
    cartToken: string;
    cartStatus: string;
    payload: string | null;
    customerName?: string;
    customerCode?: string;
  } | null>(null);

  const selected = tables.find((t) => t.id === tableId) || null;
  const loadKey = step === "board" ? todayKey : dateKey;

  const validated = useMemo(() => {
    if (!selected || !arriveHm) return null;
    return validateArrival(dateKey, arriveHm, selected.bookings || []);
  }, [selected, arriveHm, dateKey]);

  const rangeOk = validated?.ok === true;
  const dateMeta = dates.find((d) => d.key === dateKey);

  const loadTables = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/long-nuong/tables?date=${encodeURIComponent(loadKey)}`,
        { cache: "no-store" }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Không tải được bàn");
      setTables(data.tables || []);
      if (step === "board") setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lỗi tải bàn");
    }
  }, [loadKey, step]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const me = await fetch("/api/auth/me", { cache: "no-store" });
      const data = await me.json();
      if (!data.authenticated) {
        router.replace("/login");
        return;
      }
      if (!cancelled) {
        setPointsBalance(Number(data.customer?.pointsBalance) || 0);
        setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  useEffect(() => {
    if (!ready) return;
    void loadTables();
    const t = setInterval(() => void loadTables(), 5000);
    return () => clearInterval(t);
  }, [ready, loadTables]);

  useEffect(() => {
    setArriveHm("");
    setError("");
  }, [dateKey, tableId]);

  function openTable(t: Table) {
    if (t.status === "occupied" && dateKey === todayKey) {
      // vẫn cho mở để đặt khung giờ khác / ngày khác
    }
    setTableId(t.id);
    setDateKey(todayKey);
    setArriveHm("");
    setError("");
    setStep("confirm");
  }

  function backToBoard() {
    setStep("board");
    setTableId("");
    setArriveHm("");
    setDateKey(todayKey);
    setError("");
  }

  async function bookNow() {
    if (!tableId || !rangeOk || !validated || !validated.ok || busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/long-nuong/book", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          resourceId: tableId,
          startAt: validated.startAt,
          endAt: validated.endAt,
          partySize: 4,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Đặt bàn thất bại");
      const start = new Date(data.booking?.startAt || validated.startAt);
      const arriveLabel = start.toLocaleString("vi-VN", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
      setSuccess({
        tableName: data.booking?.tableName || selected?.name || "Bàn",
        bookingCode: data.booking?.bookingCode || "",
        arriveLabel,
        cartToken: data.cart?.token || "",
        cartStatus: data.cart?.status || "PENDING_APPROVAL",
        payload: data.cart?.payload || null,
        customerName: data.customer?.fullName,
        customerCode: data.customer?.customerCode,
      });
      setStep("success");
      await loadTables();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Đặt bàn thất bại");
      await loadTables();
    } finally {
      setBusy(false);
    }
  }

  if (!ready) {
    return (
      <Shell showNav={false}>
        <p className="p-8 text-center text-sm text-white/70">Đang tải…</p>
      </Shell>
    );
  }

  if (step === "success" && success) {
    return (
      <Shell showNav={false}>
        <OrderQrSuccess
          title="Đã gửi yêu cầu bàn"
          subtitle="Chờ quầy duyệt → nhận QR xác nhận → đến nơi đưa QR cho nhân viên quét."
          detailLines={[
            success.tableName,
            `Đến: ${success.arriveLabel}`,
            success.bookingCode,
          ]}
          cartToken={success.cartToken}
          initialStatus={success.cartStatus}
          payload={success.payload}
          customerName={success.customerName}
          customerCode={success.customerCode}
          onDone={() => {
            setSuccess(null);
            setStep("board");
            setTableId("");
            setArriveHm("");
          }}
        />
      </Shell>
    );
  }

  return (
    <Shell showNav={false}>
      <div className="-mx-5 -mt-2 min-h-[100dvh] bg-[#1c0f0a] text-white">
        <div
          className="relative overflow-hidden px-5 pb-8 pt-6"
          style={{
            background:
              "linear-gradient(180deg, rgba(28,15,10,.4), rgba(28,15,10,.94)), url('https://images.unsplash.com/photo-1555939594-58d7cb561ad1?auto=format&fit=crop&w=1200&q=60') center/cover",
            minHeight: step === "board" ? 200 : 160,
          }}
        >
          <div className="flex items-center justify-between">
            {step === "board" ? (
              <Link
                href="/home"
                className="grid h-10 w-10 place-items-center rounded-full bg-white/15 text-lg"
              >
                ←
              </Link>
            ) : (
              <button
                type="button"
                onClick={backToBoard}
                className="grid h-10 w-10 place-items-center rounded-full bg-white/15 text-lg"
              >
                ←
              </button>
            )}
            <Link
              href="/account"
              className="grid h-10 w-10 place-items-center rounded-full bg-white/15 text-sm font-bold"
            >
              ◯
            </Link>
          </div>
          <p className="mt-4 text-center text-sm font-semibold text-orange-200/90">
            {pointsBalance} điểm
          </p>
          <p className="mt-2 text-center text-xs font-bold uppercase tracking-[0.35em] text-orange-300/90">
            Tables
          </p>
          <h1 className="mt-2 text-center font-display text-4xl font-black tracking-wide">
            LÒNG NƯỚNG
          </h1>
          <p className="mt-1 text-center text-sm font-semibold uppercase tracking-[0.22em] text-white/70">
            {step === "board"
              ? "Chọn bàn"
              : selected
                ? `Bàn ${selected.shortLabel}`
                : "Giờ đến"}
          </p>
        </div>

        <div className="-mt-4">
          <div className="rounded-t-[36px] bg-[#f7f7f5] px-5 pb-28 pt-6 text-[#0b1220]">
            {step === "board" ? (
              <>
                <div className="flex items-end justify-between">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">
                      Đặt bàn
                    </p>
                    <h2 className="text-xl font-black">30 BÀN</h2>
                  </div>
                  <span className="text-4xl font-black text-slate-200">
                    {String(tables.length || 30).padStart(2, "0")}
                  </span>
                </div>

                <p className="mt-2 text-xs text-slate-500">
                  Xanh = trống · Cam = đang giữ · Đỏ = đang dùng (hiện tại) ·
                  Chọn bàn → điền ngày & giờ đến
                </p>

                <div className="mt-4 grid grid-cols-5 gap-2">
                  {tables.map((t) => {
                    const tone = tableTone(t.status);
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => openTable(t)}
                        className="relative flex aspect-square flex-col items-center justify-center rounded-[16px] text-center transition active:scale-[0.98]"
                        style={{ background: tone.bg, color: tone.fg }}
                      >
                        <span className="text-lg font-black tracking-wide">
                          {t.shortLabel}
                        </span>
                        <span className="mt-0.5 text-[8px] font-bold uppercase leading-tight">
                          {tone.label}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {error ? (
                  <p className="mt-4 text-sm font-semibold text-red-600">
                    {error}
                  </p>
                ) : null}
              </>
            ) : (
              <>
                <h2 className="text-lg font-bold">
                  {selected?.name || "Bàn"} — giờ đến
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Chọn ngày & tự điền giờ đến để kiểm tra còn chỗ, rồi gửi QR
                  xác nhận (không chọn đồ ăn).
                </p>

                <h3 className="mt-6 text-sm font-bold text-slate-700">
                  Ngày tháng năm
                </h3>
                <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                  {dates.map((d) => {
                    const on = d.key === dateKey;
                    return (
                      <button
                        key={d.key}
                        type="button"
                        onClick={() => setDateKey(d.key)}
                        className={`flex h-[4.5rem] w-16 shrink-0 flex-col items-center justify-center rounded-2xl text-sm font-bold ${
                          on
                            ? "bg-[#9a3412] text-white"
                            : "bg-white text-[#64748b] shadow-sm"
                        }`}
                      >
                        <span className="text-[10px] uppercase tracking-wide">
                          {d.weekday}
                        </span>
                        <span className="text-lg leading-none">{d.dayNum}</span>
                        <span className="mt-0.5 text-[9px] opacity-80">
                          {padMonth(d.date)}
                        </span>
                      </button>
                    );
                  })}
                </div>
                {dateMeta ? (
                  <p className="mt-2 text-xs font-semibold text-slate-500">
                    {dateMeta.label}
                  </p>
                ) : null}

                <h3 className="mt-6 text-sm font-bold text-slate-700">
                  Giờ đến (khách tự điền)
                </h3>
                <p className="mt-1 text-xs text-slate-500">
                  Mở cửa {minutesToHm(LONG_NUONG_OPEN_MIN)}–
                  {minutesToHm(LONG_NUONG_CLOSE_MIN)}
                </p>
                <input
                  type="time"
                  step={300}
                  min={minutesToHm(LONG_NUONG_OPEN_MIN)}
                  max={minutesToHm(LONG_NUONG_CLOSE_MIN)}
                  value={arriveHm}
                  onChange={(e) => setArriveHm(e.target.value)}
                  className="mt-3 h-14 w-full rounded-2xl border border-slate-200 bg-white px-4 text-lg font-bold text-[#0b1220] outline-none"
                />

                {validated && !validated.ok ? (
                  <p className="mt-3 text-sm font-semibold text-red-600">
                    {validated.error}
                  </p>
                ) : null}
                {rangeOk ? (
                  <p className="mt-3 text-sm font-semibold text-emerald-700">
                    Khung giờ còn trống — có thể gửi QR xác nhận.
                  </p>
                ) : null}

                {(selected?.bookings?.length || 0) > 0 ? (
                  <div className="mt-5">
                    <h3 className="text-sm font-bold text-slate-700">
                      Lịch bàn ngày này
                    </h3>
                    <div className="mt-2 space-y-1.5 rounded-2xl bg-white p-2 shadow-sm">
                      {selected!.bookings.map((b) => (
                        <div
                          key={b.id}
                          className="rounded-xl bg-[#fecaca] px-3 py-2 text-sm font-semibold text-[#7f1d1d]"
                        >
                          {fmtRange(b.startAt, b.endAt)} · đã đặt
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="mt-5 text-sm text-slate-500">
                    Ngày này chưa có lịch đặt trên bàn này.
                  </p>
                )}

                {error ? (
                  <p className="mt-4 text-sm font-semibold text-red-600">
                    {error}
                  </p>
                ) : null}

                <button
                  type="button"
                  disabled={!rangeOk || busy}
                  onClick={() => void bookNow()}
                  className="mt-6 flex h-14 w-full items-center justify-center rounded-full bg-[#9a3412] text-base font-bold tracking-wide text-white disabled:opacity-40"
                >
                  {busy ? "Đang gửi…" : "GỬI QR XÁC NHẬN"}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </Shell>
  );
}

function padMonth(d: Date) {
  return `${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

function fmtRange(startAt: string, endAt: string) {
  const a = new Date(startAt);
  const b = new Date(endAt);
  const t = (d: Date) =>
    d.toLocaleTimeString("vi-VN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  return `${t(a)} – ${t(b)}`;
}
