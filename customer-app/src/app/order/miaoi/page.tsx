"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Shell } from "@/components/Shell";
import { OrderQrSuccess } from "@/components/OrderQrSuccess";
import {
  VoucherApplyButton,
  VoucherPickerModal,
} from "@/components/VoucherPicker";
import {
  applyOffersDiscount,
  type HomeOffer,
} from "@/lib/home-services";
import {
  MIAOI_CATEGORIES,
  MIAOI_MENU,
  formatMenuPrice,
  formatVnd,
  type MiaOiMenuItem,
} from "@/lib/miaoi-menu";

type CartLine = { itemId: string; qty: number; useAltPrice?: boolean };

function lineKey(id: string, alt?: boolean) {
  return alt ? `${id}__alt` : id;
}

export default function MiaOiOrderPage() {
  const router = useRouter();
  const [category, setCategory] = useState(MIAOI_CATEGORIES[0]?.id || "mia");
  const [cart, setCart] = useState<Record<string, CartLine>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const [wallet, setWallet] = useState<HomeOffer[]>([]);
  const [appliedOffers, setAppliedOffers] = useState<HomeOffer[]>([]);
  const [voucherPickerOpen, setVoucherPickerOpen] = useState(false);
  const [success, setSuccess] = useState<{
    totalVnd: number;
    lines: string[];
    cartToken: string;
    status: string;
    payload: string | null;
    customer?: { fullName?: string; customerCode?: string };
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/auth/me", { cache: "no-store" });
      const data = await res.json();
      if (!data.authenticated) {
        router.replace("/login");
        return;
      }
      const offerRes = await fetch("/api/me/offers", { cache: "no-store" });
      if (offerRes.ok) {
        const od = await offerRes.json();
        const list = Array.isArray(od.wallet) ? od.wallet : [];
        if (!cancelled) {
          setWallet(
            list.filter(
              (o: HomeOffer) =>
                String(o.zoneCode || "").toUpperCase() === "MIA_OI"
            )
          );
        }
      }
      if (!cancelled) setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  const items = useMemo(
    () => MIAOI_MENU.filter((i) => i.category === category),
    [category]
  );
  const lines = useMemo(
    () => Object.values(cart).filter((l) => l.qty > 0),
    [cart]
  );
  const subtotal = useMemo(() => {
    let s = 0;
    for (const l of lines) {
      const item = MIAOI_MENU.find((i) => i.id === l.itemId);
      if (!item) continue;
      const unit =
        l.useAltPrice && item.priceAltVnd ? item.priceAltVnd : item.priceVnd;
      s += unit * l.qty;
    }
    return s;
  }, [lines]);
  const priced = applyOffersDiscount(subtotal, appliedOffers);
  const total = priced.totalVnd;

  function setQty(item: MiaOiMenuItem, qty: number, useAlt = false) {
    const key = lineKey(item.id, useAlt);
    const q = Math.max(0, Math.min(99, qty));
    setCart((prev) => {
      const next = { ...prev };
      if (q <= 0) delete next[key];
      else next[key] = { itemId: item.id, qty: q, useAltPrice: useAlt };
      return next;
    });
  }

  async function submit() {
    if (!lines.length || busy) return;
    setBusy(true);
    setError("");
    const summaryLines = lines.map((l) => {
      const item = MIAOI_MENU.find((i) => i.id === l.itemId);
      return `${l.qty}× ${item?.nameVi || l.itemId}`;
    });
    try {
      const cartItems = lines.map((l) => {
        const item = MIAOI_MENU.find((i) => i.id === l.itemId);
        const unit =
          l.useAltPrice && item?.priceAltVnd
            ? item.priceAltVnd
            : item?.priceVnd || 0;
        return {
          id: l.itemId,
          nameVi: item?.nameVi || l.itemId,
          qty: l.qty,
          priceVnd: unit,
        };
      });
      const cartRes = await fetch("/api/me/cart", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          zoneCode: "MIA_OI",
          zoneName: "Mía Ơi",
          items: cartItems,
          offerIds: appliedOffers.map((o) => o.id),
          discountVnd: priced.discountVnd,
        }),
      });
      const cartData = await cartRes.json();
      if (!cartRes.ok) {
        throw new Error(cartData.error || "Không tạo được yêu cầu QR");
      }
      const paid = cartData.cart?.totalVnd ?? total;
      setCart({});
      setSuccess({
        totalVnd: paid,
        lines: [
          ...summaryLines,
          ...priced.lines.map((l) =>
            l.discountVnd > 0
              ? `Voucher ${l.offer.title} −${formatVnd(l.discountVnd)}`
              : `Voucher ${l.offer.title}`
          ),
          `Tổng ${formatVnd(paid)}`,
        ],
        cartToken: cartData.cart?.token || "",
        status: cartData.cart?.status || "PENDING_APPROVAL",
        payload: cartData.payload || null,
        customer: cartData.customer,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lỗi tạo QR");
    } finally {
      setBusy(false);
    }
  }

  if (!ready) {
    return (
      <Shell showNav={false}>
        <p className="p-8 text-center text-sm text-oasis-mute">Đang tải…</p>
      </Shell>
    );
  }

  if (success) {
    return (
      <Shell showNav={false}>
        <OrderQrSuccess
          title="Đã gửi yêu cầu Mía Ơi"
          subtitle="Chờ quầy duyệt → nhận QR → nhân viên quét QR xác nhận thanh toán rồi mới làm món."
          detailLines={success.lines}
          cartToken={success.cartToken}
          initialStatus={success.status}
          payload={success.payload}
          customerName={success.customer?.fullName}
          customerCode={success.customer?.customerCode}
          onDone={() => setSuccess(null)}
        />
      </Shell>
    );
  }

  return (
    <Shell showNav={false}>
      <div className="animate-rise space-y-4 pb-36">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-oasis-gold">
              Bạn đang ở
            </p>
            <h1 className="font-display text-3xl font-semibold text-oasis-ink">
              Mía Ơi
            </h1>
          </div>
          <Link
            href="/account"
            className="rounded-xl border border-oasis-line bg-white/80 px-3 py-2 text-sm font-semibold text-oasis-mute"
          >
            Cá nhân
          </Link>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1">
          {MIAOI_CATEGORIES.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setCategory(c.id)}
              className={`whitespace-nowrap rounded-full px-3 py-2 text-sm font-bold ${
                category === c.id
                  ? "bg-oasis-deep text-oasis-sand"
                  : "bg-white/80 text-oasis-mute"
              }`}
            >
              {c.nameVi}
            </button>
          ))}
        </div>

        <div className="space-y-2">
          {items.map((item) => {
            const q = cart[lineKey(item.id)]?.qty || 0;
            const selected = q > 0;
            return (
              <div
                key={item.id}
                className={`rounded-2xl bg-white/90 p-3 shadow-soft ${
                  selected ? "ring-2 ring-oasis-deep" : ""
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-oasis-ink">{item.nameVi}</p>
                    <p className="text-sm text-oasis-mute">
                      {formatMenuPrice(item)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="grid h-9 w-9 place-items-center rounded-xl bg-oasis-sand font-bold"
                      onClick={() => setQty(item, q - 1)}
                      disabled={q <= 0}
                    >
                      −
                    </button>
                    <span className="w-6 text-center font-bold">{q}</span>
                    <button
                      type="button"
                      className="grid h-9 w-9 place-items-center rounded-xl bg-oasis-deep text-oasis-sand font-bold"
                      onClick={() => setQty(item, q + 1)}
                    >
                      +
                    </button>
                  </div>
                </div>
                {selected ? (
                  <div className="mt-3 flex items-center gap-2 border-t border-oasis-line/50 pt-3">
                    <VoucherApplyButton
                      appliedOffers={appliedOffers}
                      onOpen={() => setVoucherPickerOpen(true)}
                      onClear={() => setAppliedOffers([])}
                    />
                    <span className="shrink-0 text-xs font-semibold text-oasis-mute">
                      Số lượng
                    </span>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>

        {error ? <p className="text-sm text-oasis-coral">{error}</p> : null}
      </div>

      <div className="fixed inset-x-0 bottom-0 border-t border-oasis-line/60 bg-white/95 p-4 backdrop-blur">
        <div className="mx-auto flex max-w-lg items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-oasis-mute">Giỏ hàng</p>
            <p className="font-bold text-oasis-ink">
              {lines.reduce((n, l) => n + l.qty, 0)} món · {formatVnd(total)}
              {priced.discountVnd > 0
                ? ` (−${formatVnd(priced.discountVnd)})`
                : ""}
            </p>
          </div>
          <button
            type="button"
            disabled={!lines.length || busy}
            onClick={() => void submit()}
            className="h-12 rounded-2xl bg-oasis-deep px-5 font-bold text-oasis-sand disabled:opacity-40"
          >
            {busy ? "Đang tạo…" : "Tạo QR"}
          </button>
        </div>
      </div>

      <VoucherPickerModal
        open={voucherPickerOpen}
        zoneLabel="Mía Ơi"
        vouchers={wallet}
        appliedIds={appliedOffers.map((o) => o.id)}
        onApply={(offers) => setAppliedOffers(offers)}
        onClose={() => setVoucherPickerOpen(false)}
      />
    </Shell>
  );
}
