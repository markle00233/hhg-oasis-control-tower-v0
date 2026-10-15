"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Shell } from "@/components/Shell";
import { OrderQrSuccess } from "@/components/OrderQrSuccess";
import {
  buildDateOptions,
  buildDaySchedule,
  buildTimeOptions,
  courtTone,
  formatVnd,
  hmToMinutes,
  localDayKey,
  minutesToHm,
  PICKLEBALL_CLOSE_MIN,
  PICKLEBALL_MIN_DURATION_MIN,
  PICKLEBALL_OPEN_MIN,
  PICKLEBALL_TIME_STEP_MIN,
  priceForRange,
  validateBookRange,
  type CourtVisualStatus,
} from "@/lib/pickleball";

type Court = {
  id: string;
  code: string;
  name: string;
  shortLabel: string;
  status: CourtVisualStatus;
  bookings: { startAt: string; endAt: string }[];
};

export default function PickleballBookPage() {
  const router = useRouter();
  const dates = useMemo(() => buildDateOptions(10), []);
  const todayKey = useMemo(() => localDayKey(), []);

  const [step, setStep] = useState<"board" | "book" | "success">("board");
  const [dateKey, setDateKey] = useState(todayKey);
  const [courtId, setCourtId] = useState("");
  const [fromHm, setFromHm] = useState("");
  const [toHm, setToHm] = useState("");
  const [courts, setCourts] = useState<Court[]>([]);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [successBooking, setSuccessBooking] = useState<{
    id: string;
    bookingCode: string;
    courtName: string;
    startAt: string;
    endAt: string;
    totalVnd: number;
    cartToken: string;
    cartStatus: string;
    payload: string | null;
    customerName?: string;
    customerCode?: string;
  } | null>(null);

  const loadKey = step === "board" ? todayKey : dateKey;
  const selectedCourt = courts.find((c) => c.id === courtId) || null;

  const fromOptions = useMemo(() => buildTimeOptions(), []);
  const fromMin = hmToMinutes(fromHm);
  const toOptions = useMemo(
    () =>
      buildTimeOptions({
        forEnd: true,
        afterMin:
          fromMin != null
            ? fromMin + PICKLEBALL_MIN_DURATION_MIN - PICKLEBALL_TIME_STEP_MIN
            : -1,
      }),
    [fromMin]
  );

  const validated = useMemo(() => {
    if (!selectedCourt || !fromHm || !toHm) return null;
    return validateBookRange(dateKey, fromHm, toHm, selectedCourt.bookings);
  }, [selectedCourt, fromHm, toHm, dateKey]);

  const rangeOk = validated?.ok === true;
  const totalVnd =
    rangeOk && validated.ok
      ? priceForRange(validated.startAt, validated.endAt)
      : 0;

  const schedule = useMemo(
    () =>
      selectedCourt
        ? buildDaySchedule(dateKey, selectedCourt.bookings)
        : [],
    [selectedCourt, dateKey]
  );

  const loadCourts = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/pickleball/courts?date=${encodeURIComponent(loadKey)}`,
        { cache: "no-store" }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Không tải được sân");
      setCourts(data.courts || []);
      if (step === "board") setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lỗi tải sân");
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
      if (!cancelled) setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  useEffect(() => {
    if (!ready) return;
    void loadCourts();
    const t = setInterval(() => void loadCourts(), 5000);
    return () => clearInterval(t);
  }, [ready, loadCourts]);

  useEffect(() => {
    setFromHm("");
    setToHm("");
    setMsg("");
    setError("");
  }, [dateKey, courtId]);

  function openCourt(id: string) {
    setCourtId(id);
    setDateKey(todayKey);
    setFromHm("");
    setToHm("");
    setMsg("");
    setError("");
    setStep("book");
  }

  function backToBoard() {
    setStep("board");
    setCourtId("");
    setFromHm("");
    setToHm("");
    setDateKey(todayKey);
    setMsg("");
    setError("");
  }

  async function bookNow() {
    if (!rangeOk || !validated || !validated.ok || !courtId || busy) return;
    setBusy(true);
    setError("");
    setMsg("");
    try {
      const res = await fetch("/api/pickleball/book", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          resourceId: courtId,
          startAt: validated.startAt,
          endAt: validated.endAt,
          partySize: 4,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Đặt sân thất bại");
      setSuccessBooking({
        id: data.booking?.id || "",
        bookingCode: data.booking?.bookingCode || "",
        courtName: data.booking?.courtName || selectedCourt?.name || "Sân",
        startAt: data.booking?.startAt || validated.startAt,
        endAt: data.booking?.endAt || validated.endAt,
        totalVnd: Number(data.booking?.totalVnd) || totalVnd,
        cartToken: data.cart?.token || "",
        cartStatus: data.cart?.status || "PENDING_APPROVAL",
        payload: data.cart?.payload || null,
        customerName: data.customer?.fullName,
        customerCode: data.customer?.customerCode,
      });
      setFromHm("");
      setToHm("");
      setStep("success");
      await loadCourts();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Đặt sân thất bại");
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

  if (step === "success" && successBooking) {
    const start = new Date(successBooking.startAt);
    const end = new Date(successBooking.endAt);
    return (
      <Shell showNav={false}>
        <OrderQrSuccess
          title="Đã gửi yêu cầu đặt sân"
          subtitle="Chờ nhân viên Pickleball duyệt — sau đó hiện QR mang tới sân."
          detailLines={[
            successBooking.courtName,
            `${start.toLocaleDateString("vi-VN")} · ${start.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", hour12: false })} – ${end.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", hour12: false })}`,
            successBooking.bookingCode,
            formatVnd(successBooking.totalVnd),
          ]}
          cartToken={successBooking.cartToken}
          initialStatus={successBooking.cartStatus}
          payload={successBooking.payload}
          customerName={successBooking.customerName}
          customerCode={successBooking.customerCode}
          onDone={() => {
            setSuccessBooking(null);
            setStep("board");
          }}
        />
      </Shell>
    );
  }

  return (
    <Shell showNav={false}>
      <div className="-mx-5 -mt-2 min-h-[100dvh] bg-[#0b1220] text-white">
        <div
          className="relative overflow-hidden px-5 pb-8 pt-6"
          style={{
            background:
              "linear-gradient(180deg, rgba(11,18,32,.35), rgba(11,18,32,.92)), url('https://images.unsplash.com/photo-1554068865-24cecd4e343f?auto=format&fit=crop&w=1200&q=60') center/cover",
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
          <p className="mt-6 text-center text-xs font-bold uppercase tracking-[0.35em] text-lime-300/90">
            Courts
          </p>
          <h1 className="mt-2 text-center font-display text-4xl font-black tracking-wide">
            PICKLEBALL
          </h1>
          <p className="mt-1 text-center text-sm font-semibold uppercase tracking-[0.28em] text-white/70">
            {step === "board"
              ? "Chọn sân"
              : selectedCourt
                ? `Sân ${selectedCourt.shortLabel}`
                : "Reservation"}
          </p>
        </div>

        <div className="-mt-4">
          <div className="rounded-t-[36px] bg-[#f7f7f5] px-5 pb-28 pt-6 text-[#0b1220]">
            {step === "board" ? (
              <>
                <div className="flex items-end justify-between">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">
                      Pickleball court
                    </p>
                    <h2 className="text-xl font-black">PLAYGROUND</h2>
                  </div>
                  <span className="text-4xl font-black text-slate-200">06</span>
                </div>

                <p className="mt-2 text-xs text-slate-500">
                  Xanh nhạt = trống · Vàng nhạt = sắp hết giờ · Đỏ nhạt = đang
                  chơi · Cập nhật realtime
                </p>

                <div className="mt-4 grid grid-cols-3 gap-3">
                  {courts.map((c) => {
                    const tone = courtTone(c.status);
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => openCourt(c.id)}
                        className="relative flex aspect-square flex-col items-center justify-center rounded-[22px] text-center transition active:scale-[0.98]"
                        style={{ background: tone.bg, color: tone.fg }}
                      >
                        <span className="text-3xl font-black tracking-wide">
                          {c.shortLabel}
                        </span>
                        <span className="mt-1 text-[10px] font-bold uppercase">
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

                <Link
                  href="/account"
                  className="mt-8 block text-center text-sm font-semibold text-slate-500"
                >
                  Xem booking trong tài khoản
                </Link>
              </>
            ) : (
              <>
                <h2 className="text-lg font-bold">Chọn ngày đặt sân</h2>
                <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                  {dates.map((d) => {
                    const on = d.key === dateKey;
                    return (
                      <button
                        key={d.key}
                        type="button"
                        onClick={() => setDateKey(d.key)}
                        className={`flex h-16 w-14 shrink-0 flex-col items-center justify-center rounded-full text-sm font-bold ${
                          on
                            ? "bg-lime-300 text-[#0b1220]"
                            : "bg-white text-[#64748b] shadow-sm"
                        }`}
                      >
                        <span className="text-lg leading-none">{d.dayNum}</span>
                        <span className="mt-1 text-[10px] uppercase tracking-wide">
                          {d.weekday}
                        </span>
                      </button>
                    );
                  })}
                </div>

                <h2 className="mt-6 text-lg font-bold">Chọn khung giờ</h2>
                <p className="mt-1 text-xs text-slate-500">
                  Tự chọn giờ (bước {PICKLEBALL_TIME_STEP_MIN} phút) — ví dụ
                  06:45 → 07:25. Mở cửa{" "}
                  {minutesToHm(PICKLEBALL_OPEN_MIN)}–
                  {minutesToHm(PICKLEBALL_CLOSE_MIN)}, tối thiểu{" "}
                  {PICKLEBALL_MIN_DURATION_MIN} phút.
                </p>

                <div className="mt-3 grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">
                      Từ giờ
                    </span>
                    <input
                      type="time"
                      step={PICKLEBALL_TIME_STEP_MIN * 60}
                      min={minutesToHm(PICKLEBALL_OPEN_MIN)}
                      max={minutesToHm(
                        PICKLEBALL_CLOSE_MIN - PICKLEBALL_MIN_DURATION_MIN
                      )}
                      value={fromHm}
                      onChange={(e) => {
                        const next = e.target.value;
                        setFromHm(next);
                        const nextMin = hmToMinutes(next);
                        const toMin = hmToMinutes(toHm);
                        if (
                          nextMin != null &&
                          toMin != null &&
                          toMin < nextMin + PICKLEBALL_MIN_DURATION_MIN
                        ) {
                          setToHm("");
                        }
                      }}
                      list="pickleball-from-times"
                      className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-3 text-base font-bold text-[#0b1220] outline-none"
                    />
                    <datalist id="pickleball-from-times">
                      {fromOptions.map((o) => (
                        <option key={o.key} value={o.key} />
                      ))}
                    </datalist>
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">
                      Đến giờ
                    </span>
                    <input
                      type="time"
                      step={PICKLEBALL_TIME_STEP_MIN * 60}
                      min={
                        fromMin != null
                          ? minutesToHm(
                              Math.min(
                                PICKLEBALL_CLOSE_MIN,
                                fromMin + PICKLEBALL_MIN_DURATION_MIN
                              )
                            )
                          : minutesToHm(
                              PICKLEBALL_OPEN_MIN + PICKLEBALL_MIN_DURATION_MIN
                            )
                      }
                      max={minutesToHm(PICKLEBALL_CLOSE_MIN)}
                      value={toHm}
                      disabled={!fromHm}
                      onChange={(e) => setToHm(e.target.value)}
                      list="pickleball-to-times"
                      className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-3 text-base font-bold text-[#0b1220] outline-none disabled:opacity-40"
                    />
                    <datalist id="pickleball-to-times">
                      {toOptions.map((o) => (
                        <option key={o.key} value={o.key} />
                      ))}
                    </datalist>
                  </label>
                </div>

                {validated && !validated.ok ? (
                  <p className="mt-2 text-sm font-semibold text-red-600">
                    {validated.error}
                  </p>
                ) : null}

                <h3 className="mt-6 text-sm font-bold text-slate-700">
                  Lịch sân trong ngày
                </h3>
                <p className="mt-1 text-xs text-slate-500">
                  Đỏ = khoảng đã đặt (giờ thật) · Xanh = còn trống
                </p>
                <div className="mt-3 max-h-64 space-y-1.5 overflow-y-auto rounded-2xl bg-white p-2 shadow-sm">
                  {schedule.length === 0 ? (
                    <p className="px-3 py-4 text-sm text-slate-500">
                      Chưa có lịch — cả ngày trống.
                    </p>
                  ) : (
                    schedule.map((row) => {
                      const selected =
                        rangeOk &&
                        validated.ok &&
                        new Date(row.startAt).getTime() <
                          new Date(validated.endAt).getTime() &&
                        new Date(row.endAt).getTime() >
                          new Date(validated.startAt).getTime() &&
                        row.kind === "free";
                      return (
                        <div
                          key={row.key}
                          className={`flex items-center justify-between rounded-xl px-3 py-2.5 text-sm font-semibold ${
                            row.kind === "busy"
                              ? "bg-[#fecaca] text-[#7f1d1d]"
                              : selected
                                ? "bg-lime-200 text-[#14532d] ring-1 ring-[#0b1220]/30"
                                : "bg-[#bbf7d0]/70 text-[#14532d]"
                          }`}
                        >
                          <span>{row.label}</span>
                          <span className="text-[10px] font-bold uppercase tracking-wide">
                            {row.kind === "busy"
                              ? "Hết chỗ"
                              : selected
                                ? "Đang chọn"
                                : "Trống"}
                          </span>
                        </div>
                      );
                    })
                  )}
                </div>

                <div className="mt-8 flex items-end justify-between">
                  <div>
                    <p className="text-sm text-slate-500">Giá</p>
                    <p className="text-3xl font-black">
                      {totalVnd ? formatVnd(totalVnd) : "—"}
                    </p>
                    {fromHm && toHm ? (
                      <p className="text-xs text-slate-500">
                        {fromHm} → {toHm}
                      </p>
                    ) : null}
                  </div>
                </div>

                {error ? (
                  <p className="mt-3 text-sm font-semibold text-red-600">
                    {error}
                  </p>
                ) : null}
                {msg ? (
                  <p className="mt-3 text-sm font-semibold text-emerald-700">
                    {msg}
                  </p>
                ) : null}

                <button
                  type="button"
                  disabled={!rangeOk || busy}
                  onClick={() => void bookNow()}
                  className="mt-5 flex h-14 w-full items-center justify-center rounded-full bg-[#0b1220] text-base font-bold tracking-wide text-white disabled:opacity-40"
                >
                  {busy ? "Đang đặt…" : "BOOK NOW"}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </Shell>
  );
}
