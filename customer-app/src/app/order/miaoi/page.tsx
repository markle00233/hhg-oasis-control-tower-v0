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
import { PointsBalanceBar } from "@/components/PointsBalanceBar";
import { DrinkPointsRedeem } from "@/components/PointsRedeemControl";
import {
  applyOffersDiscount,
  type HomeOffer,
} from "@/lib/home-services";
import {
  miaOiDiscountPercentForTier,
  miaOiMembershipDiscountVnd,
  type MembershipTier,
} from "@/lib/membership-theme";
import {
  MIAOI_CATEGORIES,
  MIAOI_MENU,
  formatMenuPrice,
  formatVnd,
  type MiaOiMenuItem,
} from "@/lib/miaoi-menu";
import {
  computeGuestPointsRedeem,
  REDEEM_DRINK_MAX_VND,
  REDEEM_TIER_DRINK,
} from "@/lib/points-redeem";

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
  const [pointsBalance, setPointsBalance] = useState(0);
  const [membershipTier, setMembershipTier] = useState<MembershipTier | null>(
    null
  );
  const [redeemQtyByKey, setRedeemQtyByKey] = useState<Record<string, number>>(
    {}
  );
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
      if (!cancelled) {
        setPointsBalance(Number(data.customer?.pointsBalance) || 0);
        const tier = Number(data.customer?.membershipTier) || 0;
        setMembershipTier(
          tier === 1 || tier === 3 || tier === 6 || tier === 12
            ? (tier as MembershipTier)
            : null
        );
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
  const membershipPct = miaOiDiscountPercentForTier(membershipTier);
  const cartItemsForRedeem = useMemo(
    () =>
      lines.map((l) => {
        const item = MIAOI_MENU.find((i) => i.id === l.itemId);
        const unit =
          l.useAltPrice && item?.priceAltVnd
            ? item.priceAltVnd
            : item?.priceVnd || 0;
        const key = lineKey(l.itemId, l.useAltPrice);
        const eligible = unit > 0 && unit <= REDEEM_DRINK_MAX_VND;
        const redeemQty = eligible
          ? Math.min(l.qty, redeemQtyByKey[key] || 0)
          : 0;
        return {
          id: l.itemId,
          priceVnd: unit,
          qty: l.qty,
          redeemQty,
          key,
        };
      }),
    [lines, redeemQtyByKey]
  );
  const redeemUnits = cartItemsForRedeem.reduce((s, i) => s + i.redeemQty, 0);
  const redeemPreview =
    redeemUnits > 0
      ? computeGuestPointsRedeem({
          zoneCode: "MIA_OI",
          tier: REDEEM_TIER_DRINK,
          items: cartItemsForRedeem,
        })
      : null;
  const pointsDiscount = redeemPreview?.ok ? redeemPreview.discountVnd : 0;
  const pointsCost = redeemPreview?.ok ? redeemPreview.cost : 0;
  const membershipDiscount = miaOiMembershipDiscountVnd(
    Math.max(0, subtotal - pointsDiscount),
    membershipPct
  );
  const total = Math.max(
    0,
    priced.totalVnd - pointsDiscount - membershipDiscount
  );

  function maxRedeemFor(key: string, orderQty: number, unit: number) {
    if (orderQty <= 0 || unit <= 0 || unit > REDEEM_DRINK_MAX_VND) return 0;
    const others = Object.entries(redeemQtyByKey).reduce(
      (sum, [k, n]) => (k === key ? sum : sum + (n || 0)),
      0
    );
    const byPoints = Math.floor(pointsBalance / REDEEM_TIER_DRINK) - others;
    return Math.max(0, Math.min(orderQty, byPoints));
  }

  function setQty(item: MiaOiMenuItem, qty: number, useAlt = false) {
    const key = lineKey(item.id, useAlt);
    const q = Math.max(0, Math.min(20, qty));
    setCart((prev) => {
      const next = { ...prev };
      if (q <= 0) delete next[key];
      else next[key] = { itemId: item.id, qty: q, useAltPrice: useAlt };
      return next;
    });
    setRedeemQtyByKey((prev) => {
      const cur = prev[key] || 0;
      if (q <= 0) {
        if (!cur) return prev;
        const next = { ...prev };
        delete next[key];
        return next;
      }
      if (cur > q) return { ...prev, [key]: q };
      return prev;
    });
  }

  function setRedeemQty(item: MiaOiMenuItem, qty: number, useAlt = false) {
    const key = lineKey(item.id, useAlt);
    const orderQty = cart[key]?.qty || 0;
    const unit =
      useAlt && item.priceAltVnd ? item.priceAltVnd : item.priceVnd;
    setRedeemQtyByKey((prev) => {
      const others = Object.entries(prev).reduce(
        (sum, [k, n]) => (k === key ? sum : sum + (n || 0)),
        0
      );
      const byPoints = Math.floor(pointsBalance / REDEEM_TIER_DRINK) - others;
      const max = Math.max(0, Math.min(orderQty, byPoints));
      const q = Math.max(0, Math.min(max, qty));
      if (unit <= 0 || unit > REDEEM_DRINK_MAX_VND) return prev;
      const next = { ...prev };
      if (q <= 0) delete next[key];
      else next[key] = q;
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
        const key = lineKey(l.itemId, l.useAltPrice);
        const redeemQty =
          unit > 0 && unit <= REDEEM_DRINK_MAX_VND
            ? Math.min(l.qty, redeemQtyByKey[key] || 0)
            : 0;
        return {
          id: l.itemId,
          nameVi: item?.nameVi || l.itemId,
          qty: l.qty,
          priceVnd: unit,
          ...(redeemQty > 0 ? { pointsRedeemQty: redeemQty } : {}),
        };
      });
      if (redeemUnits > 0) {
        const check = computeGuestPointsRedeem({
          zoneCode: "MIA_OI",
          tier: REDEEM_TIER_DRINK,
          items: cartItems.map((i) => ({
            id: i.id,
            priceVnd: i.priceVnd,
            qty: i.qty,
            redeemQty: i.pointsRedeemQty || 0,
          })),
        });
        if (!check.ok) throw new Error(check.error || "Không đổi điểm được");
      }
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
          ...(redeemUnits > 0
            ? {
                pointsRedeemTier: REDEEM_TIER_DRINK,
                pointsRedeemUnits: redeemUnits,
              }
            : {}),
        }),
      });
      const cartData = await cartRes.json();
      if (!cartRes.ok) {
        throw new Error(cartData.error || "Không tạo được yêu cầu QR");
      }
      const paid = cartData.cart?.totalVnd ?? total;
      if (typeof cartData.pointsBalance === "number") {
        setPointsBalance(cartData.pointsBalance);
      }
      setCart({});
      setRedeemQtyByKey({});
      setSuccess({
        totalVnd: paid,
        lines: [
          ...summaryLines,
          ...priced.lines.map((l) =>
            l.discountVnd > 0
              ? `Voucher ${l.offer.title} −${formatVnd(l.discountVnd)}`
              : `Voucher ${l.offer.title}`
          ),
          ...(pointsCost > 0
            ? [`Đổi ${pointsCost} điểm (−${formatVnd(pointsDiscount)})`]
            : []),
          ...(membershipDiscount > 0
            ? [
                `Hội viên −${membershipPct}% (−${formatVnd(membershipDiscount)})`,
              ]
            : []),
          `Tổng ${formatVnd(paid)}`,
        ],
        cartToken: cartData.cart?.token || "",
        status: cartData.cart?.status || "PENDING_APPROVAL",
        payload: cartData.payload || null,
        customer: cartData.customer,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lỗi gửi đơn");
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
          subtitle="Chờ quầy duyệt. Duyệt xong là thanh toán thành công."
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

        <PointsBalanceBar points={pointsBalance} />

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
                      className="grid h-9 w-9 place-items-center rounded-xl bg-oasis-deep font-bold text-oasis-sand disabled:opacity-40"
                      onClick={() => setQty(item, q + 1)}
                      disabled={q >= 20}
                    >
                      +
                    </button>
                  </div>
                </div>
                {selected ? (
                  <div className="mt-3 space-y-2 border-t border-oasis-line/50 pt-3">
                    <VoucherApplyButton
                      appliedOffers={appliedOffers}
                      onOpen={() => setVoucherPickerOpen(true)}
                      onClear={() => setAppliedOffers([])}
                    />
                    {item.priceVnd > 0 &&
                    item.priceVnd <= REDEEM_DRINK_MAX_VND ? (
                      <DrinkPointsRedeem
                        pointsBalance={pointsBalance}
                        orderQty={q}
                        redeemQty={Math.min(q, redeemQtyByKey[lineKey(item.id)] || 0)}
                        maxQty={maxRedeemFor(lineKey(item.id), q, item.priceVnd)}
                        unitPriceVnd={item.priceVnd}
                        onChange={(next) => setRedeemQty(item, next)}
                      />
                    ) : null}
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
              {priced.discountVnd + pointsDiscount + membershipDiscount > 0
                ? ` (−${formatVnd(priced.discountVnd + pointsDiscount + membershipDiscount)})`
                : ""}
              {membershipPct > 0 ? ` · gói −${membershipPct}%` : ""}
              {pointsCost > 0 ? ` · đổi ${pointsCost} điểm` : ""}
            </p>
          </div>
          <button
            type="button"
            disabled={!lines.length || busy}
            onClick={() => void submit()}
            className="h-12 rounded-2xl bg-oasis-deep px-5 font-bold text-oasis-sand disabled:opacity-40"
          >
            {busy ? "Đang gửi…" : "Gửi đơn"}
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
