"use client";

import { useEffect, useState } from "react";
import { OrderQrSuccess } from "@/components/OrderQrSuccess";
import { fetchAuthMe } from "@/lib/auth-me-client";
import { OLYMPIC_MONTHLY } from "@/lib/service-catalogs";
import {
  MEMBERSHIP_UPGRADE_COPY,
  packageIdFromTier,
  type MembershipTier,
} from "@/lib/membership-theme";
import {
  formatMembershipPayLabel,
  sameDayMembershipPriceVnd,
} from "@/lib/same-day-membership";

const TIERS: MembershipTier[] = [1, 3, 6, 12];

type Profile = {
  fullName: string;
  phone: string;
  shortId: string;
};

export function MembershipUpgrade({
  currentTier,
  customerName,
  locked,
  planLabel,
  expiresLabel,
}: {
  currentTier?: MembershipTier | null;
  customerName?: string;
  /** Còn hạn gói → khoá mọi nút Upgrade / Downgrade */
  locked?: boolean;
  planLabel?: string | null;
  expiresLabel?: string | null;
}) {
  const [busyTier, setBusyTier] = useState<MembershipTier | null>(null);
  const [error, setError] = useState("");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [sameDayDiscount, setSameDayDiscount] = useState(false);
  const [success, setSuccess] = useState<{
    token: string;
    status: string;
    payload: string | null;
    title: string;
    lines: string[];
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetchAuthMe();
        const data = await res.json();
        if (cancelled || !res.ok || !data.customer) return;
        const fullName = String(data.customer.fullName || "").trim();
        const phone = String(data.customer.phone || "").trim();
        const shortId = String(
          data.customer.phoneLast4 || data.customer.shortId || ""
        ).trim();
        setSameDayDiscount(!!data.customer.sameDayMembershipDiscount);
        if (fullName && phone) {
          setProfile({ fullName, phone, shortId });
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [customerName]);

  const profileReady = !!(profile?.fullName && profile?.phone);
  const isLocked = !!locked;

  async function upgrade(tier: MembershipTier) {
    if (busyTier || isLocked) return;
    const pkg = OLYMPIC_MONTHLY.find((p) => p.id === packageIdFromTier(tier));
    const copy = MEMBERSHIP_UPGRADE_COPY[tier];
    if (!pkg) return;
    setBusyTier(tier);
    setError("");
    try {
      const ready = profile;
      const res = await fetch("/api/me/cart", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          zoneCode: "OLYMPIC_POOL",
          zoneName: "Hồ Olympic · Nâng cấp hội viên",
          ...(ready
            ? { guestFullName: ready.fullName, guestPhone: ready.phone }
            : {}),
          items: [
            {
              id: pkg.id,
              nameVi: `Nâng cấp · ${pkg.nameVi}`,
              qty: 1,
              priceVnd: pkg.priceVnd,
            },
          ],
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Không gửi được yêu cầu");
      const payVnd = sameDayDiscount
        ? sameDayMembershipPriceVnd(pkg.priceVnd)
        : pkg.priceVnd;
      const payLabel = formatMembershipPayLabel(payVnd);
      setSuccess({
        token: data.token || data.cart?.token,
        status: data.status || "PENDING_APPROVAL",
        payload: data.payload || null,
        title: `Nâng cấp ${copy.title}`,
        lines: [
          ready
            ? `${ready.fullName} · ${ready.phone}${
                ready.shortId ? ` · ID ${ready.shortId}` : ""
              }`
            : customerName || "Tài khoản đã đăng ký",
          sameDayDiscount
            ? `Thanh toán 1 lần: ${payLabel} (−10% cùng ngày với đơn bơi, giá gốc ${copy.payOnce})`
            : `Thanh toán 1 lần: ${copy.payOnce}`,
          ...copy.perks.map((p) => `· ${p}`),
          "Voucher kèm gói dùng trong hạn hội viên (không hết theo lượt)",
          "Thanh toán tại quầy. Quầy xác nhận giao dịch là xong.",
        ],
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upgrade thất bại");
    } finally {
      setBusyTier(null);
    }
  }

  return (
    <section className="space-y-3">
      {success ? (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-[#f6f1e8] px-4 py-6">
          <div className="mx-auto max-w-lg">
            <OrderQrSuccess
              title={success.title}
              subtitle="Yêu cầu nâng cấp hội viên"
              detailLines={success.lines}
              cartToken={success.token}
              initialStatus={success.status}
              payload={success.payload}
              customerName={profile?.fullName || customerName}
              onDone={() => setSuccess(null)}
            />
          </div>
        </div>
      ) : null}

      <div className="flex items-end justify-between px-0.5">
        <div>
          <h2 className="font-display text-xl font-semibold text-oasis-ink">
            Nâng cấp hội viên
          </h2>
          <p className="mt-0.5 text-xs text-oasis-mute">
            {isLocked
              ? "Đang dùng gói — hết hạn mới chọn lại"
              : sameDayDiscount
                ? "Đã bơi hôm nay · đăng ký gói được −10%"
                : "1 gói / lần · hết hạn về khách thường · mới chọn tiếp"}
          </p>
        </div>
        {currentTier ? (
          <span className="rounded-full bg-oasis-moss/15 px-2.5 py-1 text-[11px] font-bold text-oasis-moss">
            Đang {currentTier} tháng
          </span>
        ) : null}
      </div>

      {isLocked ? (
        <div className="rounded-[22px] bg-oasis-moss/10 px-4 py-3 text-sm text-oasis-ink">
          <p className="font-semibold">
            {planLabel || `Gói ${currentTier || ""} tháng`} đang hiệu lực
          </p>
          <p className="mt-1 text-xs text-oasis-mute">
            {expiresLabel
              ? `Hết hạn ${expiresLabel}. Trong thời gian này không nâng cấp / hạ gói.`
              : "Trong thời gian dùng gói không nâng cấp / hạ gói."}{" "}
            Hết hạn → về gói thường → mới được chọn gói mới.
          </p>
        </div>
      ) : null}

      {!isLocked && profileReady ? (
        <p className="px-0.5 text-xs text-oasis-mute">
          {profile!.fullName} · {profile!.phone}
          {profile!.shortId ? ` · ID ${profile!.shortId}` : ""}
        </p>
      ) : null}

      <div
        className="scrollbar-none flex gap-3 overflow-x-auto pb-1"
        style={{
          marginLeft: -16,
          marginRight: -16,
          paddingLeft: 16,
          paddingRight: 16,
          scrollSnapType: "x mandatory",
          opacity: isLocked ? 0.55 : 1,
        }}
      >
        {TIERS.map((t) => {
          const c = MEMBERSHIP_UPGRADE_COPY[t];
          const pkg = OLYMPIC_MONTHLY.find((p) => p.id === packageIdFromTier(t));
          const listVnd = pkg?.priceVnd || 0;
          const payVnd = sameDayDiscount
            ? sameDayMembershipPriceVnd(listVnd)
            : listVnd;
          const payLabel = formatMembershipPayLabel(payVnd);
          const busy = busyTier === t;
          const isCurrent = isLocked && currentTier === t;
          return (
            <div
              key={t}
              className="flex w-[70%] max-w-[240px] shrink-0 flex-col rounded-[22px] bg-white p-4"
              style={{ scrollSnapAlign: "center" }}
            >
              <p className="text-center text-sm font-black tracking-wide text-[#1e3a8a]">
                {c.title}
              </p>
              <p className="mt-2 text-center text-[11px] text-slate-500">
                Giá quy đổi
              </p>
              <p className="text-center font-display text-2xl font-semibold text-[#1e3a8a]">
                {c.monthly}
                <span className="text-sm font-medium text-slate-500">
                  {" "}
                  / tháng
                </span>
              </p>
              <p className="mt-1 text-center text-xs text-slate-600">
                1 lần:{" "}
                {sameDayDiscount && listVnd > 0 ? (
                  <>
                    <span className="mr-1 text-slate-400 line-through">
                      {c.payOnce}
                    </span>
                    <strong className="text-[#1e3a8a]">{payLabel}</strong>
                  </>
                ) : (
                  <strong className="text-[#1e3a8a]">{c.payOnce}</strong>
                )}
              </p>
              {sameDayDiscount ? (
                <p className="mt-3 rounded-full bg-[#fef08a] py-1.5 text-center text-[11px] font-bold text-[#1e3a8a]">
                  −10% cùng ngày với đơn bơi
                </p>
              ) : c.save ? (
                <p className="mt-3 rounded-full bg-[#fef08a] py-1.5 text-center text-[11px] font-bold text-[#1e3a8a]">
                  {c.save}
                </p>
              ) : (
                <p className="mt-3 rounded-full bg-[#fef08a] py-1.5 text-center text-[11px] font-bold text-[#1e3a8a]">
                  Giá {t} tháng
                </p>
              )}
              <ul className="mt-3 flex-1 space-y-1">
                {c.perks.slice(0, 3).map((line) => (
                  <li
                    key={line}
                    className="px-0.5 py-0.5 text-[11px] font-semibold text-[#1e3a8a]"
                  >
                    {line}
                  </li>
                ))}
              </ul>
              <button
                type="button"
                disabled={isLocked || !!busyTier}
                onClick={() => void upgrade(t)}
                className="mt-3 h-11 w-full rounded-2xl bg-[#1e3a8a] text-sm font-bold text-white disabled:opacity-60"
              >
                {isLocked
                  ? isCurrent
                    ? "Đang dùng"
                    : "Đã khoá"
                  : busy
                    ? "…"
                    : "Upgrade"}
              </button>
            </div>
          );
        })}
      </div>

      {error ? <p className="text-sm text-oasis-coral">{error}</p> : null}
    </section>
  );
}
