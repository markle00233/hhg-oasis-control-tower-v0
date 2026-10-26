"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Shell } from "@/components/Shell";
import { IdentityQrThumb } from "@/components/IdentityQrThumb";
import type { ServiceCardViewModel } from "@/lib/service-cards";

type AccountCart = {
  token: string;
  zoneCode: string;
  zoneName: string | null;
  items: { nameVi: string; qty: number; priceVnd: number }[];
  totalVnd: number;
  status: string;
  adminNote?: string | null;
  payload?: string | null;
  qrDataUrl?: string;
};

export default function AccountPage() {
  const router = useRouter();
  const [customer, setCustomer] = useState<{
    customerCode: string;
    fullName?: string | null;
    phone?: string | null;
    shortId?: string | null;
    segment?: string | null;
    pointsBalance?: number;
    vip?: boolean;
    vipPlanLabel?: string | null;
    vipExpiresLabel?: string | null;
    packageLabel?: string | null;
    packageExpiresLabel?: string | null;
  } | null>(null);
  const [cards, setCards] = useState<ServiceCardViewModel[]>([]);
  const [carts, setCarts] = useState<AccountCart[]>([]);
  const [vouchers, setVouchers] = useState<
    {
      id: string;
      title: string;
      subtitle: string;
      zoneCode: string;
      zoneLabel: string;
      href: string;
      discountType: string;
      discountVnd?: number;
      discountPercent?: number;
      sourceLabel?: string;
      qtyTotal?: number | null;
      qtyRemaining?: number | null;
      exhausted?: boolean;
      canUse?: boolean;
      membership?: boolean;
      membershipExpired?: boolean;
      unlimitedInTerm?: boolean;
      validUntilLabel?: string | null;
    }[]
  >([]);
  const [swimReady, setSwimReady] = useState(false);
  const [swimLessons, setSwimLessons] = useState<
    {
      id: string;
      packageLabel: string;
      sessionsTotal: number;
      sessionsLeft: number;
      bonusVisitsTotal: number;
      bonusVisitsLeft: number;
      status: string;
    }[]
  >([]);
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);
  const [voucherQrBusy, setVoucherQrBusy] = useState<string | null>(null);
  const [voucherQrError, setVoucherQrError] = useState("");

  async function openVoucherQr(offerId: string) {
    setVoucherQrBusy(offerId);
    setVoucherQrError("");
    try {
      const res = await fetch("/api/me/voucher-qr", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ offerIds: [offerId] }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Không tạo được QR voucher");
      const token = data.passes?.[0]?.token;
      if (!token) throw new Error("Không tạo được QR voucher");
      router.push(`/v/${encodeURIComponent(token)}`);
    } catch (e) {
      setVoucherQrError(
        e instanceof Error ? e.message : "Không tạo được QR voucher"
      );
    } finally {
      setVoucherQrBusy(null);
    }
  }

  async function loadCarts(cancelled: () => boolean) {
    const cartRes = await fetch("/api/me/cart", { cache: "no-store" });
    if (!cartRes.ok) return;
    const cartData = await cartRes.json();
    const list = Array.isArray(cartData.carts) ? cartData.carts : [];
    const QRCode = (await import("qrcode")).default;
    const withQr: AccountCart[] = await Promise.all(
      list.map(async (c: AccountCart) => {
        if (c.status !== "OPEN" || !c.payload) {
          return { ...c, qrDataUrl: "" };
        }
        let thumb = "";
        try {
          thumb = await QRCode.toDataURL(c.payload, {
            width: 176,
            margin: 1,
            color: { dark: "#0b1220", light: "#ffffff" },
          });
        } catch {
          /* ignore */
        }
        return { ...c, qrDataUrl: thumb };
      })
    );
    if (!cancelled()) setCarts(withQr);
  }

  useEffect(() => {
    let cancelled = false;
    const isCancelled = () => cancelled;
    (async () => {
      const me = await fetch("/api/auth/me", { cache: "no-store" });
      const meData = await me.json();
      if (!meData.authenticated) {
        router.replace("/login");
        return;
      }
      if (!cancelled) setCustomer(meData.customer);

      const [cardsRes, qrRes, offerRes, swimRes] = await Promise.all([
        fetch("/api/cards/activity", { cache: "no-store" }),
        fetch("/api/me/qr", { cache: "no-store" }),
        fetch("/api/me/offers", { cache: "no-store" }),
        fetch("/api/me/swim", { cache: "no-store" }),
      ]);
      const data = await cardsRes.json().catch(() => ({}));
      if (!cardsRes.ok) {
        if (!cancelled) setError(data.error || "Không tải được thẻ dịch vụ");
      } else if (!cancelled) {
        setCards([...(data.active || []), ...(data.upcoming || [])]);
      }

      const QRCode = (await import("qrcode")).default;
      if (qrRes.ok) {
        try {
          const qr = await qrRes.json();
          const url = await QRCode.toDataURL(qr.payload, {
            width: 200,
            margin: 1,
            color: { dark: "#0b1220", light: "#ffffff" },
          });
          if (!cancelled) setQrDataUrl(url);
        } catch {
          /* ignore */
        }
      }

      if (offerRes.ok) {
        try {
          const od = await offerRes.json();
          if (!cancelled && Array.isArray(od.wallet)) setVouchers(od.wallet);
        } catch {
          /* ignore */
        }
      }

      if (swimRes.ok) {
        try {
          const sd = await swimRes.json();
          if (!cancelled && Array.isArray(sd.lessons)) setSwimLessons(sd.lessons);
        } catch {
          /* ignore */
        }
      }
      if (!cancelled) setSwimReady(true);

      await loadCarts(isCancelled);
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  const hasPending = carts.some((c) => c.status === "PENDING_APPROVAL");
  useEffect(() => {
    if (!hasPending) return;
    let cancelled = false;
    const tick = async () => {
      if (cancelled) return;
      await loadCarts(() => cancelled);
      if (!cancelled) window.setTimeout(() => void tick(), 1200);
    };
    const id = window.setTimeout(() => void tick(), 1200);
    return () => {
      cancelled = true;
      window.clearTimeout(id);
    };
  }, [hasPending]);

  const cartGroups = useMemo(() => {
    const map = new Map<string, AccountCart[]>();
    for (const c of carts) {
      const key = c.zoneCode || "OTHER";
      const list = map.get(key) || [];
      list.push(c);
      map.set(key, list);
    }
    return [...map.entries()].map(([code, items]) => ({
      code,
      label: shortZoneLabel(code, items[0]?.zoneName || undefined),
      items,
    }));
  }, [carts]);

  const groups = useMemo(() => {
    const map = new Map<string, ServiceCardViewModel[]>();
    for (const c of cards) {
      const key = c.zoneCode || "OTHER";
      const list = map.get(key) || [];
      list.push(c);
      map.set(key, list);
    }
    return [...map.entries()].map(([code, items]) => ({
      code,
      label: shortZoneLabel(code, items[0]?.zoneName),
      items,
    }));
  }, [cards]);

  async function cancelOrder(card: ServiceCardViewModel) {
    if (deleting) return;
    if (
      !window.confirm(
        "Huỷ đơn này? Điểm đã đổi sẽ được hoàn, điểm đã cộng từ đơn sẽ bị thu lại."
      )
    ) {
      return;
    }
    setDeleting(card.id);
    setError("");
    try {
      const res = await fetch("/api/me/orders", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ orderId: card.referenceId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Không huỷ được đơn");
      setCards((prev) => prev.filter((c) => c.id !== card.id));
      if (typeof data.pointsBalance === "number") {
        setCustomer((prev) =>
          prev ? { ...prev, pointsBalance: data.pointsBalance } : prev
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không huỷ được đơn");
    } finally {
      setDeleting(null);
    }
  }

  async function deleteCart(token: string) {
    if (deleting) return;
    if (!window.confirm("Xoá vé này? Quầy sẽ thấy trạng thái Xóa.")) return;
    setDeleting(token);
    setError("");
    try {
      const res = await fetch("/api/me/cart", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Không xoá được");
      setCarts((prev) => prev.filter((c) => c.token !== token));
      if (typeof data.pointsBalance === "number") {
        setCustomer((prev) =>
          prev ? { ...prev, pointsBalance: data.pointsBalance } : prev
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Xoá thất bại");
    } finally {
      setDeleting(null);
    }
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
  }

  return (
    <Shell>
      <div className="animate-rise space-y-5">
        <h1 className="font-display text-3xl font-semibold text-oasis-ink">
          Account
        </h1>

        <div
          className={`relative overflow-hidden rounded-[28px] p-5 shadow-soft ${
            customer?.vip ? "bg-black" : "bg-[#e8e6e1]"
          }`}
        >
          {customer?.vip ? (
            <>
              <div className="vip-smoke-field" aria-hidden />
              <div className="vip-pop relative text-[#d4af37]">
                <p className="font-display text-4xl font-black tracking-[0.12em]">
                  VIP
                </p>
                <p className="mt-2 font-display text-2xl font-semibold">
                  {customer?.fullName || "Khách Oasis"}
                </p>
                <div className="mt-2 w-fit max-w-full">
                  <PhoneIdLine
                    phone={customer?.phone}
                    shortId={customer?.shortId}
                    pop
                    className="text-[#f3d98a]"
                    iconClassName="text-[#f6e27a]"
                  />
                  <p className="mt-1.5 text-sm font-bold tracking-wide text-[#f6e27a] [text-shadow:0_0_16px_rgba(243,217,138,0.65)]">
                    {customer.packageLabel ||
                      customer.vipPlanLabel ||
                      "Gói VIP HHG Oasis"}
                    {customer.packageExpiresLabel || customer.vipExpiresLabel
                      ? ` · đến ${
                          customer.packageExpiresLabel || customer.vipExpiresLabel
                        }`
                      : ""}
                  </p>
                </div>
              </div>
            </>
          ) : (
            <>
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-oasis-mute">
                {customer?.segment === "MEMBER" ? "Member" : "Khách"}
              </p>
              <p className="mt-1 font-display text-2xl font-semibold text-oasis-ink">
                {customer?.fullName || "Khách Oasis"}
              </p>
              <PhoneIdLine
                phone={customer?.phone}
                shortId={customer?.shortId}
                className="text-oasis-moss"
                iconClassName="text-oasis-mute"
              />
              {customer?.packageLabel ? (
                <p className="mt-2 text-xs text-oasis-mute">
                  {customer.packageLabel}
                  {customer.packageExpiresLabel
                    ? ` · đến ${customer.packageExpiresLabel}`
                    : ""}
                </p>
              ) : null}
            </>
          )}
        </div>

        <div className="rounded-[22px] bg-white/90 px-4 py-3 shadow-soft">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-oasis-mute">
            Điểm tích luỹ
          </p>
          <p className="mt-1 font-display text-2xl font-semibold text-oasis-ink">
            {customer?.pointsBalance ?? 0} điểm
          </p>
          <p className="mt-1 text-xs text-oasis-mute">
            Cộng điểm chỉ từ Mía Ơi & Hồ Olympic (10.000đ sau giảm = 1
            điểm). Đổi: 50đ đồ uống / 100đ vé bơi.
          </p>
        </div>

        <section className="rounded-[22px] bg-white p-4 shadow-soft">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#0369a1]">
            Gói học bơi
          </p>
          {!swimReady ? (
            <p className="mt-2 text-sm text-oasis-mute">Đang tải buổi học…</p>
          ) : swimLessons.length === 0 ? (
            <p className="mt-2 text-sm text-oasis-mute">
              {customer?.phone
                ? "Chưa có buổi học gắn với số điện thoại này."
                : "Thêm số điện thoại trong hồ sơ để xem buổi còn lại."}
            </p>
          ) : (
            <div className="mt-3 space-y-3">
              {swimLessons.map((lesson) => {
                const monthly = lesson.sessionsTotal <= 0;
                const statusLabel =
                  lesson.status === "ACTIVE"
                    ? "Đang học"
                    : lesson.status === "PAUSED"
                      ? "Tạm dừng"
                      : "Xong";
                return (
                  <article key={lesson.id} className="space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm font-semibold text-oasis-ink">
                        {lesson.packageLabel}
                      </p>
                      <span className="shrink-0 rounded-full bg-[#e0f2fe] px-2 py-0.5 text-[10px] font-bold text-[#0c4a6e]">
                        {statusLabel}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="rounded-2xl bg-[#e0f2fe] px-3 py-2">
                        <p className="text-[10px] font-bold uppercase tracking-wide text-[#0369a1]">
                          Buổi còn lại
                        </p>
                        <p className="mt-0.5 font-display text-2xl font-semibold text-[#0c4a6e]">
                          {monthly
                            ? "Theo tháng"
                            : `${lesson.sessionsLeft}/${lesson.sessionsTotal}`}
                        </p>
                      </div>
                      <div className="rounded-2xl bg-[#fef08a] px-3 py-2">
                        <p className="text-[10px] font-bold uppercase tracking-wide text-[#0c4a6e]">
                          Lượt tự chọn
                        </p>
                        <p className="mt-0.5 font-display text-2xl font-semibold text-[#0c4a6e]">
                          {lesson.bonusVisitsTotal > 0
                            ? `${lesson.bonusVisitsLeft}/${lesson.bonusVisitsTotal}`
                            : "—"}
                        </p>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        {error ? <p className="text-sm text-oasis-coral">{error}</p> : null}

        {vouchers.length > 0 ? (
          <section className="space-y-2">
            <h2
              className={`text-sm font-bold lowercase tracking-wide ${
                customer?.vip ? "text-[#8a7429]" : "text-oasis-mute"
              }`}
            >
              {customer?.vip ? "đặc quyền VIP / voucher" : "voucher của bạn"}
            </h2>
            <div
              className="scrollbar-none"
              style={{
                display: "flex",
                flexDirection: "row",
                gap: 12,
                overflowX: "auto",
                overflowY: "hidden",
                WebkitOverflowScrolling: "touch",
                scrollSnapType: "x mandatory",
                marginLeft: -16,
                marginRight: -16,
                paddingLeft: 16,
                paddingRight: 16,
                paddingBottom: 4,
              }}
            >
              {vouchers.map((v) => {
                const zone = String(v.zoneCode || "").toUpperCase();
                const separateQr = zone === "SPA" || zone === "LONG_NUONG";
                const href = v.href.includes("?")
                  ? `${v.href}&voucher=${encodeURIComponent(v.id)}`
                  : `${v.href}?voucher=${encodeURIComponent(v.id)}`;
                const deal =
                  v.discountType === "amount" && v.discountVnd
                    ? `−${new Intl.NumberFormat("vi-VN").format(v.discountVnd)}đ`
                    : v.discountType === "percent" && v.discountPercent
                      ? `−${v.discountPercent}%`
                      : "Ưu đãi";
                const vipCard = !!customer?.vip;
                const hasQty = v.qtyTotal != null && v.qtyTotal > 0;
                const remaining = v.qtyRemaining ?? 0;
                const membershipExpired = !!v.membershipExpired;
                const exhausted =
                  !!v.exhausted ||
                  (hasQty && remaining <= 0) ||
                  membershipExpired;
                const cardClass = `relative flex shrink-0 flex-col justify-between rounded-[22px] p-4 shadow-soft ${
                  vipCard ? "bg-black" : "bg-white"
                } ${exhausted ? "opacity-55" : ""}`;
                const cardStyle = {
                  width: "min(78vw, 300px)",
                  minWidth: "min(78vw, 300px)",
                  minHeight: 148,
                  scrollSnapAlign: "center" as const,
                  flexShrink: 0,
                };
                const body = (
                  <>
                    {hasQty ? (
                      <span
                        className={`absolute right-3 top-3 rounded-full px-2.5 py-1 text-[11px] font-black tabular-nums ${
                          vipCard
                            ? exhausted
                              ? "bg-[#d4af37]/20 text-[#d4af37]/70"
                              : "bg-[#d4af37] text-black"
                            : exhausted
                              ? "bg-oasis-line text-oasis-mute"
                              : "bg-oasis-moss text-white"
                        }`}
                      >
                        {remaining}/{v.qtyTotal}
                      </span>
                    ) : v.unlimitedInTerm && !membershipExpired ? (
                      <span
                        className={`absolute right-3 top-3 rounded-full px-2.5 py-1 text-[10px] font-black ${
                          vipCard
                            ? "bg-[#d4af37] text-black"
                            : "bg-oasis-moss text-white"
                        }`}
                      >
                        Trong hạn
                      </span>
                    ) : null}
                    <div>
                      <p
                        className={`text-[10px] font-bold uppercase tracking-[0.18em] ${
                          vipCard ? "text-[#d4af37]/85" : "text-oasis-mute"
                        }`}
                      >
                        {v.zoneLabel} · {deal}
                      </p>
                      <p
                        className={`mt-1 font-display text-xl font-semibold ${
                          vipCard ? "text-[#d4af37]" : "text-oasis-ink"
                        }`}
                      >
                        {v.title}
                      </p>
                      <p
                        className={`mt-1 line-clamp-2 text-sm ${
                          vipCard ? "text-[#d4af37]/70" : "text-oasis-mute"
                        }`}
                      >
                        {v.subtitle}
                      </p>
                    </div>
                    <p
                      className={`mt-3 text-xs font-bold ${
                        vipCard ? "text-[#d4af37]" : "text-oasis-moss"
                      }`}
                    >
                      {membershipExpired
                        ? `Hết hạn gói${
                            v.validUntilLabel ? ` · ${v.validUntilLabel}` : ""
                          }`
                        : exhausted
                          ? hasQty
                            ? `Hết lượt (0/${v.qtyTotal})`
                            : "Không dùng được"
                          : separateQr
                            ? v.validUntilLabel
                              ? `Đến ${v.validUntilLabel}`
                              : v.zoneLabel
                            : v.validUntilLabel
                              ? `Đến ${v.validUntilLabel} · dùng tại ${v.zoneLabel} →`
                              : `Chạm để dùng tại ${v.zoneLabel} →`}
                    </p>
                  </>
                );
                return exhausted ? (
                  <div key={v.id} className={cardClass} style={cardStyle}>
                    {body}
                  </div>
                ) : separateQr ? (
                  <div key={v.id} className={cardClass} style={cardStyle}>
                    {body}
                    <button
                      type="button"
                      disabled={voucherQrBusy === v.id}
                      onClick={() => void openVoucherQr(v.id)}
                      className={`mt-3 flex h-10 w-full items-center justify-center rounded-2xl text-xs font-bold ${
                        vipCard
                          ? "bg-[#d4af37] text-black"
                          : "bg-oasis-deep text-oasis-sand"
                      } disabled:opacity-50`}
                    >
                      {voucherQrBusy === v.id ? "…" : "Hiện QR voucher"}
                    </button>
                  </div>
                ) : (
                  <Link
                    key={v.id}
                    href={href}
                    className={cardClass}
                    style={cardStyle}
                  >
                    {body}
                  </Link>
                );
              })}
            </div>
            {voucherQrError ? (
              <p className="text-sm font-semibold text-oasis-coral">
                {voucherQrError}
              </p>
            ) : null}
          </section>
        ) : null}

        {cartGroups.length > 0 ? (
          <section className="space-y-5">
            <h2 className="text-sm font-bold lowercase tracking-wide text-oasis-mute">
              vé / qr dịch vụ
            </h2>
            {cartGroups.map((g) => (
              <div key={g.code} className="space-y-2">
                <div className="flex items-end justify-between px-1">
                  <h3 className="font-display text-xl font-semibold capitalize text-oasis-ink">
                    {g.label}
                  </h3>
                  <span className="text-xs font-bold text-oasis-mute">
                    {g.items.length} vé
                  </span>
                </div>
                <div className="space-y-3">
                  {g.items.map((c) => (
                    <CartTicketCard
                      key={c.token}
                      cart={c}
                      deleting={deleting === c.token}
                      onDelete={() => void deleteCart(c.token)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </section>
        ) : null}

        {groups.length === 0 && carts.length === 0 ? (
          <p className="rounded-[22px] bg-white/70 p-5 text-sm text-oasis-mute shadow-soft">
            Chưa có thẻ dịch vụ. Chọn gói → Gửi yêu cầu → chờ quầy duyệt → nhận
            QR tại đây.
          </p>
        ) : groups.length === 0 ? null : (
          groups.map((g) => (
            <section key={g.code} className="space-y-2">
              <h2 className="text-sm font-bold lowercase tracking-wide text-oasis-mute">
                {g.label}
              </h2>
              <div className="space-y-3">
                {g.items.map((card) => (
                  <WalletCard
                    key={card.id}
                    card={card}
                    qrDataUrl={qrDataUrl}
                    cancelling={deleting === card.id}
                    onCancel={() => void cancelOrder(card)}
                  />
                ))}
              </div>
            </section>
          ))
        )}

        <div className="rounded-[28px] bg-white/85 p-2 shadow-soft">
          <MenuLink href="/activity" label="Lịch sử Activity" />
          <MenuLink href="/messages" label="Messages" />
          <MenuLink href="/account/password" label="Đổi mật khẩu" last />
        </div>

        <button
          type="button"
          onClick={() => void logout()}
          className="flex h-14 w-full items-center justify-center rounded-2xl border border-oasis-line bg-white/70 text-base font-bold text-oasis-mute"
        >
          Đăng xuất
        </button>
      </div>
    </Shell>
  );
}

function CartTicketCard({
  cart: c,
  deleting,
  onDelete,
}: {
  cart: AccountCart;
  deleting: boolean;
  onDelete: () => void;
}) {
  const pending = c.status === "PENDING_APPROVAL";
  const rejected = c.status === "REJECTED";
  const body = (
    <>
      {pending ? (
        <div className="grid h-[88px] w-[88px] shrink-0 place-items-center rounded-2xl bg-amber-50 ring-1 ring-amber-200">
          <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-amber-200 border-t-amber-600" />
        </div>
      ) : rejected ? (
        <div className="grid h-[88px] w-[88px] shrink-0 place-items-center rounded-2xl bg-red-50 text-xs font-bold text-red-700 ring-1 ring-red-200">
          Từ chối
        </div>
      ) : (
        <IdentityQrThumb
          dataUrl={c.qrDataUrl}
          size={88}
          className="rounded-2xl shadow-sm"
          asDiv
        />
      )}
      <div className="min-w-0 flex-1 py-1">
        {pending ? (
          <p className="text-sm font-semibold text-amber-700">
            Đang chờ nhân viên duyệt…
          </p>
        ) : null}
        {rejected ? (
          <p className="text-sm font-semibold text-red-700">
            {c.adminNote || "Quầy từ chối yêu cầu"}
          </p>
        ) : null}
        {(c.items || []).slice(0, 4).map((i, idx) => (
          <p key={idx} className="mt-0.5 text-sm text-oasis-ink">
            {i.qty}× {i.nameVi}
          </p>
        ))}
        {(c.items || []).length > 4 ? (
          <p className="text-xs text-oasis-mute">
            +{(c.items || []).length - 4} mục khác
          </p>
        ) : null}
        {c.totalVnd > 0 ? (
          <p className="mt-2 font-mono text-xs font-bold text-oasis-moss">
            {new Intl.NumberFormat("vi-VN").format(c.totalVnd)}đ
          </p>
        ) : null}
      </div>
      <button
        type="button"
        aria-label="Xoá vé"
        disabled={deleting}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onDelete();
        }}
        className="grid h-9 w-9 shrink-0 place-items-center self-start rounded-full text-lg font-bold text-oasis-mute hover:bg-black/5 hover:text-oasis-coral disabled:opacity-40"
      >
        ×
      </button>
    </>
  );

  if (pending || rejected) {
    return (
      <div className="flex gap-3 rounded-[22px] bg-[#e8e6e1] p-3 shadow-soft">
        {body}
      </div>
    );
  }

  return (
    <Link
      href={`/q/${encodeURIComponent(c.token)}`}
      className="flex gap-3 rounded-[22px] bg-[#e8e6e1] p-3 shadow-soft"
    >
      {body}
    </Link>
  );
}

function WalletCard({
  card,
  qrDataUrl,
  cancelling,
  onCancel,
}: {
  card: ServiceCardViewModel;
  qrDataUrl: string;
  cancelling?: boolean;
  onCancel?: () => void;
}) {
  const href =
    card.type === "BOOKING" && card.referenceId
      ? `/activity/booking/${encodeURIComponent(card.referenceId)}`
      : card.href && card.href !== "/activity"
        ? card.href
        : "/activity";
  return (
    <div className="rounded-[22px] bg-white/90 shadow-soft">
      <Link href={href} className="flex gap-3 p-3">
        <IdentityQrThumb
          dataUrl={card.showQrHint ? qrDataUrl : ""}
          size={72}
          className="rounded-2xl"
          asDiv
        />
        <div className="min-w-0 flex-1 py-0.5">
          <p className="text-sm font-bold text-oasis-ink">{card.title}</p>
          <p className="mt-0.5 text-xs text-oasis-mute">{card.subtitle}</p>
          {card.statusLabel ? (
            <p className="mt-2 text-[11px] font-bold uppercase tracking-wide text-oasis-moss">
              {card.statusLabel}
            </p>
          ) : null}
        </div>
      </Link>
      {card.canCancel && onCancel ? (
        <div className="flex justify-end border-t border-oasis-line/60 px-3 py-2">
          <button
            type="button"
            disabled={cancelling}
            onClick={onCancel}
            className="h-9 rounded-xl border border-oasis-line bg-white px-3 text-[13px] font-extrabold text-oasis-ink disabled:opacity-40"
          >
            {cancelling ? "Đang huỷ…" : "Huỷ đơn"}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function MenuLink({
  href,
  label,
  last,
}: {
  href: string;
  label: string;
  last?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`flex h-14 items-center justify-between px-4 text-sm font-bold text-oasis-ink ${
        last ? "" : "border-b border-oasis-line/60"
      }`}
    >
      {label}
      <span className="text-oasis-mute">›</span>
    </Link>
  );
}

function maskPhone(phone: string, visible: boolean) {
  const digits = phone.replace(/\D/g, "");
  if (!digits) return "—";
  if (visible || digits.length <= 3) return phone;
  return `${digits.slice(0, 3)}${"•".repeat(digits.length - 3)}`;
}

function EyeIcon({ off }: { off?: boolean }) {
  if (off) {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M3 3l18 18"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <path
          d="M10.6 10.7a2 2 0 002.8 2.8"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <path
          d="M9.9 5.2A10.9 10.9 0 0121 12a10.9 10.9 0 01-4.1 4.8M6.1 6.4A10.9 10.9 0 003 12a10.9 10.9 0 0012.4 6.6"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

function PhoneIdLine({
  phone,
  shortId,
  className,
  iconClassName,
  pop,
}: {
  phone?: string | null;
  shortId?: string | null;
  className?: string;
  iconClassName?: string;
  pop?: boolean;
}) {
  const [visible, setVisible] = useState(false);
  const raw = String(phone || "").trim();
  return (
    <p
      className={`flex items-center gap-1.5 font-mono font-semibold ${
        pop ? "text-base font-bold tracking-wide" : "mt-1 text-sm"
      } ${className || ""}`}
    >
      <span>{raw ? maskPhone(raw, visible) : "—"}</span>
      {raw ? (
        <button
          type="button"
          aria-label={visible ? "Ẩn số điện thoại" : "Hiện số điện thoại"}
          onClick={() => setVisible((v) => !v)}
          className={`grid shrink-0 place-items-center rounded-full ${
            pop
              ? "h-8 w-8 bg-[#d4af37]/15 ring-1 ring-[#f6e27a]/50"
              : "h-7 w-7"
          } ${iconClassName || ""}`}
        >
          <EyeIcon off={visible} />
        </button>
      ) : null}
      {shortId ? <span>· ID {shortId}</span> : null}
    </p>
  );
}

function shortZoneLabel(code: string, fallback?: string) {
  const map: Record<string, string> = {
    OLYMPIC_POOL: "Olympic",
    RESORT_POOL: "Resort",
    VIP_RESORT: "VIP",
    GYM: "Gym",
    SPA: "Spa",
    SAUNA: "Spa",
    MIA_OI: "Mía ơi",
    PICKLEBALL: "Pickleball",
    LONG_NUONG: "Lòng Nướng Chí Phèo",
    CHI_PHEO: "Lòng Nướng Chí Phèo",
  };
  return map[code] || fallback || code;
}
