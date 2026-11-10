"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Shell } from "@/components/Shell";
import {
  ATTENDANCE,
  ATTENDANCE_LABEL,
  TOURNAMENT_STATUS_LABEL,
  type TournamentAttendance,
  type TournamentStatus,
} from "@/lib/tournament";

type Entry = {
  id: string;
  name: string;
  dayLabel: string;
  court: string | null;
  eventTime: string | null;
  galleryUrl: string | null;
  startsAt: string;
  status: TournamentStatus;
  rescheduleNote: string | null;
  attendance: TournamentAttendance | null;
};

const FILTERS = [
  { id: "UPCOMING", label: "Sắp diễn ra" },
  { id: "LIVE", label: "Đang diễn ra" },
  { id: "ENDED", label: "Đã kết thúc" },
  { id: "MINE", label: "Đã tham gia" },
] as const;

const COURTS = ["Sân 1", "Sân 2", "Sân 3", "Sân 4", "Sân 5", "Sân 6"];

const TIMES = [
  { id: "ALL", label: "Mọi giờ" },
  { id: "MORNING", label: "Sáng" },
  { id: "AFTERNOON", label: "Chiều" },
  { id: "EVENING", label: "Tối" },
] as const;

type FilterId = (typeof FILTERS)[number]["id"];
type TimeId = (typeof TIMES)[number]["id"];

const STATUS_TINT: Record<FilterId, string> = {
  UPCOMING: "bg-amber-100 text-amber-900",
  LIVE: "bg-green-100 text-green-800",
  ENDED: "bg-slate-200 text-slate-700",
  MINE: "bg-sky-100 text-sky-900",
};

const EMPTY: Record<FilterId, string> = {
  UPCOMING: "Chưa có giải sắp diễn ra.",
  LIVE: "Không có giải đang diễn ra.",
  ENDED: "Chưa có giải đã kết thúc.",
  MINE: "Bạn chưa tham gia giải nào.",
};

function courtName(value: string | null | undefined) {
  return (value || "").replace(/\s+/g, " ").trim();
}

function timeBucket(eventTime: string | null): TimeId {
  const hour = Number(String(eventTime || "").slice(0, 2));
  if (!Number.isFinite(hour) || !eventTime) return "ALL";
  if (hour < 12) return "MORNING";
  if (hour < 18) return "AFTERNOON";
  return "EVENING";
}

function inFilter(row: Entry, filter: FilterId) {
  if (filter === "MINE") {
    return (
      row.attendance === ATTENDANCE.REGISTERED ||
      row.attendance === ATTENDANCE.PRESENT ||
      row.attendance === ATTENDANCE.NO_SHOW
    );
  }
  return row.status === filter;
}

const EVENT_TONE: Record<TournamentStatus, string> = {
  UPCOMING: "bg-amber-100 text-amber-900",
  LIVE: "bg-green-100 text-green-800",
  ENDED: "bg-slate-200 text-slate-700",
};

const TONE: Record<TournamentAttendance, string> = {
  REGISTERED: "bg-sky-100 text-sky-900",
  PRESENT: "bg-green-100 text-green-800",
  NO_SHOW: "bg-amber-100 text-amber-900",
  CANCELLED: "bg-red-100 text-red-800",
};

