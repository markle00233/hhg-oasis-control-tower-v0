"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { Shell } from "@/components/Shell";

type CartView = {
  token: string;
  zoneCode: string;
  zoneName: string | null;
  items: {
    id: string;
    nameVi: string;
    qty: number;
    priceVnd: number;
    note?: string;
  }[];
  totalVnd: number;
  status: string;
  customer: {
    fullName: string | null;
    customerCode: string;
    shortId: string | null;
  };
};

function isNameOnlyRequest(cart: CartView) {
  return (cart.items || []).some((item) => {
    const note = String(item.note || "");
    return item.id === "ln-request" || note.includes("noQr:1");
  });
}

export default function ServiceCartQrPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  const [cart, setCart] = useState<CartView | null>(null);
  const [error, setError] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch(`/api/cart/${encodeURIComponent(token)}`, {
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) {
        if (!cancelled) setError(data.error || "QR không hợp lệ");
        return;
      }
      if (!cancelled) setCart(data.cart);
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const nameOnly = cart ? isNameOnlyRequest(cart) : false;
  const scannable =
    !nameOnly &&
    (cart?.status === "OPEN" || cart?.status === "PENDING_APPROVAL");

  useEffect(() => {
    if (!cart || !scannable) {
      setQrDataUrl("");
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const QRCode = (await import("qrcode")).default;
        const payload = `${window.location.origin}/q/${encodeURIComponent(token)}`;
        const url = await QRCode.toDataURL(payload, {
          width: 280,
          margin: 2,
          color: { dark: "#0b1220", light: "#ffffff" },
        });
        if (!cancelled) setQrDataUrl(url);
      } catch {
        if (!cancelled) setQrDataUrl("");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [cart, scannable, token]);

  return (
    <Shell showNav={false}>
      <div className="animate-rise space-y-5 py-6">
        <p className="text-center text-xs font-bold uppercase tracking-[0.28em] text-oasis-mute">
          HHG Oasis · QR dịch vụ
        </p>
        {error ? (
          <p className="text-center text-sm text-oasis-coral">{error}</p>
        ) : null}
        {!cart && !error ? (
          <p className="text-center text-sm text-oasis-mute">Đang tải…</p>
        ) : null}
        {cart ? (
          <>
            <div className="rounded-[28px] bg-oasis-ink p-5 text-oasis-sand shadow-soft">
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-oasis-gold">
                {cart.zoneName || cart.zoneCode} · {cart.status}
              </p>
              <p className="mt-2 font-display text-2xl font-semibold">
                {cart.customer.fullName || "Khách"}
              </p>
              <p className="mt-1 font-mono text-sm text-oasis-gold">
                {cart.customer.customerCode}
                {cart.customer.shortId ? ` · ID ${cart.customer.shortId}` : ""}
              </p>
            </div>
            {nameOnly ? (
              <p className="rounded-[28px] bg-white px-5 py-4 text-center text-sm leading-relaxed text-oasis-ink shadow-soft">
                Quầy sẽ gọi để xác nhận. Khi đến, nói tên hoặc số điện thoại.
              </p>
            ) : null}
            {scannable ? (
              <div className="flex flex-col items-center rounded-[28px] bg-white p-4 shadow-soft">
                {qrDataUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={qrDataUrl}
                    alt="QR dịch vụ"
                    className="h-[240px] w-[240px]"
                  />
                ) : (
                  <div className="grid h-[240px] w-[240px] place-items-center text-sm text-oasis-mute">
                    Đang tạo QR…
                  </div>
                )}
                <p className="mt-3 text-center text-xs font-semibold text-oasis-mute">
                  Đưa mã này cho nhân viên quét.
                </p>
              </div>
            ) : null}
            <ul className="space-y-2 rounded-[24px] bg-white/90 p-4 shadow-soft">
              {(cart.items || []).map((i, idx) => (
                <li
                  key={`${i.id}-${idx}`}
                  className="flex justify-between gap-3 text-sm"
                >
                  <span className="font-semibold text-oasis-ink">
                    {i.qty}× {i.nameVi}
                  </span>
                  <span className="font-mono text-oasis-mute">
                    {i.priceVnd > 0
                      ? new Intl.NumberFormat("vi-VN").format(
                          i.priceVnd * i.qty
                        ) + "đ"
                      : "—"}
                  </span>
                </li>
              ))}
              {cart.totalVnd > 0 ? (
                <li className="flex justify-between border-t border-oasis-line/60 pt-3 font-bold">
                  <span>Tổng</span>
                  <span>
                    {new Intl.NumberFormat("vi-VN").format(cart.totalVnd)}đ
                  </span>
                </li>
              ) : null}
            </ul>
            <p className="text-center text-xs text-oasis-mute">
              {nameOnly
                ? "Không cần đưa QR. Nói tên hoặc số điện thoại khi đến."
                : "Nhân viên quầy đối chiếu danh sách này khi nhận khách."}
            </p>
            <Link
              href="/account"
              className="flex h-12 items-center justify-center text-sm font-bold text-oasis-moss"
            >
              Trang cá nhân
            </Link>
          </>
        ) : null}
      </div>
    </Shell>
  );
}
