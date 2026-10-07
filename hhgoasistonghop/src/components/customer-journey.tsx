"use client";

import { useMemo, useState } from "react";
import { ServiceTag } from "@/components/service-tag";
import { getAreaTheme } from "@/config/crm.config";
import { cn, formatDate, formatTime, formatTimeRange } from "@/lib/utils";

export type JourneyUsage = {
  id: string;
  startedAt: string;
  endedAt: string | null;
  status: string;
  service: { code: string; name: string };
};

export type JourneyEvent = {
  id: string;
  occurredAt: string;
  title: string;
  note: string | null;
};

type JourneyItem = {
  id: string;
  at: Date;
  kind: "usage" | "event";
  title: string;
  note?: string | null;
  service?: { code: string; name: string } | null;
  startedAt?: Date;
  endedAt?: Date | null;
};

/**
 * Trên: danh sách khu đã dùng (bấm để lọc)
 * Dưới: timeline khung giờ của khu đó
 */
export function CustomerJourney({
  usages,
  events,
}: {
  usages: JourneyUsage[];
  events: JourneyEvent[];
}) {
  const areas = useMemo(() => {
    const map = new Map<string, { code: string; name: string; count: number }>();
    for (const u of usages) {
      const cur = map.get(u.service.code);
      if (cur) cur.count += 1;
      else map.set(u.service.code, { code: u.service.code, name: u.service.name, count: 1 });
    }
    return [...map.values()];
  }, [usages]);

  const [selected, setSelected] = useState<string | "all">("all");

  const items = useMemo(() => {
    const usageItems: JourneyItem[] = usages
      .filter((u) => selected === "all" || u.service.code === selected)
      .map((u) => ({
        id: `usage-${u.id}`,
        at: new Date(u.startedAt),
        kind: "usage" as const,
        title: u.service.name,
        service: u.service,
        startedAt: new Date(u.startedAt),
        endedAt: u.endedAt ? new Date(u.endedAt) : null,
        note: u.status === "ACTIVE" ? "Đang ở khu này" : null,
      }));

    const eventItems: JourneyItem[] =
      selected === "all"
        ? events.map((e) => ({
            id: `act-${e.id}`,
            at: new Date(e.occurredAt),
            kind: "event" as const,
            title: e.title,
            note: e.note,
          }))
        : [];

    return [...usageItems, ...eventItems].sort((a, b) => b.at.getTime() - a.at.getTime());
  }, [usages, events, selected]);

  const byDay = useMemo(() => {
    const map = new Map<string, JourneyItem[]>();
    for (const item of items) {
      const key = formatDate(item.at);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(item);
    }
    return [...map.entries()];
  }, [items]);

  const selectedArea = areas.find((a) => a.code === selected);

  if (usages.length === 0 && events.length === 0) {
    return <p className="py-8 text-center text-sm text-muted">Chưa có hoạt động</p>;
  }

  return (
    <div>
      {/* Danh sách khu — bấm để xem khung giờ bên dưới */}
      <div className="mb-5">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
          Khu vực đã dùng — bấm để xem thời gian
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setSelected("all")}
            className={cn(
              "rounded-full border px-3 py-1.5 text-xs font-medium transition",
              selected === "all"
                ? "border-[#111827] bg-[#111827] text-white"
                : "border-[#e5e7eb] bg-white text-[#374151] hover:bg-slate-50"
            )}
          >
            Tất cả
          </button>
          {areas.map((a) => {
            const theme = getAreaTheme(a.code);
            const active = selected === a.code;
            return (
              <button
                key={a.code}
                type="button"
                onClick={() => setSelected(a.code)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition",
                  active ? "ring-2 ring-offset-1" : "opacity-90 hover:opacity-100"
                )}
                style={{
                  background: theme.soft,
                  color: theme.text,
                  borderColor: active ? theme.solid : theme.border,
                  boxShadow: active ? `0 0 0 2px ${theme.solid}33` : undefined,
                }}
              >
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ background: theme.solid }}
                  aria-hidden
                />
                {a.name}
                <span className="opacity-60">({a.count})</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Timeline khung giờ */}
      <div>
        <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">
          {selected === "all"
            ? "Timeline toàn bộ"
            : `Thời gian tại ${selectedArea?.name || selected}`}
        </div>

        {byDay.length === 0 && (
          <p className="py-6 text-center text-sm text-muted">
            Chưa có lần dùng khu này
          </p>
        )}

        {byDay.map(([day, dayItems]) => (
          <div key={day} className="mb-6 last:mb-0">
            <div className="mb-3 text-xs font-medium text-[#6b7280]">{day}</div>
            {dayItems.map((item, idx) => {
              const theme = item.service ? getAreaTheme(item.service.code) : null;
              return (
                <div key={item.id} className="relative flex gap-4 pb-5">
                  <div className="flex flex-col items-center">
                    <div
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ background: theme?.solid || "#111827" }}
                    />
                    {idx < dayItems.length - 1 && (
                      <div className="w-px flex-1 bg-border" />
                    )}
                  </div>
                  <div className="-mt-1 min-w-0 flex-1">
                    {item.kind === "usage" && item.startedAt ? (
                      <>
                        <div className="text-sm font-medium text-[#111827]">
                          {formatTimeRange(item.startedAt, item.endedAt)}
                        </div>
                        {selected === "all" && item.service && (
                          <div className="mt-1">
                            <ServiceTag
                              code={item.service.code}
                              name={item.service.name}
                            />
                          </div>
                        )}
                        {item.note && (
                          <div className="mt-1 text-xs text-muted">{item.note}</div>
                        )}
                      </>
                    ) : (
                      <>
                        <div className="text-xs text-muted">{formatTime(item.at)}</div>
                        <div className="text-sm font-medium">{item.title}</div>
                        {item.note && (
                          <div className="mt-0.5 text-xs text-muted">{item.note}</div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
