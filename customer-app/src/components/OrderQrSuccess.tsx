"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

/**
 * After Tạo QR: chờ nhân viên duyệt → rồi hiện QR.
 * Poll nhẹ (~1.2s) đến khi status OPEN.
 */
export function OrderQrSuccess({
  title,
  subtitle,
  detailLines,
  /** Cart token from /api/me/cart POST */
  cartToken,
  /** Initial status (PENDING_APPROVAL | OPEN) */
  initialStatus,
  /** Prefer cart QR payload when already OPEN */
  payload: initialPayload,
  customerName,
  customerCode,
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
  const [status, setStatus] = useState(
    initialStatus || (initialPayload ? "OPEN" : "PENDING_APPROVAL")
  );
  const [payload, setPayload] = useState(initialPayload || "");
  const [dataUrl, setDataUrl] = useState("");
  const [name, setName] = useState(customerName || "");
  const [code, setCode] = useState(customerCode || "");
  const [error, setError] = useState("");
  const [dismissed, setDismissed] = useState(false);
  const polling = useRef(true);

  const pending = status === "PENDING_APPROVAL";
  const ready = status === "OPEN" && !!payload;

  // Light status poll while pending
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
          if (data.status === "OPEN" && data.payload) {
            setStatus("OPEN");
            setPayload(data.payload);
            return;
          }
          if (data.status && data.status !== "PENDING_APPROVAL") {
            setStatus(data.status);
            if (data.status !== "OPEN") {
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

  // Render QR when payload ready
  useEffect(() => {
    if (!payload) return;
    let cancelled = false;
    (async () => {
      try {
        if (!name && !code) {
          const res = await fetch("/api/me/qr", { cache: "no-store" });
          if (res.ok) {
            const data = await res.json();
            if (!cancelled) {
              setName(data.customer?.fullName || "");
              setCode(data.customer?.customerCode || "");
            }
          }
        }
        const QRCode = (await import("qrcode")).default;
        const url = await QRCode.toDataURL(payload, {
          width: 280,
          margin: 2,
          color: { dark: "#0b1220", light: "#ffffff" },
        });
        if (!cancelled) setDataUrl(url);
      } catch {
        if (!cancelled) setError("Không tạo được QR");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [payload, name, code]);

  if (dismissed && pending) {
    return (
      <div className="animate-rise flex min-h-[50dvh] flex-col items-center justify-center px-4 text-center">
        <p className="font-display text-2xl font-semibold text-oasis-ink">
          Đã ẩn hộp chờ
        </p>
        <p className="mt-2 max-w-sm text-sm text-oasis-mute">
          Vé vẫn đang chờ duyệt — xem trạng thái tại trang cá nhân.
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

  return (
    <div className="animate-rise flex min-h-[70dvh] flex-col items-center px-1 py-4 text-center">
      <p className="text-xs font-bold uppercase tracking-[0.28em] text-oasis-mute">
        HHG Oasis
      </p>
      <h1 className="mt-2 font-display text-3xl font-semibold text-oasis-ink">
        {pending ? "Chờ nhân viên duyệt" : title}
      </h1>
      <p className="mt-2 max-w-sm text-sm text-oasis-mute">
        {pending
          ? "Đã gửi yêu cầu tới quầy. Khi nhân viên xác nhận, mã QR sẽ hiện tại đây."
          : subtitle || "Đưa QR cho nhân viên khu vực."}
      </p>

      {pending ? (
        <div className="mt-6 w-full max-w-sm rounded-[28px] bg-amber-50 p-5 shadow-soft ring-1 ring-amber-200/80">
          <p className="font-display text-xl font-semibold text-oasis-ink">
            Đang chờ duyệt…
          </p>
          <p className="mt-2 text-sm text-oasis-mute">
            Quầy đã nhận yêu cầu. Giữ màn hình hoặc tắt hộp này — vé vẫn hiện
            ở trang cá nhân.
          </p>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            className="mt-5 flex h-12 w-full items-center justify-center rounded-2xl border border-oasis-line bg-white text-sm font-bold text-oasis-ink"
          >
            Tắt hộp chờ
          </button>
        </div>
      ) : (
        <div className="mt-6 rounded-[28px] bg-white p-4 shadow-soft">
          {dataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={dataUrl}
              alt="Service cart QR"
              className="h-[240px] w-[240px]"
            />
          ) : (
            <div className="grid h-[240px] w-[240px] place-items-center text-sm text-oasis-mute">
              {error || "Đang tạo QR…"}
            </div>
          )}
        </div>
      )}

      {ready ? (
        <>
          <p className="mt-4 font-display text-xl font-semibold text-oasis-ink">
            {name || "Khách Oasis"}
          </p>
          <p className="font-mono text-sm font-bold text-oasis-moss">{code}</p>
        </>
      ) : null}

      {detailLines?.length ? (
        <ul className="mt-4 w-full max-w-sm space-y-1 rounded-[22px] bg-white/80 p-4 text-left text-sm shadow-soft">
          <li className="text-[11px] font-bold uppercase tracking-wide text-oasis-mute">
            {pending ? "Yêu cầu" : "Trong QR này"}
          </li>
          {detailLines.map((line, i) => (
            <li key={i} className="text-oasis-ink">
              {line}
            </li>
          ))}
        </ul>
      ) : null}

      {error && !pending ? (
        <p className="mt-3 text-sm text-oasis-coral">{error}</p>
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
