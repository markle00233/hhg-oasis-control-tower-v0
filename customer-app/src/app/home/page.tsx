"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Shell } from "@/components/Shell";
import { ServiceCard } from "@/components/ServiceCard";
import { MembershipUpgrade } from "@/components/MembershipUpgrade";
import { MembershipTheme } from "@/components/MembershipTheme";
import { SwimLessonHome } from "@/components/SwimLessonHome";
import { HOME_GROUPS } from "@/lib/home-services";

import type { MembershipTier } from "@/lib/membership-theme";
import type { ServiceCardViewModel } from "@/lib/service-cards";

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Chào buổi sáng";
  if (h < 18) return "Chào buổi chiều";
  return "Chào buổi tối";
}

export default function HomePage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [pointsBalance, setPointsBalance] = useState(0);
  const [vip, setVip] = useState(false);
  const [vipPlanLabel, setVipPlanLabel] = useState<string | null>(null);
  const [membershipTier, setMembershipTier] = useState<MembershipTier | null>(
    null
  );
  const [membershipPackageId, setMembershipPackageId] = useState<string | null>(
    null
  );
  const [vipExpiresLabel, setVipExpiresLabel] = useState<string | null>(null);
  const [active, setActive] = useState<ServiceCardViewModel[]>([]);
  const [upcoming, setUpcoming] = useState<ServiceCardViewModel[]>([]);
  const [error, setError] = useState("");
  const [cardReady, setCardReady] = useState(false);

  useEffect(() => {
    router.prefetch("/qr");
    router.prefetch("/book/pickleball");
    router.prefetch("/activity");
    router.prefetch("/account");
    let cancelled = false;

    async function load(first: boolean) {
      const meRes = await fetch("/api/auth/me", { cache: "no-store" });
      if (meRes.status === 401) {
        router.replace("/");
        return true;
      }
      const sumRes = first
        ? await fetch("/api/cards/summary", { cache: "no-store" })
        : null;
      if (sumRes?.status === 401) {
        router.replace("/");
        return true;
      }
      const me = meRes.ok ? await meRes.json() : null;
      const data = sumRes ? await sumRes.json() : null;
      if (cancelled) return true;
      if (sumRes && !sumRes.ok) {
        setError(data?.error || "Không tải được Home");
        setCardReady(true);
        return true;
      }
      const customer = me?.customer;
      if (data) {
        setName(data.customer?.fullName || "");
        setActive(data.active || []);
        setUpcoming(data.upcoming || []);
      }
      if (typeof customer?.pointsBalance === "number") {
        setPointsBalance(customer.pointsBalance);
      } else if (typeof data?.customer?.pointsBalance === "number") {
        setPointsBalance(data.customer.pointsBalance);
      }
      const activeVip = !!customer?.vip;
      if (customer) {
        setVip(activeVip);
        setVipPlanLabel(customer.vipPlanLabel || null);
        setMembershipTier(customer.membershipTier || null);
        setMembershipPackageId(customer.membershipPackageId || null);
        setVipExpiresLabel(customer.vipExpiresLabel || null);
      }
      setCardReady(true);
      return activeVip;
    }

    void (async () => {
      let activeVip = false;
      try {
        activeVip = await load(true);
      } catch {
        if (!cancelled) setCardReady(true);
      }
      while (!cancelled && !activeVip) {
        await new Promise((resolve) => window.setTimeout(resolve, 4000));
        if (cancelled || document.visibilityState === "hidden") continue;
        try {
          activeVip = await load(false);
        } catch {
          /* keep the card, try again */
        }
      }
    })();

    const onVisible = () => {
      if (document.visibilityState !== "visible" || cancelled) return;
      void load(false).catch(() => undefined);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [router]);

  const serviceCount = HOME_GROUPS.reduce((n, g) => n + g.services.length, 0);

  return (
    <Shell>
      <MembershipTheme
        vip={vip}
        vipPlanLabel={vipPlanLabel}
        packageId={membershipPackageId}
      />
      <div className="animate-rise space-y-5">
        {!cardReady ? (
          <header
            className="h-[5.5rem] animate-pulse rounded-[28px] bg-[#e8e6e1]"
            aria-hidden
          />
        ) : null}
        {cardReady ? (
        <header
          className={`relative flex items-center gap-3 rounded-[28px] p-4 shadow-soft ${
            vip ? "bg-black" : "bg-[#e8e6e1]"
          }`}
        >
          {vip ? (
            <div
              className="pointer-events-none absolute inset-0 overflow-hidden rounded-[28px]"
              aria-hidden
            >
              <div className="vip-smoke-field" />
            </div>
          ) : null}
          <Link
            href="/qr"
            className="relative grid h-14 w-14 shrink-0 place-items-center rounded-[18px] bg-oasis-deep text-sm font-black leading-none text-oasis-sand"
            aria-label="My Oasis QR"
            title="My Oasis QR"
          >
            QR
          </Link>
          <div className="relative min-w-0 flex-1">
            <p
              className={`text-[11px] font-bold uppercase tracking-[0.2em] ${
                vip ? "text-[#f6e27a]/75" : "text-oasis-mute"
              }`}
            >
              {greeting()}
            </p>
            <p
              className={`mt-1 truncate font-display text-2xl font-semibold leading-tight ${
                vip
                  ? "text-[#f6e27a] [text-shadow:0_0_16px_rgba(243,217,138,0.65)]"
                  : "text-oasis-ink"
              }`}
            >
              {name || "Khách HHG Oasis"}
            </p>
            <p
              className={`mt-1 font-display text-lg font-semibold leading-none ${
                vip ? "text-[#d4af37]" : "text-oasis-moss"
              }`}
            >
              {pointsBalance} điểm
            </p>
            {vip && vipPlanLabel ? (
              <p className="mt-1 text-[11px] font-bold leading-none text-[#f6e27a] [text-shadow:0_0_16px_rgba(243,217,138,0.65)]">
                {vipPlanLabel}
              </p>
            ) : null}
          </div>
          <Link
            href="/account"
            className={`relative grid h-12 w-12 shrink-0 place-items-center rounded-full text-sm font-black leading-none shadow-soft ${
              vip
                ? "bg-[#d4af37]/15 text-[#f6e27a]"
                : "bg-white text-oasis-moss"
            }`}
            aria-label="Account"
          >
            {name ? name.trim().charAt(0).toUpperCase() : "U"}
          </Link>
        </header>
        ) : null}

        <section className="space-y-5">
          <div className="flex items-end justify-between">
            <h2 className="font-display text-xl font-semibold text-oasis-ink">
              Dịch vụ
            </h2>
            <p className="text-[11px] font-semibold text-oasis-mute">
              {serviceCount} khu
            </p>
          </div>

          {HOME_GROUPS.map((g) => (
            <div key={g.id}>
              <div className="mb-2 flex items-baseline gap-2 px-0.5">
                <h3 className="font-display text-lg font-semibold text-oasis-ink">
                  {g.title}
                </h3>
                <span className="text-[11px] font-semibold uppercase tracking-wide text-oasis-mute">
                  {g.subtitle}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-x-2 gap-y-3 sm:grid-cols-4">
                {g.services.map((s) => (
                  <Link
                    key={s.code}
                    href={s.href}
                    className="flex flex-col items-center gap-1.5 text-center active:scale-[0.97]"
                  >
                    <span
                      className="grid h-14 w-14 place-items-center rounded-[18px] text-[11px] font-black tracking-wide shadow-sm"
                      style={{ background: s.bg, color: s.fg }}
                    >
                      {s.mark}
                    </span>
                    <span className="max-w-[5rem] text-[11px] font-bold leading-tight text-oasis-ink">
                      {s.name}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </section>

        {error ? <p className="text-sm text-oasis-coral">{error}</p> : null}

        {active.length > 0 ? (
          <section className="space-y-3">
            <h2 className="font-display text-xl font-semibold text-oasis-ink">
              Đang sử dụng
            </h2>
            {active.map((c) => (
              <ServiceCard key={c.id} card={c} />
            ))}
          </section>
        ) : null}

        {upcoming.length > 0 ? (
          <section className="space-y-3">
            <h2 className="font-display text-xl font-semibold text-oasis-ink">
              Sắp tới
            </h2>
            {upcoming.map((c) => (
              <ServiceCard key={c.id} card={c} />
            ))}
          </section>
        ) : null}

        <SwimLessonHome />

        <MembershipUpgrade
          currentTier={membershipTier}
          customerName={name}
          locked={vip}
          planLabel={vipPlanLabel}
          expiresLabel={vipExpiresLabel}
        />
      </div>
    </Shell>
  );
}
