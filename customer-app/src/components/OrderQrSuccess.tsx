"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

/**
 * After the customer sends an order: no confirmation QR.
 * Staff duyệt thành công → customer sees payment done.
 * The bill photo is a later staff proof, not shown here.
 */
export function OrderQrSuccess({
  title,
  detailLines,
  cartToken,
  initialStatus,
  customerName,
  onDone,
}: {
  title: string;
  subtitle?: string;
  detailLines?: string[];
  cartToken?: string;
  initialStatus?: string;
  payload?: string | null;
  customerName?: string;
  customerCode?: string;
  onDone?: () => void;
}) {
  const [status, setStatus] = useState(initialStatus || "PENDING_APPROVAL");
  const [error, setError] = useState("");
  const [dismissed, setDismissed] = useState(false);
  const polling = useRef(true);

  const pending = status === "PENDING_APPROVAL";
  const accepted = status === "OPEN" || status === "USED";

  useEffect(() => {
    if (!cartToken || !pending) return;
    polling.current = true;
    let cancelled = false;

    const tick = async () => {
      if (cancelled || !polling.current) return;
      try {
        const res = await fetch(
          `/api/me/cart?token=${encodeURIComponent(cartToken)}`,
          { cache: "no-store" }
        );
        if (res.ok) {
          const data = await res.json();
          if (cancelled) return;
          if (data.status && data.status !== "PENDING_APPROVAL") {
            setStatus(data.status);
            if (
              data.status !== "OPEN" &&
              data.status !== "USED"
            ) {
              setError(
                data.status === "REJECTED"
                  ? `Từ chối: ${data.adminNote || "Quầy không duyệt."}`
                  : data.status === "CANCELLED"
                    ? "Yêu cầu đã bị huỷ."
                    : data.status === "EXPIRED" || data.status === "NO_SHOW"
                      ? "Quá giờ / không tới."
                      : `Trạng thái: ${data.status}`
              );
            }
            return;
          }
        }
      } catch {
        /* soft retry */
      }
      if (!cancelled && polling.current) {
        window.setTimeout(() => void tick(), 1200);
      }
    };
    void tick();
    return () => {
      cancelled = true;
      polling.current = false;
    };
  }, [cartToken, pending]);

  if (dismissed && pending) {
    return (
      <div className="animate-rise flex min-h-[50dvh] flex-col items-center justify-center px-4 text-center">
        <p className="font-display text-2xl font-semibold text-oasis-ink">
          Đã ẩn hộp chờ
        </p>
        <p className="mt-2 max-w-sm text-sm text-oasis-mute">
          Đơn vẫn đang chờ quầy — xem trạng thái tại trang cá nhân.
        </p>
        <Link
          href="/account"
          className="mt-6 flex h-14 w-full max-w-sm items-center justify-center rounded-2xl bg-oasis-deep text-base font-bold text-oasis-sand"
        >
          Vào trang cá nhân
        </Link>
        {onDone ? (
          <button
            type="button"
            onClick={onDone}
            className="mt-3 text-sm font-bold text-oasis-mute"
          >
            Chọn thêm
          </button>
        ) : null}
      </div>
    );
  }

  const headline = pending ? "Đã gửi đơn" : accepted ? "Thanh toán thành công" : title;
  const lead = pending
    ? "Chờ quầy duyệt. Khi quầy bấm duyệt thành công, thanh toán của bạn xong."
    : error
      ? error
      : "Thanh toán xong.";

  return (
    <div className="animate-rise flex min-h-[70dvh] flex-col items-center px-1 py-4 text-center">
      <p className="text-xs font-bold uppercase tracking-[0.28em] text-oasis-mute">
        HHG Oasis
      </p>
      <h1 className="mt-2 font-display text-3xl font-semibold text-oasis-ink">
        {headline}
      </h1>
      <p className="mt-2 max-w-sm text-sm text-oasis-mute">{lead}</p>

      {pending ? (
        <div className="mt-6 w-full max-w-sm rounded-[28px] bg-amber-50 p-5 shadow-soft">
          <p className="font-display text-xl font-semibold text-oasis-ink">
            Đang chờ quầy xác nhận
          </p>
          {customerName ? (
            <p className="mt-3 font-semibold text-oasis-ink">{customerName}</p>
          ) : null}
          <button
            type="button"
            onClick={() => setDismissed(true)}
            className="mt-5 flex h-12 w-full items-center justify-center rounded-2xl border border-oasis-line bg-white text-sm font-bold text-oasis-ink"
          >
            Tắt hộp chờ
          </button>
        </div>
      ) : accepted ? (
        <div className="mt-6 w-full max-w-sm rounded-[28px] bg-emerald-50 p-5 shadow-soft">
          <p className="font-display text-xl font-semibold text-emerald-900">
            Giao dịch đã hoàn thành
          </p>
          {customerName ? (
            <p className="mt-2 font-semibold text-oasis-ink">{customerName}</p>
          ) : null}
        </div>
      ) : null}

      {detailLines?.length ? (
        <ul className="mt-4 w-full max-w-sm space-y-1 rounded-[22px] bg-white/80 p-4 text-left text-sm shadow-soft">
          <li className="text-[11px] font-bold uppercase tracking-wide text-oasis-mute">
            Đơn của bạn
          </li>
          {detailLines.map((line, i) => (
            <li key={i} className="text-oasis-ink">
              {line}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-6 grid w-full max-w-sm gap-3">
        <Link
          href="/account"
          className="flex h-14 items-center justify-center rounded-2xl bg-oasis-deep text-base font-bold text-oasis-sand"
        >
          Vào trang cá nhân
        </Link>
        {onDone ? (
          <button
            type="button"
            onClick={onDone}
            className="flex h-12 items-center justify-center text-sm font-bold text-oasis-mute"
          >
            Chọn thêm
          </button>
        ) : (
          <Link
            href="/home"
            className="flex h-12 items-center justify-center text-sm font-bold text-oasis-mute"
          >
            Về Home
          </Link>
        )}
      </div>
    </div>
  );
}
