"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { Shell } from "@/components/Shell";

type CartView = {
  token: string;
  zoneCode: string;
  zoneName: string | null;
  items: { id: string; nameVi: string; qty: number; priceVnd: number }[];
  totalVnd: number;
  status: string;
  customer: {
    fullName: string | null;
    customerCode: string;
    shortId: string | null;
  };
};

export default function ServiceCartQrPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  const [cart, setCart] = useState<CartView | null>(null);
  const [error, setError] = useState("");

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
              Nhân viên quầy đối chiếu danh sách này khi nhận khách.
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
