"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Shell } from "@/components/Shell";
import { ServiceCard } from "@/components/ServiceCard";
import type { ServiceCardViewModel } from "@/lib/service-cards";

export default function ActivityPage() {
  const router = useRouter();
  const [active, setActive] = useState<ServiceCardViewModel[]>([]);
  const [upcoming, setUpcoming] = useState<ServiceCardViewModel[]>([]);
  const [history, setHistory] = useState<ServiceCardViewModel[]>([]);
  const [tab, setTab] = useState<"active" | "upcoming" | "history">("active");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load(isFirst = false) {
      const res = await fetch("/api/cards/activity", { cache: "no-store" });
      if (res.status === 401) {
        router.replace("/login");
        return;
      }
      const data = await res.json();
      if (!res.ok) {
        if (!cancelled) setError(data.error || "Không tải được Activity");
        return;
      }
      if (cancelled) return;
      setError("");
      setActive(data.active || []);
      setUpcoming(data.upcoming || []);
      setHistory(data.history || []);
      if (
        isFirst &&
        (data.active || []).length === 0 &&
        (data.upcoming || []).length > 0
      ) {
        setTab("upcoming");
      }
    }
    void load(true);
    const t = setInterval(() => void load(false), 4000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [router]);

  const list =
    tab === "active" ? active : tab === "upcoming" ? upcoming : history;

  return (
    <Shell>
      <div className="animate-rise space-y-5">
        <header>
          <h1 className="font-display text-3xl font-semibold text-oasis-ink">
            Activity
          </h1>
          <p className="mt-1 text-sm text-oasis-mute">
            Hành trình · booking · order · session
          </p>
        </header>

        <div className="flex gap-2">
          {(
            [
              ["active", "Đang diễn ra"],
              ["upcoming", "Sắp tới"],
              ["history", "Lịch sử"],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => setTab(k)}
              className={`h-11 flex-1 rounded-2xl text-sm font-bold ${
                tab === k
                  ? "bg-oasis-deep text-oasis-sand"
                  : "bg-white/80 text-oasis-mute"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {error ? <p className="text-sm text-oasis-coral">{error}</p> : null}

        {list.length === 0 ? (
          <p className="rounded-[22px] bg-white/70 p-4 text-sm text-oasis-mute shadow-soft">
            {tab === "active"
              ? "Không có dịch vụ đang diễn ra."
              : tab === "upcoming"
                ? "Chưa có booking sắp tới."
                : "Chưa có lịch sử gần đây."}
          </p>
        ) : (
          <div className="space-y-3">
            {list.map((c) => (
              <ServiceCard key={c.id} card={c} />
            ))}
          </div>
        )}
      </div>
    </Shell>
  );
}
