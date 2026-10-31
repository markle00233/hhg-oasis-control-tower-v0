"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DateChipRow } from "@/components/DateChipRow";
import { Shell } from "@/components/Shell";
import { fetchAuthMe } from "@/lib/auth-me-client";
import { OrderQrSuccess } from "@/components/OrderQrSuccess";
import {
  buildDateOptions,
  buildDaySchedule,
  buildTimeOptions,
  courtBoardNote,
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

function TimeMenu({
  label,
  value,
  options,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  options: { key: string; label: string }[];
  disabled?: boolean;
  onChange: (hm: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  useEffect(() => {
    if (!open || !listRef.current) return;
    const selected = listRef.current.querySelector<HTMLElement>(
      "[data-selected='true']"
    );
    if (!selected) return;
    const list = listRef.current;
    list.scrollTop =
      selected.offsetTop - list.clientHeight / 2 + selected.clientHeight / 2;
  }, [open, value]);

  return (
    <div ref={rootRef} className="relative block">
      <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">
        {label}
      </span>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className="flex h-12 w-full items-center justify-between rounded-2xl border border-slate-200 bg-white px-3 text-base font-bold text-[#0b1220] outline-none disabled:opacity-40"
      >
        <span>
          {value
            ? options.find((o) => o.key === value)?.label || value
            : "--:-- --"}
        </span>
        <svg
          viewBox="0 0 24 24"
          aria-hidden
          className="h-4 w-4 shrink-0 text-slate-500"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <circle cx="12" cy="12" r="8" />
          <path d="M12 8v4l2.5 2" strokeLinecap="round" />
        </svg>
      </button>
      {open ? (
        <ul
          ref={listRef}
          className="absolute left-0 right-0 z-30 mt-1 max-h-36 overflow-y-auto overscroll-contain rounded-2xl border border-slate-200 bg-white py-1 shadow-lg"
        >
          {options.map((o) => {
            const selected = o.key === value;
            return (
              <li key={o.key}>
                <button
                  type="button"
                  data-selected={selected ? "true" : undefined}
                  onClick={() => {
                    onChange(o.key);
                    setOpen(false);
                  }}
                  className={`block w-full px-3 py-1.5 text-left text-sm ${
                    selected
                      ? "bg-lime-200 font-bold text-[#0b1220]"
                      : "text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  {o.label}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

type Court = {
  id: string;
  code: string;
  name: string;
  shortLabel: string;
  status: CourtVisualStatus;
  bookings: { startAt: string; endAt: string }[];
};

const SCHEDULE_CLASS = {
  busy: "bg-[#fecaca] text-[#7f1d1d]",
  selected: "bg-lime-200 text-[#14532d] ring-1 ring-[#0b1220]/30",
  free: "bg-[#bbf7d0]/70 text-[#14532d]",
} as const;

const SCHEDULE_LABEL = {
  busy: "Hết chỗ",
  selected: "Đang chọn",
  free: "Trống",
} as const;

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
  const [myBookingId, setMyBookingId] = useState("");
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
        ? buildDaySchedule(
            dateKey,
            selectedCourt.bookings,
            validated && validated.ok
              ? { startAt: validated.startAt, endAt: validated.endAt }
              : null
          )
        : [],
    [selectedCourt, dateKey, validated]
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
      setMyBookingId(
        typeof data.myBooking?.id === "string" ? data.myBooking.id : ""
      );
      if (step === "board") setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lỗi tải sân");
    }
  }, [loadKey, step]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const me = await fetchAuthMe();
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
    void loadCourts();
    const t = setInterval(() => {
      if (document.visibilityState === "hidden") return;
      void loadCourts();
    }, 5000);
    return () => clearInterval(t);
  }, [loadCourts]);

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
          subtitle="Thanh toán tại quầy. Khi quầy xác nhận giao dịch, thanh toán của bạn xong."
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
          <p className="mt-4 text-center text-xs font-bold uppercase tracking-[0.35em] text-lime-300/90">
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

                <p className="mt-2 text-xs leading-relaxed text-slate-500">
                  Màu là lúc này. Xanh trống · Vàng sắp trống · Xanh dương đã có
                  giờ · Hồng đang có khách.
                </p>

                {courts.length > 0 &&
                courts.every((c) => c.status !== "available") ? (
                  <p className="mt-3 rounded-2xl bg-white px-3 py-2 text-xs font-semibold leading-relaxed text-slate-600">
                    Không có sân trống lúc này. Bấm sân để đặt giờ khác.
                  </p>
                ) : null}

                <div className="mt-4 grid grid-cols-3 gap-3">
                  {courts.map((c) => {
                    const tone = courtTone(c.status);
                    const note = courtBoardNote(c.status, todayKey, c.bookings);
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => openCourt(c.id)}
                        className="relative flex aspect-square flex-col items-center justify-center rounded-[22px] px-1.5 text-center transition active:scale-[0.98]"
                        style={{ background: tone.bg, color: tone.fg }}
                      >
                        <span className="text-3xl font-black tracking-wide">
                          {c.shortLabel}
                        </span>
                        <span className="mt-1 text-[10px] font-bold uppercase">
                          {tone.label}
                        </span>
                        {note ? (
                          <span className="mt-0.5 text-[9px] font-semibold leading-tight">
                            {note}
                          </span>
                        ) : null}
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
                  href={
                    myBookingId
                      ? `/activity/booking/${encodeURIComponent(myBookingId)}`
                      : "/account"
                  }
                  className="mt-8 block text-center text-sm font-semibold text-slate-500"
                >
                  Xem booking trong tài khoản
                </Link>
              </>
            ) : (
              <>
                <h2 className="text-lg font-bold">Chọn ngày đặt sân</h2>
                <DateChipRow
                  dates={dates}
                  value={dateKey}
                  onChange={setDateKey}
                  activeClassName="bg-lime-300 text-[#0b1220]"
                />

                <h2 className="mt-6 text-lg font-bold">Chọn khung giờ</h2>
                <p className="mt-1 text-xs text-slate-500">
                  Tự chọn giờ (bước {PICKLEBALL_TIME_STEP_MIN} phút) — ví dụ
                  06:15 → 07:30. Mở cửa{" "}
                  {minutesToHm(PICKLEBALL_OPEN_MIN)}–
                  {minutesToHm(PICKLEBALL_CLOSE_MIN)}, tối thiểu{" "}
                  {PICKLEBALL_MIN_DURATION_MIN} phút.
                </p>

                <div className="mt-3 grid grid-cols-2 gap-3">
                  <TimeMenu
                    label="Từ giờ"
                    value={fromHm}
                    options={fromOptions}
                    onChange={(next) => {
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
                  />
                  <TimeMenu
                    label="Đến giờ"
                    value={toHm}
                    options={toOptions}
                    disabled={!fromHm}
                    onChange={setToHm}
                  />
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
                    schedule.map((row) => (
                      <div
                        key={row.key}
                        className={`flex items-center justify-between rounded-xl px-3 py-2.5 text-sm font-semibold ${SCHEDULE_CLASS[row.kind]}`}
                      >
                        <span>{row.label}</span>
                        <span className="text-[10px] font-bold uppercase tracking-wide">
                          {SCHEDULE_LABEL[row.kind]}
                        </span>
                      </div>
                    ))
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
