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
  const [shortId, setShortId] = useState("");
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

  useEffect(() => {
    router.prefetch("/qr");
    router.prefetch("/book/pickleball");
    router.prefetch("/activity");
    router.prefetch("/account");
    let cancelled = false;
    (async () => {
      const [sumRes, meRes] = await Promise.all([
        fetch("/api/cards/summary", { cache: "no-store" }),
        fetch("/api/auth/me", { cache: "no-store" }),
      ]);
      if (sumRes.status === 401) {
        router.replace("/");
        return;
      }
      const data = await sumRes.json();
      if (!sumRes.ok) {
        if (!cancelled) setError(data.error || "Không tải được Home");
        return;
      }
      if (cancelled) return;
      setName(data.customer?.fullName || "");
      setShortId(data.customer?.shortId || "");
      setActive(data.active || []);
      setUpcoming(data.upcoming || []);

      if (meRes.ok) {
        const me = await meRes.json();
        if (!cancelled && me.customer) {
          setVip(!!me.customer.vip);
          setVipPlanLabel(me.customer.vipPlanLabel || null);
          setMembershipTier(me.customer.membershipTier || null);
          setMembershipPackageId(me.customer.membershipPackageId || null);
          setVipExpiresLabel(me.customer.vipExpiresLabel || null);
        }
      }
    })();
    return () => {
      cancelled = true;
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
        <header className="flex items-center gap-2">
          <Link
            href="/qr"
            className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-oasis-deep text-sm font-black text-oasis-sand shadow-soft"
            aria-label="My Oasis QR"
            title="My Oasis QR"
          >
            QR
          </Link>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-oasis-mute">
              {greeting()}
            </p>
            <p className="truncate font-display text-xl font-semibold text-oasis-ink">
              {name || "Khách HHG Oasis"}
            </p>
            {shortId ? (
              <p className="font-mono text-sm font-semibold text-oasis-moss">
                ID {shortId}
              </p>
            ) : null}
            {vip && vipPlanLabel ? (
              <p className="mt-0.5 text-[11px] font-bold text-oasis-moss">
                {vipPlanLabel}
              </p>
            ) : null}
          </div>
          <Link
            href="/account"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-oasis-moss/15 text-sm font-black text-oasis-moss"
            aria-label="Account"
          >
            {name ? name.trim().charAt(0).toUpperCase() : "U"}
          </Link>
        </header>

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
