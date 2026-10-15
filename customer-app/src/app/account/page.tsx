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
    }[]
  >([]);
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);

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

      const [cardsRes, qrRes, offerRes] = await Promise.all([
        fetch("/api/cards/activity", { cache: "no-store" }),
        fetch("/api/me/qr", { cache: "no-store" }),
        fetch("/api/me/offers", { cache: "no-store" }),
      ]);
      const data = await cardsRes.json();
      if (!cardsRes.ok) {
        if (!cancelled) setError(data.error || "Không tải được thẻ dịch vụ");
        return;
      }
      if (cancelled) return;
      setCards([...(data.active || []), ...(data.upcoming || [])]);

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
          className={`rounded-[28px] p-5 shadow-soft ${
            customer?.vip ? "bg-black" : "bg-[#e8e6e1]"
          }`}
        >
          {customer?.vip ? (
            <>
              <p className="font-display text-4xl font-black tracking-[0.12em] text-[#d4af37]">
                VIP
              </p>
              <p className="mt-2 font-display text-2xl font-semibold text-[#d4af37]">
                {customer?.fullName || "Khách Oasis"}
              </p>
              <p className="mt-1 font-mono text-sm font-semibold text-[#d4af37]/90">
                {customer?.customerCode || "—"}
                {customer?.shortId ? ` · ID ${customer.shortId}` : ""}
              </p>
              <p className="mt-2 text-xs text-[#d4af37]/75">
                {customer.vipPlanLabel || "Gói VIP HHG Oasis"}
                {customer.vipExpiresLabel
                  ? ` · đến ${customer.vipExpiresLabel}`
                  : ""}
              </p>
            </>
          ) : (
            <>
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-oasis-mute">
                {customer?.segment === "MEMBER" ? "Member" : "Khách"}
              </p>
              <p className="mt-1 font-display text-2xl font-semibold text-oasis-ink">
                {customer?.fullName || "Khách Oasis"}
              </p>
              <p className="mt-1 font-mono text-sm font-semibold text-oasis-moss">
                {customer?.customerCode || "—"}
                {customer?.shortId ? ` · ID ${customer.shortId}` : ""}
              </p>
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
            10.000đ trước giảm giá = 5 điểm (khi thanh toán / check-in dịch vụ).
          </p>
        </div>

        {error ? <p className="text-sm text-oasis-coral">{error}</p> : null}

        {customer?.vip && vouchers.length > 0 ? (
          <section className="space-y-2">
            <h2 className="text-sm font-bold lowercase tracking-wide text-[#8a7429]">
              đặc quyền VIP
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
                const href =
                  v.href.includes("?")
                    ? `${v.href}&voucher=${encodeURIComponent(v.id)}`
                    : `${v.href}?voucher=${encodeURIComponent(v.id)}`;
                const deal =
                  v.discountType === "amount" && v.discountVnd
                    ? `−${new Intl.NumberFormat("vi-VN").format(v.discountVnd)}đ`
                    : v.discountType === "percent" && v.discountPercent
                      ? `−${v.discountPercent}%`
                      : "Đặc quyền";
                return (
                  <Link
                    key={v.id}
                    href={href}
                    className="flex shrink-0 flex-col justify-between rounded-[22px] bg-black p-4 shadow-soft"
                    style={{
                      width: "min(78vw, 300px)",
                      minWidth: "min(78vw, 300px)",
                      minHeight: 148,
                      scrollSnapAlign: "center",
                      flexShrink: 0,
                    }}
                  >
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#d4af37]/85">
                        {v.zoneLabel} · {deal}
                      </p>
                      <p className="mt-1 font-display text-xl font-semibold text-[#d4af37]">
                        {v.title}
                      </p>
                      <p className="mt-1 line-clamp-2 text-sm text-[#d4af37]/70">
                        {v.subtitle}
                      </p>
                    </div>
                    <p className="mt-3 text-xs font-bold text-[#d4af37]">
                      Chạm để dùng tại {v.zoneLabel} →
                    </p>
                  </Link>
                );
              })}
            </div>
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
                  <WalletCard key={card.id} card={card} qrDataUrl={qrDataUrl} />
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
}: {
  card: ServiceCardViewModel;
  qrDataUrl: string;
}) {
  return (
    <Link
      href={`/activity/booking/${encodeURIComponent(card.id)}`}
      className="flex gap-3 rounded-[22px] bg-white/90 p-3 shadow-soft"
    >
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
