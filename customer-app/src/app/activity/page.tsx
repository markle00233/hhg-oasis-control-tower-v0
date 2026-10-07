"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Shell } from "@/components/Shell";

type EventRow = {
  id: string;
  createdAt: string;
  serviceName: string;
  serviceCode: string;
};

function dayKey(d: Date) {
  return d.toISOString().slice(0, 10);
}

function dayLabel(d: Date) {
  const today = new Date();
  if (dayKey(d) === dayKey(today)) return "Hôm nay";
  return d.toLocaleDateString("vi-VN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default function ActivityPage() {
  const router = useRouter();
  const [events, setEvents] = useState<EventRow[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/events", { cache: "no-store" });
      if (res.status === 401) {
        router.replace("/");
        return;
      }
      const data = await res.json();
      if (!res.ok) {
        if (!cancelled) setError(data.error || "Failed to load");
        return;
      }
      if (!cancelled) setEvents(data.events || []);
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  const groups = useMemo(() => {
    const map = new Map<string, EventRow[]>();
    for (const e of events) {
      const d = new Date(e.createdAt);
      const key = dayKey(d);
      const list = map.get(key) || [];
      list.push(e);
      map.set(key, list);
    }
    return [...map.entries()].map(([key, rows]) => ({
      key,
      label: dayLabel(new Date(key)),
      rows,
    }));
  }, [events]);

  return (
    <Shell>
      <div className="animate-rise space-y-6">
        <h1 className="font-display text-3xl font-semibold text-oasis-ink">Hoạt động</h1>
        {error ? <p className="text-sm text-oasis-coral">{error}</p> : null}
        {groups.length === 0 ? (
          <div className="rounded-3xl bg-white/70 p-6 text-sm text-oasis-mute shadow-soft">
            Chưa có lần quét nào.
          </div>
        ) : (
          groups.map((g) => (
            <section key={g.key} className="space-y-3">
              <h2 className="text-xs font-bold uppercase tracking-[0.18em] text-oasis-mute">
                {g.label}
              </h2>
              <div className="space-y-2">
                {g.rows.map((e) => {
                  const t = new Date(e.createdAt).toLocaleTimeString("vi-VN", {
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: false,
                  });
                  return (
                    <div
                      key={e.id}
                      className="flex items-center justify-between rounded-2xl bg-white/85 px-4 py-4 shadow-soft"
                    >
                      <div>
                        <p className="font-semibold text-oasis-ink">{e.serviceName}</p>
                        <p className="text-xs text-oasis-mute">{e.serviceCode}</p>
                      </div>
                      <p className="font-mono text-sm font-semibold text-oasis-moss">{t}</p>
                    </div>
                  );
                })}
              </div>
            </section>
          ))
        )}
      </div>
    </Shell>
  );
}
