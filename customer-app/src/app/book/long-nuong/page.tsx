"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DateChipRow } from "@/components/DateChipRow";
import { Shell } from "@/components/Shell";
import { fetchAuthMe } from "@/lib/auth-me-client";
import { OrderQrSuccess } from "@/components/OrderQrSuccess";
import { isValidPhone } from "@/lib/phone";
import { formatVnDateTime, formatVnTime } from "@/lib/vn-time";
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

/** Tạm ẩn sơ đồ 30 bàn. Bật lại khi chọn bàn trở lại. */
const SHOW_TABLE_BOARD = false;

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

  const [step, setStep] = useState<"board" | "confirm" | "success">(
    SHOW_TABLE_BOARD ? "board" : "confirm"
  );
  const [tables, setTables] = useState<Table[]>([]);
  const [tableId, setTableId] = useState("");
  const [dateKey, setDateKey] = useState(todayKey);
  const [arriveHm, setArriveHm] = useState("");
  const [guestName, setGuestName] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [partySize, setPartySize] = useState(2);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [success, setSuccess] = useState<{
    tableName: string;
    bookingCode: string;
    arriveLabel: string;
    partySize: number;
    guestName: string;
    guestPhone: string;
    cartToken: string;
    cartStatus: string;
    payload: string | null;
    customerName?: string;
    customerCode?: string;
  } | null>(null);

  const selected = tables.find((t) => t.id === tableId) || null;
  const loadKey = step === "board" ? todayKey : dateKey;

  const validated = useMemo(() => {
    if (!arriveHm) return null;
    if (SHOW_TABLE_BOARD && !selected) return null;
    return validateArrival(dateKey, arriveHm, selected?.bookings || []);
  }, [selected, arriveHm, dateKey]);

  const rangeOk = validated?.ok === true;
  const nameOk = guestName.trim().length >= 2;
  const phoneOk = isValidPhone(guestPhone);
  const guestsOk = partySize >= 1 && partySize <= 20;
  const canSend = rangeOk && nameOk && phoneOk && guestsOk;
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
      const me = await fetchAuthMe();
      const data = await me.json();
      if (!data.authenticated) {
        router.replace("/login");
        return;
      }
      if (!cancelled) {
        setGuestName(String(data.customer?.fullName || ""));
        setGuestPhone(String(data.customer?.phone || ""));
        setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  useEffect(() => {
    if (!SHOW_TABLE_BOARD) return;
    void loadTables();
    const t = setInterval(() => {
      if (document.visibilityState === "hidden") return;
      void loadTables();
    }, 5000);
    return () => clearInterval(t);
  }, [loadTables]);

  useEffect(() => {
    setArriveHm("");
    setError("");
  }, [dateKey, tableId]);

  function openTable(t: Table) {
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
    if (!canSend || !validated || !validated.ok || busy) return;
    if (SHOW_TABLE_BOARD && !tableId) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/long-nuong/book", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          resourceId: SHOW_TABLE_BOARD ? tableId : "",
          startAt: validated.startAt,
          endAt: validated.endAt,
          partySize,
          guestFullName: guestName.trim(),
          guestPhone: guestPhone.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gửi yêu cầu thất bại");
      const start = new Date(data.booking?.startAt || validated.startAt);
      const arriveLabel = formatVnDateTime(start);
      setSuccess({
        tableName: data.booking?.tableName || selected?.name || "",
        bookingCode: data.booking?.bookingCode || "",
        arriveLabel,
        partySize: Number(data.booking?.partySize) || partySize,
        guestName: guestName.trim(),
        guestPhone: guestPhone.trim(),
        cartToken: data.cart?.token || "",
        cartStatus: data.cart?.status || "PENDING_APPROVAL",
        payload: data.payload || data.cart?.payload || null,
        customerName: data.customer?.fullName,
        customerCode: data.customer?.customerCode,
      });
      setStep("success");
      if (SHOW_TABLE_BOARD) await loadTables();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gửi yêu cầu thất bại");
      if (SHOW_TABLE_BOARD) await loadTables();
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

  if (step === "success" && success && SHOW_TABLE_BOARD && success.payload) {
    return (
      <Shell showNav={false}>
        <OrderQrSuccess
          title="Đã gửi yêu cầu bàn"
          subtitle="Thanh toán tại quầy. Khi quầy xác nhận giao dịch, thanh toán của bạn xong."
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

  if (step === "success" && success) {
    return (
      <Shell showNav={false}>
        <div className="-mx-5 -mt-2 min-h-[100dvh] bg-[#f7f7f5] px-5 pb-16 pt-8 text-[#0b1220]">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#9a3412]">
            Lòng nướng
          </p>
          <h1 className="mt-2 font-display text-3xl font-black">
            Đã gửi yêu cầu
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-slate-600">
            Quầy sẽ gọi để hỏi lại và xác nhận. Khi đến, nói tên hoặc số điện
            thoại.
          </p>
          <div className="mt-6 space-y-2 rounded-3xl bg-white p-4 shadow-sm">
            <Row label="Tên" value={success.guestName} />
            <Row label="Số điện thoại" value={success.guestPhone} />
            <Row label="Giờ đến" value={success.arriveLabel} />
            <Row label="Số khách" value={String(success.partySize)} />
          </div>
          <Link
            href="/home"
            className="mt-8 flex h-14 items-center justify-center rounded-full bg-[#9a3412] text-base font-bold tracking-wide text-white"
          >
            Về trang chủ
          </Link>
        </div>
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
            {step === "board" || !SHOW_TABLE_BOARD ? (
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
          <p className="mt-4 text-center text-xs font-bold uppercase tracking-[0.35em] text-orange-300/90">
            {SHOW_TABLE_BOARD ? "Tables" : "Đặt bàn"}
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
            {step === "board" && SHOW_TABLE_BOARD ? (
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
                  {selected ? `${selected.name} — giờ đến` : "Đặt bàn"}
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  {SHOW_TABLE_BOARD
                    ? "Chọn ngày và giờ đến để kiểm tra còn chỗ, rồi gửi yêu cầu (không chọn đồ ăn)."
                    : "Điền tên, số điện thoại, giờ đến và số khách. Quầy sẽ gọi xác nhận. Khi đến, nói tên hoặc số điện thoại."}
                </p>

                {SHOW_TABLE_BOARD ? null : (
                  <>
                    <label className="mt-6 block text-sm font-bold text-slate-700">
                      Họ tên
                      <input
                        value={guestName}
                        onChange={(e) => setGuestName(e.target.value)}
                        autoComplete="name"
                        className="mt-2 h-14 w-full rounded-2xl border border-slate-200 bg-white px-4 text-base font-semibold text-[#0b1220] outline-none"
                      />
                    </label>
                    <label className="mt-4 block text-sm font-bold text-slate-700">
                      Số điện thoại
                      <input
                        value={guestPhone}
                        onChange={(e) => setGuestPhone(e.target.value)}
                        inputMode="tel"
                        autoComplete="tel"
                        className="mt-2 h-14 w-full rounded-2xl border border-slate-200 bg-white px-4 text-base font-semibold text-[#0b1220] outline-none"
                      />
                    </label>
                  </>
                )}

                <h3 className="mt-6 text-sm font-bold text-slate-700">
                  Ngày tháng năm
                </h3>
                <DateChipRow
                  dates={dates}
                  value={dateKey}
                  onChange={setDateKey}
                  activeClassName="bg-[#9a3412] text-white"
                />
                {dateMeta ? (
                  <p className="mt-2 text-xs font-semibold text-slate-500">
                    {dateMeta.label}
                  </p>
                ) : null}

                {SHOW_TABLE_BOARD ? (
                  <>
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
                  </>
                ) : (
                  <div className="mt-6 grid grid-cols-2 items-end gap-3">
                    <div>
                      <p className="text-sm font-bold leading-5 text-slate-700">
                        Số khách
                      </p>
                      <div className="mt-2 flex h-14 items-center justify-between rounded-2xl border border-slate-200 bg-white px-2">
                        <button
                          type="button"
                          aria-label="Giảm số khách"
                          onClick={() =>
                            setPartySize((n) => Math.max(1, n - 1))
                          }
                          className="grid h-9 w-9 place-items-center rounded-full bg-slate-100 text-lg font-bold"
                        >
                          −
                        </button>
                        <span className="text-lg font-black">{partySize}</span>
                        <button
                          type="button"
                          aria-label="Tăng số khách"
                          onClick={() =>
                            setPartySize((n) => Math.min(20, n + 1))
                          }
                          className="grid h-9 w-9 place-items-center rounded-full bg-slate-100 text-lg font-bold"
                        >
                          +
                        </button>
                      </div>
                    </div>
                    <label className="block min-w-0">
                      <span className="block text-sm font-bold leading-5 text-slate-700">
                        Giờ đến
                      </span>
                      <input
                        type="time"
                        step={300}
                        min={minutesToHm(LONG_NUONG_OPEN_MIN)}
                        max={minutesToHm(LONG_NUONG_CLOSE_MIN)}
                        value={arriveHm}
                        onChange={(e) => setArriveHm(e.target.value)}
                        className="mt-2 h-14 w-full rounded-2xl border border-slate-200 bg-white px-3 text-base font-bold text-[#0b1220] outline-none"
                      />
                    </label>
                  </div>
                )}
                {SHOW_TABLE_BOARD ? null : (
                  <p className="mt-2 text-xs text-slate-500">
                    Mở cửa {minutesToHm(LONG_NUONG_OPEN_MIN)}–
                    {minutesToHm(LONG_NUONG_CLOSE_MIN)}
                  </p>
                )}

                {validated && !validated.ok ? (
                  <p className="mt-3 text-sm font-semibold text-red-600">
                    {validated.error}
                  </p>
                ) : null}

                {SHOW_TABLE_BOARD && rangeOk ? (
                  <p className="mt-3 text-sm font-semibold text-emerald-700">
                    Khung giờ còn trống — có thể gửi yêu cầu.
                  </p>
                ) : null}

                {SHOW_TABLE_BOARD ? (
                  (selected?.bookings?.length || 0) > 0 ? (
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
                  )
                ) : null}

                {error ? (
                  <p className="mt-4 text-sm font-semibold text-red-600">
                    {error}
                  </p>
                ) : null}

                <button
                  type="button"
                  disabled={(SHOW_TABLE_BOARD ? !rangeOk : !canSend) || busy}
                  onClick={() => void bookNow()}
                  className="mt-6 flex h-14 w-full items-center justify-center rounded-full bg-[#9a3412] text-base font-bold tracking-wide text-white disabled:opacity-40"
                >
                  {busy
                    ? "Đang gửi…"
                    : SHOW_TABLE_BOARD
                      ? "GỬI YÊU CẦU"
                      : "GỬI YÊU CẦU"}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </Shell>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-slate-100 py-2 last:border-0">
      <span className="text-sm text-slate-500">{label}</span>
      <span className="text-right text-sm font-bold">{value}</span>
    </div>
  );
}

function fmtRange(startAt: string, endAt: string) {
  return `${formatVnTime(new Date(startAt))} – ${formatVnTime(new Date(endAt))}`;
}