function FilterGroup({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="mt-3 first:mt-0">
      <p className="mb-1.5 text-[11px] font-extrabold uppercase tracking-[0.08em] text-oasis-mute">
        {label}
      </p>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function FilterChip({
  label,
  active,
  tint,
  onClick,
}: {
  label: string;
  active: boolean;
  tint?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`h-8 rounded-full px-3 text-xs font-bold transition duration-200 active:scale-95 ${
        active ? "bg-oasis-ink text-white" : tint || "bg-oasis-mist text-oasis-ink"
      }`}
    >
      {label}
    </button>
  );
}

export default function TournamentsPage() {
  const router = useRouter();
  const [rows, setRows] = useState<Entry[]>([]);
  const [filter, setFilter] = useState<FilterId>("UPCOMING");
  const [court, setCourt] = useState("ALL");
  const [time, setTime] = useState<TimeId>("ALL");
  const [filterOpen, setFilterOpen] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [busyId, setBusyId] = useState("");

  const load = useCallback(async () => {
    const res = await fetch("/api/me/tournaments", { cache: "no-store" });
    if (res.status === 401) {
      router.replace("/login");
      return;
    }
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Không tải được giải.");
    setRows(data.tournaments || []);
  }, [router]);

  useEffect(() => {
    void load().catch((err) =>
      setError(err instanceof Error ? err.message : "Không tải được giải.")
    );
  }, [load]);

  useEffect(() => {
    if (!filterOpen) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setFilterOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [filterOpen]);

  async function act(id: string, intent: "join" | "cancel") {
    if (busyId) return;
    if (intent === "cancel" && !window.confirm("Hủy đăng ký giải này?")) return;
    setBusyId(id);
    setError("");
    setInfo("");
    try {
      const res = await fetch(`/api/me/tournaments/${id}/${intent}`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Không lưu được.");
      setInfo(data.message || "");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không lưu được.");
    } finally {
      setBusyId("");
    }
  }

  const current = FILTERS.find((item) => item.id === filter) || FILTERS[0];
  const timeLabel = TIMES.find((item) => item.id === time)?.label || "";
  const narrowed = court !== "ALL" || time !== "ALL";
  const courtOptions = useMemo(() => {
    const known = new Set<string>(COURTS);
    const extra: string[] = [];
    for (const row of rows) {
      const name = courtName(row.court);
      if (!name || known.has(name)) continue;
      known.add(name);
      extra.push(name);
    }
    extra.sort((a, b) => a.localeCompare(b, "vi"));
    return [...COURTS, ...extra];
  }, [rows]);
  const filterLabel = [current.label, court === "ALL" ? "" : court, time === "ALL" ? "" : timeLabel]
    .filter(Boolean)
    .join(" · ");
  const shown = useMemo(
    () =>
      rows
        .filter((row) => {
          if (!inFilter(row, filter)) return false;
          if (court !== "ALL" && courtName(row.court) !== court) return false;
          if (time !== "ALL" && timeBucket(row.eventTime) !== time) return false;
          return true;
        })
        .sort((a, b) => {
          const delta = a.startsAt < b.startsAt ? -1 : a.startsAt > b.startsAt ? 1 : 0;
          return filter === "ENDED" || filter === "MINE" ? -delta : delta;
        }),
    [rows, filter, court, time]
  );

  return (
    <Shell>
      <div className="animate-rise space-y-5">
        <div className="flex items-center justify-between gap-3">
          <h1 className="font-display text-3xl font-semibold text-oasis-ink">
            Giải đấu
          </h1>
          <div className={filterOpen ? "relative z-[60]" : "relative"}>
            <button
              type="button"
              onClick={() => setFilterOpen((open) => !open)}
              title={filterLabel}
              className="relative z-30 flex h-10 max-w-[12rem] items-center gap-2 rounded-full bg-oasis-ink px-4 text-sm font-bold text-white"
              aria-expanded={filterOpen}
              aria-haspopup="dialog"
            >
              <span className="truncate">{filterLabel}</span>
              <span
                aria-hidden="true"
                className={`inline-block transition-transform duration-200 ${
                  filterOpen ? "rotate-180" : ""
                }`}
              >
                ▾
              </span>
            </button>
            {filterOpen ? (
              <>
                <button
                  type="button"
                  className="fixed inset-0 z-10 cursor-default"
                  aria-label="Đóng bộ lọc"
                  onClick={() => setFilterOpen(false)}
                />
                <div
                  role="dialog"
                  aria-label="Lọc giải"
                  className="animate-settle absolute right-0 z-20 mt-2 w-[min(18rem,calc(100vw-2rem))] rounded-2xl bg-white p-3 shadow-soft"
                >
                  <FilterGroup label="Trạng thái">
                    {FILTERS.map((item) => (
                      <FilterChip
                        key={item.id}
                        label={item.label}
                        active={item.id === filter}
                        tint={STATUS_TINT[item.id]}
                        onClick={() => setFilter(item.id)}
                      />
                    ))}
                  </FilterGroup>
                  <FilterGroup label="Sân">
                    <FilterChip
                      label="Mọi sân"
                      active={court === "ALL"}
                      onClick={() => setCourt("ALL")}
                    />
                    {courtOptions.map((name) => (
                      <FilterChip
                        key={name}
                        label={name}
                        active={court === name}
                        onClick={() => setCourt(name)}
                      />
                    ))}
                  </FilterGroup>
                  <FilterGroup label="Giờ">
                    {TIMES.map((item) => (
                      <FilterChip
                        key={item.id}
                        label={item.label}
                        active={item.id === time}
                        onClick={() => setTime(item.id)}
                      />
                    ))}
                  </FilterGroup>
                  {filter !== "UPCOMING" || narrowed ? (
                    <button
                      type="button"
                      onClick={() => {
                        setFilter("UPCOMING");
                        setCourt("ALL");
                        setTime("ALL");
                      }}
                      className="mt-3 h-8 w-full rounded-xl border border-oasis-line text-xs font-bold text-oasis-mute"
                    >
                      Xóa lọc
                    </button>
                  ) : null}
                </div>
              </>
            ) : null}
          </div>
        </div>
        {error ? <p className="text-sm font-semibold text-oasis-coral">{error}</p> : null}
        {info ? <p className="text-sm font-semibold text-green-800">{info}</p> : null}
        {shown.length === 0 ? (
          <p className="animate-settle rounded-[22px] bg-white/70 p-4 text-sm text-oasis-mute shadow-soft">
            {narrowed ? "Không có giải nào." : EMPTY[filter]}
          </p>
        ) : (
          <div key={`${filter}|${court}|${time}`} className="space-y-3">
            {shown.map((row, index) => {
              const place = [row.dayLabel, row.court, row.eventTime]
                .filter(Boolean)
                .join(" · ");
              const attendance = row.attendance;
              return (
                <article
                  key={row.id}
                  className="animate-settle rounded-[22px] bg-white p-4 shadow-soft"
                  style={{ animationDelay: `${Math.min(index, 6) * 35}ms` }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2 className="text-base font-bold text-oasis-ink">{row.name}</h2>
                      <p className="mt-1 text-sm text-oasis-mute">{place}</p>
                      {row.galleryUrl ? (
                        <a
                          href={row.galleryUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-1 inline-block text-sm font-bold text-oasis-moss"
                        >
                          Ảnh giải
                        </a>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-extrabold ${EVENT_TONE[row.status]}`}
                      >
                        {TOURNAMENT_STATUS_LABEL[row.status]}
                      </span>
                      {row.rescheduleNote ? (
                        <span className="max-w-[9.5rem] text-right text-xs font-bold text-amber-800">
                          {row.rescheduleNote}
                        </span>
                      ) : null}
                      {attendance ? (
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-extrabold ${TONE[attendance]}`}
                        >
                          {ATTENDANCE_LABEL[attendance]}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <div className="mt-3">
                    {attendance === ATTENDANCE.REGISTERED ? (
                      <button
                        type="button"
                        disabled={busyId === row.id}
                        onClick={() => void act(row.id, "cancel")}
                        className="h-11 rounded-2xl border border-oasis-line px-4 text-sm font-bold text-oasis-ink"
                      >
                        Hủy đăng ký
                      </button>
                    ) : !attendance && row.status === "UPCOMING" ? (
                      <button
                        type="button"
                        disabled={busyId === row.id}
                        onClick={() => void act(row.id, "join")}
                        className="h-11 rounded-2xl bg-oasis-ink px-4 text-sm font-bold text-white"
                      >
                        Tham gia
                      </button>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </Shell>
  );
}
