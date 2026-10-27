"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Shell } from "@/components/Shell";
import { ServiceCard } from "@/components/ServiceCard";
import type { ServiceCardViewModel } from "@/lib/service-cards";

const SECTORS: { code: string; label: string; zones: string[] }[] = [
  { code: "MIA_OI", label: "Mía Ơi", zones: ["MIA_OI"] },
  { code: "OLYMPIC_POOL", label: "Hồ Olympic", zones: ["OLYMPIC_POOL", "OLYMPIC"] },
  { code: "PICKLEBALL", label: "Pickleball", zones: ["PICKLEBALL"] },
  { code: "SPA", label: "Spa", zones: ["SPA", "SAUNA"] },
  { code: "LONG_NUONG", label: "Lòng nướng", zones: ["LONG_NUONG", "CHI_PHEO"] },
  { code: "VIP_RESORT", label: "VIP", zones: ["VIP_RESORT"] },
  { code: "GYM", label: "Gym", zones: ["GYM", "RESORT_POOL"] },
];

function cardVnd(card: ServiceCardViewModel) {
  if (card.totalLabel) {
    const total = Number(card.totalLabel.replace(/\D/g, ""));
    if (total > 0) return total;
  }
  let sum = 0;
  for (const line of [card.subtitle, ...(card.detailLines || [])]) {
    if (!line || !line.includes("đ")) continue;
    sum += Number(line.replace(/\D/g, "")) || 0;
  }
  return sum;
}

export default function ActivityPage() {
  const router = useRouter();
  const [history, setHistory] = useState<ServiceCardViewModel[]>([]);
  const [error, setError] = useState("");
  const [cancellingId, setCancellingId] = useState("");
  const [filter, setFilter] = useState("latest");

  useEffect(() => {
    let cancelled = false;
    let timer = 0;
    async function load() {
      if (cancelled || document.visibilityState === "hidden") return;
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
      const next = (data.history || []) as ServiceCardViewModel[];
      setHistory((prev) =>
        JSON.stringify(prev) === JSON.stringify(next) ? prev : next
      );
      setError((current) => (current ? "" : current));
    }
    function schedule() {
      if (cancelled) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        void load().finally(schedule);
      }, 12000);
    }
    void load().finally(schedule);
    const onVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [router]);

  const sectors = useMemo(() => {
    const known = new Set(SECTORS.flatMap((s) => s.zones));
    const extra = new Map<string, string>();
    for (const card of history) {
      const zone = String(card.zoneCode || "").toUpperCase();
      if (!zone || known.has(zone) || extra.has(zone)) continue;
      extra.set(zone, card.zoneName || zone);
    }
    return [
      ...SECTORS.map((s) => [s.code, s.label] as const),
      ...[...extra.entries()].sort((a, b) => a[1].localeCompare(b[1], "vi")),
    ];
  }, [history]);

  const visible = useMemo(() => {
    const priced = history.map((card) => ({ card, vnd: cardVnd(card) }));
    const byTime = (dir: number) =>
      [...priced].sort(
        (a, b) => ((a.card.sortAt ?? 0) - (b.card.sortAt ?? 0)) * dir
      );
    let rows = byTime(-1);
    if (filter === "oldest") rows = byTime(1);
    else if (filter === "expensive") {
      rows = [...priced].sort((a, b) => b.vnd - a.vnd);
    } else if (filter === "cheap") {
      rows = [...priced].sort((a, b) => a.vnd - b.vnd);
    } else if (filter.startsWith("zone:")) {
      const code = filter.slice(5);
      const sector = SECTORS.find((s) => s.code === code);
      const zones = new Set(sector ? sector.zones : [code]);
      rows = rows.filter((row) =>
        zones.has(String(row.card.zoneCode || "").toUpperCase())
      );
    }
    return rows.map((row) => row.card);
  }, [history, filter]);

  async function cancelOrder(card: ServiceCardViewModel) {
    if (cancellingId) return;
    if (
      !window.confirm(
        "Huỷ đơn này? Điểm đã đổi sẽ được hoàn, điểm đã cộng từ đơn sẽ bị thu lại."
      )
    ) {
      return;
    }
    setCancellingId(card.id);
    setError("");
    try {
      const res = await fetch("/api/me/orders", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ orderId: card.referenceId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Không huỷ được đơn");
      const res2 = await fetch("/api/cards/activity", { cache: "no-store" });
      const next = await res2.json();
      if (res2.ok) setHistory(next.history || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không huỷ được đơn");
    } finally {
      setCancellingId("");
    }
  }

  return (
    <Shell>
      <div className="animate-rise space-y-5">
        <h1 className="font-display text-3xl font-semibold text-oasis-ink">
          Activity
        </h1>

        {error ? <p className="text-sm text-oasis-coral">{error}</p> : null}

        {history.length > 0 ? (
          <label className="block">
            <span className="sr-only">Lọc</span>
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="h-10 w-full rounded-2xl border border-oasis-line bg-white px-3 text-sm font-bold text-oasis-ink shadow-soft"
            >
              <option value="latest">Mới nhất</option>
              <option value="oldest">Cũ nhất</option>
              {sectors.map(([code, label]) => (
                <option key={code} value={`zone:${code}`}>
                  {label}
                </option>
              ))}
              <option value="expensive">Đắt nhất</option>
              <option value="cheap">Rẻ nhất</option>
            </select>
          </label>
        ) : null}

        {history.length === 0 ? (
          <p className="rounded-[22px] bg-white/70 p-4 text-sm text-oasis-mute shadow-soft">
            Chưa có hoạt động gần đây.
          </p>
        ) : visible.length === 0 ? (
          <p className="rounded-[22px] bg-white/70 p-4 text-sm text-oasis-mute shadow-soft">
            Không có mục cho bộ lọc này.
          </p>
        ) : (
          <div className="space-y-3">
            {visible.map((c) => (
              <ServiceCard
                key={c.id}
                card={c}
                cancelling={cancellingId === c.id}
                onCancel={(card) => void cancelOrder(card)}
              />
            ))}
          </div>
        )}
      </div>
    </Shell>
  );
}
