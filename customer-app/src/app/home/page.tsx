"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Shell } from "@/components/Shell";
import { ServiceCard } from "@/components/ServiceCard";
import { HOME_GROUPS, HOME_OFFERS, type HomeOffer } from "@/lib/home-services";
import type { ServiceCardViewModel } from "@/lib/service-cards";

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Chào buổi sáng";
  if (h < 18) return "Chào buổi chiều";
  return "Chào buổi tối";
}

type OfferView = HomeOffer & {
  collected?: boolean;
  status?: string | null;
};

export default function HomePage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [shortId, setShortId] = useState("");
  const [active, setActive] = useState<ServiceCardViewModel[]>([]);
  const [upcoming, setUpcoming] = useState<ServiceCardViewModel[]>([]);
  const [offers, setOffers] = useState<OfferView[]>(
    HOME_OFFERS.map((o) => ({ ...o, collected: false }))
  );
  const [collecting, setCollecting] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    router.prefetch("/qr");
    router.prefetch("/book/pickleball");
    router.prefetch("/activity");
    router.prefetch("/account");
    let cancelled = false;
    (async () => {
      const [sumRes, offerRes] = await Promise.all([
        fetch("/api/cards/summary", { cache: "no-store" }),
        fetch("/api/me/offers", { cache: "no-store" }),
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

      if (offerRes.ok) {
        const od = await offerRes.json();
        if (!cancelled && Array.isArray(od.offers)) setOffers(od.offers);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  async function collectOffer(offerId: string) {
    if (collecting) return;
    setCollecting(offerId);
    setError("");
    try {
      const res = await fetch("/api/me/offers", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ offerId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Không collect được");
      setOffers((prev) =>
        prev.map((o) =>
          o.id === offerId
            ? { ...o, collected: true, status: "COLLECTED" }
            : o
        )
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Collect thất bại");
    } finally {
      setCollecting(null);
    }
  }

  const serviceCount = HOME_GROUPS.reduce((n, g) => n + g.services.length, 0);

  return (
    <Shell>
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
              {serviceCount} khu · 3 nhóm
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

        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-xl font-semibold text-oasis-ink">
              Ưu đãi
            </h2>
            <Link
              href="/account"
              className="text-xs font-semibold text-oasis-moss"
            >
              Ví voucher
            </Link>
          </div>
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
            {offers.map((p) => {
              const collected = !!p.collected || p.status === "COLLECTED";
              const used = p.status === "USED";
              return (
                <div
                  key={p.id}
                  className="relative flex shrink-0 flex-col justify-end overflow-hidden rounded-[24px] text-white shadow-soft"
                  style={{
                    width: "min(82vw, 320px)",
                    minWidth: "min(82vw, 320px)",
                    minHeight: 168,
                    scrollSnapAlign: "center",
                    flexShrink: 0,
                    backgroundImage: `linear-gradient(105deg, rgba(11,18,32,.88), rgba(11,18,32,.35)), url('${p.image}')`,
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                  }}
                >
                  <div className="flex flex-col justify-end p-5">
                    <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-lime-300/90">
                      {p.zoneLabel}
                    </p>
                    <h3 className="font-display text-xl font-semibold leading-tight">
                      {p.title}
                    </h3>
                    <p className="mt-1 line-clamp-2 text-sm text-white/75">
                      {p.subtitle}
                    </p>
                    <button
                      type="button"
                      disabled={collected || used || collecting === p.id}
                      onClick={() => void collectOffer(p.id)}
                      className={`mt-4 inline-flex w-fit rounded-full px-4 py-2 text-xs font-bold disabled:opacity-90 ${
                        collected || used
                          ? "bg-white/25 text-white"
                          : "bg-lime-300 text-[#0b1220]"
                      }`}
                    >
                      {used
                        ? "Đã dùng"
                        : collected
                          ? "Collected"
                          : collecting === p.id
                            ? "…"
                            : "Collect"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </Shell>
  );
}
