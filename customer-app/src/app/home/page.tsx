"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Shell } from "@/components/Shell";
import { ServiceCard } from "@/components/ServiceCard";
import { MembershipUpgrade } from "@/components/MembershipUpgrade";
import { MembershipTheme } from "@/components/MembershipTheme";
import { SwimLessonHome } from "@/components/SwimLessonHome";
import { fetchAuthMe } from "@/lib/auth-me-client";
import { HOME_GROUPS } from "@/lib/home-services";

import type { MembershipTier } from "@/lib/membership-theme";
import type { ServiceCardViewModel } from "@/lib/service-cards";

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Chào buổi sáng";
  if (h < 18) return "Chào buổi chiều";
  return "Chào buổi tối";
}

function sameCards(a: ServiceCardViewModel[], b: ServiceCardViewModel[]) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (
      a[i].id !== b[i].id ||
      a[i].status !== b[i].status ||
      a[i].subtitle !== b[i].subtitle ||
      a[i].totalLabel !== b[i].totalLabel
    ) {
      return false;
    }
  }
  return true;
}

export default function HomePage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [pointsBalance, setPointsBalance] = useState(0);
  const [vip, setVip] = useState(false);
  const [goldCard, setGoldCard] = useState(false);
  const [goldPlan, setGoldPlan] = useState<string | null>(null);
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
  const [awaitingPay, setAwaitingPay] = useState(false);
  const onAwaitingPayment = useCallback((waiting: boolean) => {
    setAwaitingPay(waiting);
  }, []);
  const cardsAwaitingPay = useMemo(
    () =>
      [...active, ...upcoming].some((card) => card.status === "PENDING_APPROVAL"),
    [active, upcoming]
  );
  const paymentPending = awaitingPay || cardsAwaitingPay;
  const loadGen = useRef(0);

  const loadHome = useCallback(
    async (opts: { summary: boolean; fresh: boolean; prefetch: boolean }) => {
      const gen = ++loadGen.current;
      const [meRes, sumRes] = await Promise.all([
        fetchAuthMe(opts.fresh ? { fresh: true } : undefined),
        opts.summary
          ? fetch("/api/cards/summary", { cache: "no-store" })
          : Promise.resolve(null),
      ]);
      if (meRes.status === 401 || sumRes?.status === 401) {
        router.replace("/");
        return;
      }
      const me = meRes.ok ? await meRes.json() : null;
      const data = sumRes ? await sumRes.json() : null;
      if (loadGen.current !== gen) return;
      if (sumRes && !sumRes.ok) {
        setError(data?.error || "Không tải được Home");
        setCardReady(true);
        return;
      }
      const customer = me?.customer;
      if (data) {
        const nextActive = (data.active || []) as ServiceCardViewModel[];
        const nextUpcoming = (data.upcoming || []) as ServiceCardViewModel[];
        setName(data.customer?.fullName || "");
        setActive((prev) => (sameCards(prev, nextActive) ? prev : nextActive));
        setUpcoming((prev) =>
          sameCards(prev, nextUpcoming) ? prev : nextUpcoming
        );
      }
      if (typeof customer?.pointsBalance === "number") {
        setPointsBalance(customer.pointsBalance);
      } else if (typeof data?.customer?.pointsBalance === "number") {
        setPointsBalance(data.customer.pointsBalance);
      }
      if (customer) {
        const activeVip = !!customer.vip;
        setVip(activeVip);
        setGoldCard(customer.nameCardGold ?? activeVip);
        setGoldPlan(customer.nameCardPlan ?? null);
        setVipPlanLabel(customer.vipPlanLabel || null);
        setMembershipTier(customer.membershipTier || null);
        setMembershipPackageId(customer.membershipPackageId || null);
        setVipExpiresLabel(customer.vipExpiresLabel || null);
      }
      setCardReady(true);
      if (opts.prefetch) {
        router.prefetch("/qr");
        router.prefetch("/book/pickleball");
        router.prefetch("/tournaments");
        router.prefetch("/activity");
        router.prefetch("/account");
      }
    },
    [router]
  );

  useEffect(() => {
    void loadHome({ summary: true, fresh: false, prefetch: true }).catch(() => {
      setCardReady(true);
    });
    return () => {
      loadGen.current += 1;
    };
  }, [loadHome]);

  useEffect(() => {
    if (!paymentPending) return;
    let polls = 0;
    const run = () => {
      if (document.visibilityState === "hidden") return;
      polls += 1;
      void loadHome({
        summary: polls % 2 === 0,
        fresh: true,
        prefetch: false,
      }).catch(() => undefined);
    };
    const timer = window.setInterval(run, 12000);
    const onVisible = () => {
      if (document.visibilityState === "visible") run();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      loadGen.current += 1;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [paymentPending, loadHome]);

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
            goldCard ? "bg-black" : "bg-[#e8e6e1]"
          }`}
        >
          {goldCard ? (
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
                goldCard ? "text-[#f6e27a]/75" : "text-oasis-mute"
              }`}
            >
              {greeting()}
            </p>
            <p
              className={`mt-1 truncate font-display text-2xl font-semibold leading-tight ${
                goldCard
                  ? "text-[#f6e27a] [text-shadow:0_0_16px_rgba(243,217,138,0.65)]"
                  : "text-oasis-ink"
              }`}
            >
              {name || "Khách HHG Oasis"}
            </p>
            <p
              className={`mt-1 font-display text-lg font-semibold leading-none ${
                goldCard ? "text-[#d4af37]" : "text-oasis-moss"
              }`}
            >
              {pointsBalance} điểm
            </p>
            {goldCard && goldPlan ? (
              <p className="mt-1 text-[11px] font-bold leading-none text-[#f6e27a] [text-shadow:0_0_16px_rgba(243,217,138,0.65)]">
                {goldPlan}
              </p>
            ) : null}
          </div>
          <Link
            href="/account"
            className={`relative grid h-12 w-12 shrink-0 place-items-center rounded-full text-sm font-black leading-none shadow-soft ${
              goldCard
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
          onAwaitingPayment={onAwaitingPayment}
        />
      </div>
    </Shell>
  );
}
