"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ATTENDANCE,
  ATTENDANCE_LABEL,
  DEFAULT_VOUCHER_DISCOUNT_VND,
  TOURNAMENT_STATUS_LABEL,
  isWithinTournamentWindow,
  type TournamentAttendance,
  type TournamentStatus,
} from "@/lib/tournament";

type PendingSignup = {
  id: string;
  tournamentId: string;
  tournamentName: string;
  dayLabel: string;
  fullName: string;
  phone: string | null;
  createdAt: string;
};

type TournamentRow = {
  id: string;
  name: string;
  court: string | null;
  eventTime: string | null;
  status: TournamentStatus;
  plannedWhen: string | null;
  movedWhen: string | null;
  dayLabel: string;
  day: string;
  startsAt: string;
  endsAt: string;
  discountVnd: number;
  checkInCount: number;
  pendingCount: number;
  voucherUsedCount: number;
  voucherOpenCount: number;
};

type Athlete = {
  id: string;
  customerId: string;
  fullName: string;
  phone: string | null;
  source: string;
  attendance: TournamentAttendance;
  checkedInAt: string | null;
  createdAt: string;
  checkedByName: string | null;
};

type TournamentDetail = {
  id: string;
  name: string;
  court: string | null;
  eventTime: string | null;
  summary: string | null;
  status: TournamentStatus;
  plannedWhen: string | null;
  movedWhen: string | null;
  dayLabel: string;
  day: string;
  startsAt: string;
  endsAt: string;
  discountVnd: number;
  checkInUrl: string;
  resultsImage: string | null;
  galleryUrl: string | null;
  athletes: Athlete[];
};

type Hit = { id: string; fullName: string; phone: string };

type StatusFilter = "ALL" | TournamentStatus;
type TimeFilter = "ALL" | "MORNING" | "AFTERNOON" | "EVENING";
type DayFilter = "ALL" | "TODAY";

const TIME_FILTERS: { id: TimeFilter; label: string }[] = [
  { id: "ALL", label: "Mọi giờ" },
  { id: "MORNING", label: "Sáng" },
  { id: "AFTERNOON", label: "Chiều" },
  { id: "EVENING", label: "Tối" },
];

const COURT_FILTERS = ["Sân 1", "Sân 2", "Sân 3", "Sân 4", "Sân 5", "Sân 6"];

const STATUS_FILTERS: { id: StatusFilter; label: string }[] = [
  { id: "ALL", label: "Tất cả" },
  { id: "UPCOMING", label: "Sắp diễn ra" },
  { id: "LIVE", label: "Đang diễn ra" },
  { id: "ENDED", label: "Đã kết thúc" },
];

const vnDayFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Ho_Chi_Minh",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const FILTER_MOTION_MS = 180;

function filterMotionMs() {
  if (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  ) {
    return 0;
  }
  return FILTER_MOTION_MS;
}

function vnTodayKey() {
  return vnDayFormat.format(new Date());
}

function courtName(value: string | null | undefined) {
  return (value || "").replace(/\s+/g, " ").trim();
}

function DelayBand({ planned, moved }: { planned: string; moved: string }) {
  return (
    <div style={styles.delayBand}>
      <div>
        <div style={styles.delayKicker}>Giờ dự kiến</div>
        <div style={styles.delayOld}>{planned}</div>
      </div>
      <div style={styles.delayArrow} aria-hidden>
        →
      </div>
      <div>
        <div style={styles.delayKicker}>Giờ dời</div>
        <div style={styles.delayNew}>{moved}</div>
      </div>
    </div>
  );
}

function timeBucket(eventTime: string | null): TimeFilter {
  const hour = Number(String(eventTime || "").slice(0, 2));
  if (!Number.isFinite(hour) || !eventTime) return "ALL";
  if (hour < 12) return "MORNING";
  if (hour < 18) return "AFTERNOON";
  return "EVENING";
}

function formatVndInput(n: number) {
  return Math.max(0, Math.round(n)).toLocaleString("vi-VN");
}

function parseVndInput(raw: string) {
  return Number(raw.replace(/\D/g, "") || 0);
}

function clock(iso: string) {
  return new Date(iso).toLocaleTimeString("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function athleteDetail(a: Athlete) {
  if (a.attendance === ATTENDANCE.PRESENT && a.checkedInAt) {
    const parts = [
      clock(a.checkedInAt),
      a.source === "STAFF" ? "Quầy" : a.source === "APP" ? "App" : "QR",
    ];
    if (a.checkedByName) parts.push(a.checkedByName);
    return parts.join(" · ");
  }
  return a.createdAt ? clock(a.createdAt) : "";
}

async function fileToResultsImage(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  try {
    let maxEdge = 1280;
    let quality = 0.72;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Không đọc được ảnh.");
    for (let attempt = 0; attempt < 6; attempt++) {
      const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL("image/jpeg", quality);
      if (dataUrl.startsWith("data:image/jpeg") && dataUrl.length <= 700_000) {
        return dataUrl;
      }
      quality = Math.max(0.42, quality - 0.12);
      maxEdge = Math.round(maxEdge * 0.75);
    }
    throw new Error("Ảnh quá lớn. Chụp lại gần bảng kết quả hơn.");
  } finally {
    bitmap.close();
  }
}

export function DeskTournaments({
  onBack,
  onLogout,
}: {
  onBack: () => void;
  onLogout: () => void;
}) {
  const [rows, setRows] = useState<TournamentRow[]>([]);
  const [pending, setPending] = useState<PendingSignup[]>([]);
  const [detail, setDetail] = useState<TournamentDetail | null>(null);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [day, setDay] = useState("");
  const [court, setCourt] = useState("");
  const [eventTime, setEventTime] = useState("");
  const [summary, setSummary] = useState("");
  const [discount, setDiscount] = useState(formatVndInput(DEFAULT_VOUCHER_DISCOUNT_VND));
  const [qrUrl, setQrUrl] = useState("");
  const [phone, setPhone] = useState("");
  const [athleteName, setAthleteName] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [gallery, setGallery] = useState("");
  const [athletesOpen, setAthletesOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [filterPresent, setFilterPresent] = useState(false);
  const filterTimer = useRef<number | null>(null);
  const filterOpenRef = useRef(false);
  filterOpenRef.current = filterOpen;
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [courtFilter, setCourtFilter] = useState("ALL");
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("ALL");
  const [dayFilter, setDayFilter] = useState<DayFilter>("ALL");
  const [reviewId, setReviewId] = useState("");

  const loadList = useCallback(async () => {
    const res = await fetch("/api/crm/desk/tournaments", { cache: "no-store" });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Không tải được danh sách giải.");
    setRows(data.tournaments || []);
    setPending(Array.isArray(data.pending) ? data.pending : []);
  }, []);

  const loadDetail = useCallback(async (id: string) => {
    const res = await fetch(`/api/crm/desk/tournaments/${id}`, {
      cache: "no-store",
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Không tải được giải.");
    const next = data.tournament as TournamentDetail;
    setDetail(next);
    setName(next.name);
    setDay(next.day);
    setCourt(next.court || "");
    setEventTime(next.eventTime || "");
    setSummary(next.summary || "");
    setDiscount(formatVndInput(next.discountVnd));
    setGallery(next.galleryUrl || "");
    return next;
  }, []);

  useEffect(() => {
    void loadList().catch((e) =>
      setError(e instanceof Error ? e.message : "Không tải được danh sách giải.")
    );
  }, [loadList]);

  useEffect(() => {
    if (detail) return;
    const pull = () => {
      if (document.visibilityState === "hidden") return;
      void loadList().catch(() => undefined);
    };
    const timer = window.setInterval(pull, pending.length > 0 ? 4_000 : 10_000);
    document.addEventListener("visibilitychange", pull);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", pull);
    };
  }, [detail, loadList, pending.length]);

  useEffect(() => {
    if (!detail?.checkInUrl) {
      setQrUrl("");
      return;
    }
    let cancelled = false;
    fetch("/api/desk/qr", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: detail.checkInUrl, width: 280, margin: 1 }),
    })
      .then(async (res) => {
        if (!res.ok) throw new Error("qr");
        const data = (await res.json()) as { dataUrl?: string };
        if (!data.dataUrl) throw new Error("qr");
        return data.dataUrl;
      })
      .then((url) => {
        if (!cancelled) setQrUrl(url);
      })
      .catch(() => {
        if (!cancelled) setQrUrl("");
      });
    return () => {
      cancelled = true;
    };
  }, [detail?.checkInUrl]);

  useEffect(() => {
    const q = phone.trim();
    if (q.length < 3 || customerId) {
      setHits([]);
      return;
    }
    const handle = window.setTimeout(() => {
      void (async () => {
        const res = await fetch(
          `/api/crm/desk/search-customers?zone=PICKLEBALL&q=${encodeURIComponent(q)}`,
          { cache: "no-store" }
        );
        const data = await res.json().catch(() => ({}));
        if (!res.ok) return;
        setHits(
          (data.customers || []).map(
            (c: { id: string; fullName: string; phone: string }) => ({
              id: c.id,
              fullName: c.fullName,
              phone: c.phone,
            })
          )
        );
      })();
    }, 250);
    return () => window.clearTimeout(handle);
  }, [phone, customerId]);

  async function createTournament(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setInfo("");
    try {
      const res = await fetch("/api/crm/desk/tournaments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name,
          day,
          court,
          eventTime,
          summary,
          discountVnd: parseVndInput(discount),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Không tạo được giải.");
      setCreating(false);
      setName("");
      setDay("");
      setCourt("");
      setEventTime("");
      setSummary("");
      await loadList();
      await loadDetail(data.tournament.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không tạo được giải.");
    } finally {
      setBusy(false);
    }
  }

  async function saveTournament(e?: React.FormEvent) {
    e?.preventDefault();
    if (!detail) return;
    setBusy(true);
    setError("");
    setInfo("");
    try {
      const res = await fetch(`/api/crm/desk/tournaments/${detail.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          day,
          court,
          eventTime,
          galleryUrl: gallery,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Không lưu được giải.");
      setDetail(data.tournament);
      setInfo("Đã lưu.");
      await loadList();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không lưu được giải.");
    } finally {
      setBusy(false);
    }
  }

  async function reviewAthlete(
    tournamentId: string,
    checkInId: string,
    decision: "approve" | "reject",
    person?: { fullName: string; phone: string | null }
  ) {
    if (reviewId) return;
    const athlete =
      person ||
      (detail?.id === tournamentId
        ? detail.athletes.find((row) => row.id === checkInId)
        : undefined);
    const name = athlete?.fullName || "vận động viên";
    const phone = athlete?.phone ? ` (${athlete.phone})` : "";
    const question =
      decision === "approve"
        ? `Đã thu tiền của ${name}${phone}? Duyệt đăng ký sau khi thanh toán.`
        : `Từ chối đăng ký của ${name}${phone}?`;
    if (!window.confirm(question)) return;
    setReviewId(checkInId);
    setError("");
    setInfo("");
    try {
      const res = await fetch(`/api/crm/desk/tournaments/${tournamentId}/review`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ checkInId, decision }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Không duyệt được.");
      setInfo(data.message || "Đã lưu.");
      const attendance =
        data.attendance === ATTENDANCE.CANCELLED
          ? ATTENDANCE.CANCELLED
          : ATTENDANCE.REGISTERED;
      setPending((prev) => prev.filter((row) => row.id !== checkInId));
      setDetail((prev) =>
        prev && prev.id === tournamentId
          ? {
              ...prev,
              athletes: prev.athletes.map((row) =>
                row.id === checkInId ? { ...row, attendance } : row
              ),
            }
          : prev
      );
      setRows((prev) =>
        prev.map((row) =>
          row.id === tournamentId
            ? { ...row, pendingCount: Math.max(0, row.pendingCount - 1) }
            : row
        )
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không duyệt được.");
    } finally {
      setReviewId("");
    }
  }

  async function onResultsFile(file: File | null) {
    if (!detail || !file) return;
    setBusy(true);
    setError("");
    try {
      const resultsImage = await fileToResultsImage(file);
      const res = await fetch(`/api/crm/desk/tournaments/${detail.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ resultsImage }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Không lưu được ảnh.");
      setDetail(data.tournament);
      setInfo("Đã lưu bảng kết quả.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không lưu được ảnh.");
    } finally {
      setBusy(false);
    }
  }

  async function clearResults() {
    if (!detail) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/crm/desk/tournaments/${detail.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ resultsImage: null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Không xoá được ảnh.");
      setDetail(data.tournament);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không xoá được ảnh.");
    } finally {
      setBusy(false);
    }
  }

  async function saveAthlete(intent: "register" | "check-in") {
    if (!detail) return;
    setBusy(true);
    setError("");
    setInfo("");
    try {
      const res = await fetch(`/api/crm/desk/tournaments/${detail.id}/check-in`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          customerId: customerId || undefined,
          phone,
          fullName: athleteName,
          intent,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(
          data.error || (intent === "register" ? "Không đăng ký được." : "Không check-in được.")
        );
      }
      setPhone("");
      setAthleteName("");
      setCustomerId("");
      setHits([]);
      setInfo(
        data.message ||
          (intent === "register" ? "Đã đăng ký." : "Đã check-in.")
      );
      await loadDetail(detail.id);
      await loadList();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : intent === "register"
            ? "Không đăng ký được."
            : "Không check-in được."
      );
    } finally {
      setBusy(false);
    }
  }

  async function removeTournament() {
    if (!detail) return;
    if (!window.confirm(`Xoá giải “${detail.name}”?`)) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/crm/desk/tournaments/${detail.id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Không xoá được giải.");
      setDetail(null);
      await loadList();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không xoá được giải.");
    } finally {
      setBusy(false);
    }
  }

  function printQr() {
    if (!detail || !qrUrl) return;
    const w = window.open("", "_blank", "noopener,noreferrer");
    if (!w) return;
    const title = `${detail.dayLabel} · ${detail.name}`;
    w.document.write(
      `<!doctype html><title>${title}</title><body style="font-family:sans-serif;text-align:center;padding:24px"><h1 style="font-size:22px">${title}</h1><p>Quét để check-in</p><img alt="QR" src="${qrUrl}" width="280" height="280"/><p style="font-size:12px;color:#64748b">${detail.checkInUrl}</p></body>`
    );
    w.document.close();
    w.focus();
    w.print();
  }

  const closeFilter = useCallback(() => {
    setFilterOpen(false);
    if (filterTimer.current != null) window.clearTimeout(filterTimer.current);
    filterTimer.current = window.setTimeout(() => {
      setFilterPresent(false);
      filterTimer.current = null;
    }, filterMotionMs());
  }, []);

  const openFilter = useCallback(() => {
    if (filterTimer.current != null) {
      window.clearTimeout(filterTimer.current);
      filterTimer.current = null;
    }
    setFilterPresent(true);
    setFilterOpen(true);
  }, []);

  const toggleFilter = useCallback(() => {
    if (filterOpenRef.current) closeFilter();
    else openFilter();
  }, [closeFilter, openFilter]);

  useEffect(() => {
    if (!filterOpen) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") closeFilter();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [filterOpen, closeFilter]);

  useEffect(() => {
    return () => {
      if (filterTimer.current != null) window.clearTimeout(filterTimer.current);
    };
  }, []);

  const courtOptions = useMemo(() => {
    const known = new Set<string>(COURT_FILTERS);
    const extra: string[] = [];
    for (const row of rows) {
      const name = courtName(row.court);
      if (!name || known.has(name)) continue;
      known.add(name);
      extra.push(name);
    }
    extra.sort((a, b) => a.localeCompare(b, "vi"));
    return [...COURT_FILTERS, ...extra];
  }, [rows]);
  const activeCourt =
    courtFilter === "ALL" || courtOptions.includes(courtFilter) ? courtFilter : "ALL";
  const todayKey = vnTodayKey();
  const filteredRows = useMemo(
    () =>
      rows.filter((row) => {
        if (statusFilter !== "ALL" && row.status !== statusFilter) return false;
        if (activeCourt !== "ALL" && courtName(row.court) !== activeCourt) return false;
        if (timeFilter !== "ALL" && timeBucket(row.eventTime) !== timeFilter) return false;
        if (dayFilter === "TODAY" && row.day !== todayKey) return false;
        return true;
      }),
    [rows, statusFilter, activeCourt, timeFilter, dayFilter, todayKey]
  );
  const pendingHere = detail
    ? detail.athletes.reduce(
        (count, athlete) =>
          count + (athlete.attendance === ATTENDANCE.PENDING ? 1 : 0),
        0
      )
    : 0;
  const filterLabel = useMemo(() => {
    const timeLabel = TIME_FILTERS.find((item) => item.id === timeFilter)?.label || "";
    const bits = [
      statusFilter === "ALL" ? "" : TOURNAMENT_STATUS_LABEL[statusFilter],
      activeCourt === "ALL" ? "" : activeCourt,
      timeFilter === "ALL" ? "" : timeLabel,
      dayFilter === "TODAY" ? "Hôm nay" : "",
    ].filter(Boolean);
    return bits.length ? bits.join(" · ") : "Lọc";
  }, [statusFilter, activeCourt, timeFilter, dayFilter]);
  const filtering = filterLabel !== "Lọc";
  const filterKey = `${statusFilter}|${activeCourt}|${timeFilter}|${dayFilter}`;

  const openToday =
    !!detail &&
    isWithinTournamentWindow(new Date(detail.startsAt), new Date(detail.endsAt));
  const ended = !!detail && Date.now() >= new Date(detail.endsAt).getTime();
  const canRegister = detail?.status === "UPCOMING";

  return (
    <main style={styles.page}>
      <style>{TOURNAMENT_MOTION_CSS}</style>
      <div style={styles.card}>
        <div style={styles.top}>
          <div>
            <p style={styles.eyebrow}>adminAllplace · Giải đấu</p>
            <h1 style={styles.h1}>{detail ? detail.name : "Giải đấu"}</h1>
            {detail ? <p style={styles.mute}>{detail.dayLabel}</p> : null}
          </div>
          <div style={styles.actions}>
            {detail ? null : (
              <div style={{ position: "relative" }}>
                <button
                  type="button"
                  aria-expanded={filterOpen}
                  aria-haspopup="dialog"
                  title={filterLabel}
                  onClick={toggleFilter}
                  style={{
                    ...styles.ghost,
                    position: "relative",
                    zIndex: 22,
                    display: "inline-flex",
                    alignItems: "center",
                    maxWidth: 240,
                    fontWeight: 800,
                    transition:
                      "background 180ms ease, color 180ms ease, border-color 180ms ease",
                    ...(filtering
                      ? {
                          background: "#0f172a",
                          color: "#fff",
                          border: "1px solid #0f172a",
                        }
                      : {}),
                  }}
                >
                  <span
                    style={{
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {filterLabel}
                  </span>
                  <span
                    aria-hidden="true"
                    className={
                      filterOpen ? "desk-filter-caret is-open" : "desk-filter-caret"
                    }
                  >
                    ▾
                  </span>
                </button>
                {filterPresent ? (
                  <>
                    <button
                      type="button"
                      aria-label="Đóng bộ lọc"
                      onClick={closeFilter}
                      className={
                        filterOpen
                          ? "desk-filter-backdrop"
                          : "desk-filter-backdrop is-closing"
                      }
                      style={styles.filterBackdrop}
                    />
                    <div
                      role="dialog"
                      aria-label="Lọc giải"
                      className={
                        filterOpen ? "desk-filter-menu" : "desk-filter-menu is-closing"
                      }
                      style={styles.filterMenu}
                    >
                      <FilterGroup
                        label="Trạng thái"
                        value={statusFilter}
                        options={STATUS_FILTERS}
                        onChange={setStatusFilter}
                      />
                      <FilterGroup
                        label="Sân"
                        value={activeCourt}
                        options={[
                          { id: "ALL", label: "Mọi sân" },
                          ...courtOptions.map((court) => ({
                            id: court,
                            label: court,
                          })),
                        ]}
                        onChange={setCourtFilter}
                      />
                      <FilterGroup
                        label="Giờ"
                        value={timeFilter}
                        options={TIME_FILTERS}
                        onChange={setTimeFilter}
                      />
                      <FilterGroup
                        label="Ngày"
                        value={dayFilter}
                        options={[
                          { id: "ALL", label: "Mọi ngày" },
                          { id: "TODAY", label: "Hôm nay" },
                        ]}
                        onChange={setDayFilter}
                      />
                      {filtering ? (
                        <button
                          type="button"
                          className="desk-tournament-note"
                          style={styles.filterClear}
                          onClick={() => {
                            setStatusFilter("ALL");
                            setCourtFilter("ALL");
                            setTimeFilter("ALL");
                            setDayFilter("ALL");
                          }}
                        >
                          Xóa lọc
                        </button>
                      ) : null}
                    </div>
                  </>
                ) : null}
              </div>
            )}
            {detail ? null : (
              <button
                type="button"
                style={styles.btn}
                onClick={() => {
                  setCreating((v) => !v);
                  setError("");
                }}
              >
                {creating ? "Đóng" : "+ Tạo giải"}
              </button>
            )}
            {detail ? (
              <button
                type="button"
                style={styles.ghost}
                onClick={() => {
                  setDetail(null);
                  setCreating(false);
                  setAthletesOpen(false);
                  setError("");
                  setInfo("");
                }}
              >
                ← Danh sách
              </button>
            ) : (
              <button type="button" style={styles.ghost} onClick={onBack}>
                ← Khu vực
              </button>
            )}
            <button type="button" style={styles.ghost} onClick={onLogout}>
              Đăng xuất
            </button>
          </div>
        </div>

        {error ? <p style={styles.err}>{error}</p> : null}
        {info ? <p style={styles.ok}>{info}</p> : null}

        {!detail ? (
          <>
            {creating ? (
              <form
                onSubmit={createTournament}
                className="desk-tournament-note"
                style={styles.form}
              >
                <label style={styles.label}>
                  Tên giải
                  <input
                    style={styles.input}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Pickleball Hội Doanh nhân"
                  />
                </label>
                <label style={styles.label}>
                  Ngày giải
                  <input
                    style={styles.input}
                    type="date"
                    value={day}
                    onChange={(e) => setDay(e.target.value)}
                  />
                </label>
                <PlaceAndTime
                  court={court}
                  eventTime={eventTime}
                  onCourt={setCourt}
                  onTime={setEventTime}
                />
                <NoteField value={summary} onChange={setSummary} />
                <VoucherAmount value={discount} onChange={setDiscount} />
                <button type="submit" style={styles.btn} disabled={busy}>
                  Tạo
                </button>
              </form>
            ) : null}

            {pending.length > 0 ? (
              <div style={styles.notice}>
                <strong>Đăng ký chờ duyệt · {pending.length}</strong>
                <p style={{ margin: 0 }}>
                  Khách vừa bấm đăng ký. Gọi số điện thoại để thu tiền, rồi bấm Duyệt.
                </p>
                {pending.map((row) => (
                  <div key={row.id} style={styles.noticeRow}>
                    <div>
                      <strong>{row.fullName}</strong>
                      <div style={styles.noticeMeta}>
                        {row.phone ? (
                          <a href={`tel:${row.phone.replace(/\s/g, "")}`}>{row.phone}</a>
                        ) : (
                          "Không có số"
                        )}
                        {` · ${row.tournamentName} · ${row.dayLabel}`}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 6, flex: "0 0 auto" }}>
                      <button
                        type="button"
                        style={styles.btn}
                        disabled={!!reviewId}
                        onClick={() =>
                          void reviewAthlete(row.tournamentId, row.id, "approve", row)
                        }
                      >
                        {reviewId === row.id ? "…" : "Duyệt"}
                      </button>
                      <button
                        type="button"
                        style={styles.ghost}
                        disabled={!!reviewId}
                        onClick={() =>
                          void reviewAthlete(row.tournamentId, row.id, "reject", row)
                        }
                      >
                        Từ chối
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}

            <div key={filterKey} style={styles.list}>
              {rows.length === 0 ? (
                <p className="desk-tournament-note" style={styles.mute}>
                  Chưa có giải nào.
                </p>
              ) : filteredRows.length === 0 ? (
                <p className="desk-tournament-note" style={styles.mute}>
                  Không có giải nào.
                </p>
              ) : (
                filteredRows.map((row, index) => (
                  <button
                    key={row.id}
                    type="button"
                    className="desk-tournament-row"
                    style={{
                      ...styles.row,
                      flexDirection: "column",
                      alignItems: "stretch",
                      animationDelay: `${Math.min(index, 7) * 28}ms`,
                    }}
                    onClick={() => {
                      setError("");
                      setInfo("");
                      setAthletesOpen(false);
                      void loadDetail(row.id).catch((e) =>
                        setError(e instanceof Error ? e.message : "Không tải được giải.")
                      );
                    }}
                  >
                    <div style={styles.rowMain}>
                      <div>
                        <strong>{row.dayLabel}</strong>
                        <div style={{ marginTop: 4 }}>{row.name}</div>
                        <div style={styles.mute}>
                          {[
                            row.court,
                            row.plannedWhen ? "" : row.eventTime,
                            `VĐV ${row.checkInCount}`,
                            row.pendingCount > 0 ? `Chờ duyệt ${row.pendingCount}` : "",
                            `Voucher còn ${row.voucherOpenCount}`,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </div>
                      </div>
                      <div style={styles.statusStack}>
                        <span style={pillStyle(row.status)}>
                          {TOURNAMENT_STATUS_LABEL[row.status] || row.status}
                        </span>
                      </div>
                    </div>
                    {row.plannedWhen && row.movedWhen ? (
                      <DelayBand planned={row.plannedWhen} moved={row.movedWhen} />
                    ) : null}
                  </button>
                ))
              )}
            </div>
          </>
        ) : (
          <div style={{ marginTop: 18, display: "grid", gap: 18 }}>
            <div style={styles.statusStack}>
              <span style={pillStyle(detail.status)}>
                {TOURNAMENT_STATUS_LABEL[detail.status] || detail.status}
              </span>
            </div>
            {detail.plannedWhen && detail.movedWhen ? (
              <DelayBand planned={detail.plannedWhen} moved={detail.movedWhen} />
            ) : null}
            <div style={styles.statusRow}>
              <button
                type="button"
                onClick={() => setAthletesOpen((open) => !open)}
                style={{
                  ...styles.pillBtn,
                  ...(pendingHere > 0
                    ? {
                        background: "#ffedd5",
                        color: "#9a3412",
                        border: "1px solid #fdba74",
                      }
                    : athletesOpen
                      ? {
                          background: "#dcfce7",
                          color: "#166534",
                          border: "1px solid #86efac",
                        }
                      : {}),
                }}
              >
                Vận động viên · {detail.athletes.length}
                {pendingHere > 0 ? ` · chờ duyệt ${pendingHere}` : ""}
              </button>
            </div>

            {athletesOpen ? (
              <AthletePanel
                athletes={detail.athletes}
                ended={new Date(detail.endsAt).getTime() <= Date.now()}
                reviewId={reviewId}
                onReview={(checkInId, decision) =>
                  void reviewAthlete(detail.id, checkInId, decision)
                }
                onClose={() => setAthletesOpen(false)}
              />
            ) : (
            <>
            <form onSubmit={saveTournament} style={styles.form}>
              <label style={styles.label}>
                Tên giải
                <input style={{ ...styles.input, ...styles.locked }} value={name} readOnly />
              </label>
              <label style={styles.label}>
                Ngày giải
                <input
                  style={styles.input}
                  type="date"
                  value={day}
                  onChange={(e) => setDay(e.target.value)}
                />
              </label>
              <PlaceAndTime
                court={court}
                eventTime={eventTime}
                onCourt={setCourt}
                onTime={setEventTime}
              />
              <NoteField value={summary} onChange={setSummary} locked />
              <VoucherAmount value={discount} onChange={setDiscount} locked />
              <button type="submit" style={styles.btn} disabled={busy}>
                Lưu
              </button>
            </form>

            <section style={styles.band}>
              <h2 style={styles.h2}>Check-in</h2>
              <div style={styles.split}>
                <div>
                  {qrUrl ? (
                    <img
                      src={qrUrl}
                      alt="QR check-in giải đấu"
                      width={180}
                      height={180}
                      style={{ display: "block", borderRadius: 12 }}
                    />
                  ) : (
                    <p style={styles.mute}>Đang tạo mã…</p>
                  )}
                  <p style={{ ...styles.mute, wordBreak: "break-all" }}>{detail.checkInUrl}</p>
                  <button type="button" style={styles.ghost} onClick={printQr} disabled={!qrUrl}>
                    In mã
                  </button>
                </div>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void saveAthlete("check-in");
                  }}
                  style={styles.form}
                >
                  <label style={styles.label}>
                    Số điện thoại
                    <input
                      style={styles.input}
                      value={phone}
                      onChange={(e) => {
                        setPhone(e.target.value);
                        setCustomerId("");
                      }}
                      placeholder="09…"
                      disabled={ended}
                    />
                  </label>
                  {hits.length > 0 ? (
                    <div style={styles.hits}>
                      {hits.map((hit) => (
                        <button
                          key={hit.id}
                          type="button"
                          style={styles.hit}
                          onClick={() => {
                            setCustomerId(hit.id);
                            setPhone(hit.phone || phone);
                            setAthleteName(hit.fullName || "");
                            setHits([]);
                          }}
                        >
                          {hit.fullName || "Khách"} · {hit.phone}
                        </button>
                      ))}
                    </div>
                  ) : null}
                  <label style={styles.label}>
                    Tên vận động viên
                    <input
                      style={styles.input}
                      value={athleteName}
                      onChange={(e) => setAthleteName(e.target.value)}
                      placeholder="Bắt buộc nếu chưa có tài khoản"
                      disabled={ended}
                    />
                  </label>
                  <div style={styles.statusRow}>
                    <button
                      type="button"
                      style={styles.ghost}
                      disabled={busy || !canRegister}
                      onClick={() => void saveAthlete("register")}
                    >
                      Đăng ký
                    </button>
                    <button type="submit" style={styles.btn} disabled={busy || !openToday}>
                      Check-in tay
                    </button>
                  </div>
                  {detail?.status === "LIVE" ? (
                    <p style={styles.mute}>Giải đang diễn ra, không nhận đăng ký.</p>
                  ) : ended ? (
                    <p style={styles.mute}>Đã hết ngày giải.</p>
                  ) : openToday ? null : (
                    <p style={styles.mute}>Check-in chỉ mở trong ngày giải.</p>
                  )}
                </form>
              </div>
            </section>

            <section style={styles.band}>
              <h2 style={styles.h2}>Kết quả</h2>
              <p style={styles.mute}>
                Một ảnh bảng tổng. Ảnh trận đấu để link Drive hoặc Facebook.
              </p>
              {detail.resultsImage ? (
                <img
                  src={detail.resultsImage}
                  alt="Bảng kết quả"
                  style={{ maxWidth: "100%", borderRadius: 12, marginTop: 10 }}
                />
              ) : null}
              <div style={{ ...styles.split, marginTop: 10 }}>
                <label style={styles.btn}>
                  {detail.resultsImage ? "Đổi ảnh bảng tổng" : "Tải ảnh bảng tổng"}
                  <input
                    type="file"
                    accept="image/*"
                    hidden
                    onChange={(e) => {
                      const file = e.target.files?.[0] || null;
                      e.target.value = "";
                      void onResultsFile(file);
                    }}
                  />
                </label>
                {detail.resultsImage ? (
                  <button type="button" style={styles.ghost} onClick={() => void clearResults()}>
                    Gỡ ảnh
                  </button>
                ) : null}
              </div>
              <label style={{ ...styles.label, marginTop: 12 }}>
                Link ảnh (Drive / Facebook)
                <input
                  style={styles.input}
                  value={gallery}
                  onChange={(e) => setGallery(e.target.value)}
                  placeholder="https://"
                />
                <span style={styles.mute}>
                  Vận động viên thấy link này khi quét QR check-in.
                </span>
              </label>
              <button
                type="button"
                style={{ ...styles.btn, marginTop: 8 }}
                disabled={busy}
                onClick={() => void saveTournament()}
              >
                Lưu link ảnh
              </button>
            </section>

            {detail.athletes.length === 0 ? (
              <button type="button" style={styles.danger} disabled={busy} onClick={() => void removeTournament()}>
                Xoá giải
              </button>
            ) : null}
            </>
            )}
          </div>
        )}
      </div>
    </main>
  );
}

function AthletePanel({
  athletes,
  ended,
  reviewId,
  onReview,
  onClose,
}: {
  athletes: Athlete[];
  ended: boolean;
  reviewId: string;
  onReview: (checkInId: string, decision: "approve" | "reject") => void;
  onClose: () => void;
}) {
  let waiting = 0;
  for (const athlete of athletes) {
    if (athlete.attendance === ATTENDANCE.PENDING) waiting += 1;
  }
  const ordered =
    waiting > 0
      ? [...athletes].sort(
          (a, b) =>
            Number(b.attendance === ATTENDANCE.PENDING) -
            Number(a.attendance === ATTENDANCE.PENDING)
        )
      : athletes;
  return (
    <section>
      <div style={styles.top}>
        <div>
          <h2 style={styles.h2}>Vận động viên</h2>
          <p style={styles.athleteMeta}>
            {athletes.length === 0
              ? "Chưa có vận động viên."
              : waiting > 0
                ? `${athletes.length} người · ${waiting} chờ duyệt. Gọi SĐT, thu tiền, rồi bấm Duyệt.`
                : `${athletes.length} người`}
          </p>
        </div>
        <button type="button" style={styles.ghost} onClick={onClose}>
          ← Giải
        </button>
      </div>
      <div style={{ ...styles.athleteList, marginTop: 14 }}>
        {ordered.length === 0 ? (
          <p style={styles.athleteCard}>Chưa có vận động viên.</p>
        ) : (
          ordered.map((a) => {
            const detailText = athleteDetail(a);
            return (
            <article key={a.id} style={styles.athleteCard}>
              <div>
                <strong style={styles.athleteName}>{a.fullName}</strong>
                <p style={styles.athleteMeta}>
                  {a.phone ? (
                    <a href={`tel:${a.phone.replace(/\s/g, "")}`} style={{ color: "inherit" }}>
                      {a.phone}
                    </a>
                  ) : (
                    "—"
                  )}
                  {detailText ? ` · ${detailText}` : ""}
                </p>
              </div>
              <div style={{ display: "grid", justifyItems: "end", gap: 8 }}>
                <span style={{ ...styles.badge, ...attendanceStyle(a.attendance) }}>
                  {ATTENDANCE_LABEL[a.attendance] || a.attendance}
                </span>
                {a.attendance === ATTENDANCE.PENDING ? (
                  <div style={{ display: "flex", gap: 6 }}>
                    <button
                      type="button"
                      style={styles.btn}
                      disabled={!!reviewId || ended}
                      onClick={() => onReview(a.id, "approve")}
                    >
                      {reviewId === a.id ? "…" : "Duyệt"}
                    </button>
                    <button
                      type="button"
                      style={styles.ghost}
                      disabled={!!reviewId}
                      onClick={() => onReview(a.id, "reject")}
                    >
                      Từ chối
                    </button>
                  </div>
                ) : null}
              </div>
            </article>
            );
          })
        )}
      </div>
    </section>
  );
}

function FilterGroup<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { id: T; label: string }[];
  onChange: (id: T) => void;
}) {
  return (
    <div>
      <p style={styles.filterLabel}>{label}</p>
      <div style={styles.filterOptions}>
        {options.map((option) => {
          const on = option.id === value;
          return (
            <button
              key={option.id}
              type="button"
              className="desk-filter-option"
              aria-pressed={on}
              onClick={() => onChange(option.id)}
              style={{
                ...styles.filterOption,
                ...(on ? styles.filterOptionOn : {}),
              }}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function PlaceAndTime({
  court,
  eventTime,
  onCourt,
  onTime,
}: {
  court: string;
  eventTime: string;
  onCourt: (next: string) => void;
  onTime: (next: string) => void;
}) {
  return (
    <div style={styles.split}>
      <label style={styles.label}>
        Sân
        <input
          style={styles.input}
          value={court}
          onChange={(e) => onCourt(e.target.value)}
          placeholder="Sân 1"
        />
      </label>
      <label style={styles.label}>
        Giờ
        <input
          style={styles.input}
          type="time"
          value={eventTime}
          onChange={(e) => onTime(e.target.value)}
        />
      </label>
    </div>
  );
}

function NoteField({
  value,
  onChange,
  locked = false,
}: {
  value: string;
  onChange: (next: string) => void;
  locked?: boolean;
}) {
  return (
    <label style={styles.label}>
      Ghi chú
      <input
        style={locked ? { ...styles.input, ...styles.locked } : styles.input}
        value={value}
        readOnly={locked}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Ghi chú ngắn"
      />
    </label>
  );
}

function VoucherAmount({
  value,
  onChange,
  locked = false,
}: {
  value: string;
  onChange: (next: string) => void;
  locked?: boolean;
}) {
  return (
    <label style={styles.label}>
      Voucher (đ)
      <input
        style={locked ? { ...styles.input, ...styles.locked } : styles.input}
        inputMode="numeric"
        value={value}
        readOnly={locked}
        onChange={(e) => {
          const digits = e.target.value.replace(/\D/g, "");
          onChange(digits ? formatVndInput(Number(digits)) : "");
        }}
      />
      <span style={styles.mute}>
        Phát một lần. Vận động viên dùng một lần, tại Mía Ơi, Olympic, Spa hoặc Lòng Nướng. Nhập 0 nếu không tặng voucher.
      </span>
    </label>
  );
}

function attendanceStyle(status: string): React.CSSProperties {
  if (status === ATTENDANCE.CANCELLED) {
    return { background: "#fee2e2", color: "#991b1b", borderColor: "#fecaca" };
  }
  if (status === ATTENDANCE.NO_SHOW) {
    return { background: "#fef3c7", color: "#92400e", borderColor: "#fde68a" };
  }
  if (status === ATTENDANCE.PENDING) {
    return { background: "#ffedd5", color: "#9a3412", borderColor: "#fdba74" };
  }
  if (status === ATTENDANCE.REGISTERED) {
    return { background: "#e0f2fe", color: "#075985", borderColor: "#bae6fd" };
  }
  return { background: "#dcfce7", color: "#166534", borderColor: "#86efac" };
}

const TOURNAMENT_MOTION_CSS = `
@keyframes desk-filter-in {
  from { opacity: 0; transform: translateY(-6px) scale(0.98); }
  to { opacity: 1; transform: none; }
}
@keyframes desk-filter-out {
  from { opacity: 1; transform: none; }
  to { opacity: 0; transform: translateY(-4px) scale(0.98); }
}
@keyframes desk-row-in {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: none; }
}
.desk-filter-menu {
  transform-origin: top right;
  animation: desk-filter-in 180ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
}
.desk-filter-menu.is-closing {
  animation: desk-filter-out 160ms ease both;
  pointer-events: none;
}
.desk-filter-caret {
  display: inline-block;
  margin-left: 8px;
  transition: transform 180ms ease;
}
.desk-filter-caret.is-open {
  transform: rotate(180deg);
}
.desk-filter-option {
  transition: background 160ms ease, color 160ms ease, border-color 160ms ease, transform 160ms ease;
}
.desk-filter-option:active {
  transform: scale(0.96);
}
.desk-tournament-row {
  animation: desk-row-in 240ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
}
.desk-tournament-row:hover {
  box-shadow: 0 8px 18px rgba(15, 23, 42, 0.06);
  border-color: #cbd5e1;
}
.desk-tournament-note {
  animation: desk-row-in 220ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
}
@media (prefers-reduced-motion: reduce) {
  .desk-filter-menu,
  .desk-filter-menu.is-closing,
  .desk-tournament-row,
  .desk-tournament-note,
  .desk-filter-caret,
  .desk-filter-option {
    animation: none;
    transition: none;
  }
}
`;

function pillStyle(status: string): React.CSSProperties {
  const tone =
    status === "LIVE"
      ? { background: "#dcfce7", color: "#166534", border: "1px solid #86efac" }
      : status === "ENDED"
        ? { background: "#e2e8f0", color: "#334155", border: "1px solid #cbd5e1" }
        : { background: "#fef9c3", color: "#854d0e", border: "1px solid #fde68a" };
  return {
    flex: "0 0 auto",
    fontSize: 12,
    fontWeight: 800,
    borderRadius: 999,
    padding: "6px 10px",
    ...tone,
  };
}

const styles = {
  page: {
    minHeight: "100dvh",
    background: "#f1f5f9",
    padding: "20px 16px 48px",
    fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
  } as const,
  card: {
    maxWidth: 880,
    margin: "0 auto",
    background: "#fff",
    borderRadius: 20,
    padding: 20,
    boxShadow: "0 8px 30px rgba(15,23,42,.06)",
  } as const,
  top: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "flex-start",
    flexWrap: "wrap" as const,
  },
  h1: { margin: 0, fontSize: 26, fontWeight: 800, color: "#0f172a" } as const,
  h2: { margin: 0, fontSize: 16, fontWeight: 800 } as const,
  mute: { margin: "6px 0 0", fontSize: 13, fontWeight: 500, color: "#64748b" } as const,
  eyebrow: {
    margin: 0,
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.14em",
    textTransform: "uppercase" as const,
    color: "#b45309",
  },
  actions: { display: "flex", gap: 8, flexWrap: "wrap" as const },
  input: {
    height: 44,
    borderRadius: 12,
    border: "1px solid #e2e8f0",
    padding: "0 12px",
    fontSize: 14,
    width: "100%",
    boxSizing: "border-box" as const,
  },
  locked: {
    background: "#f8fafc",
    color: "#64748b",
  } as const,
  label: {
    display: "grid",
    gap: 6,
    fontSize: 13,
    fontWeight: 700,
    color: "#334155",
  } as const,
  btn: {
    height: 44,
    borderRadius: 12,
    border: "none",
    background: "#14532d",
    color: "#fff",
    fontWeight: 800,
    padding: "0 16px",
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
  } as const,
  ghost: {
    height: 40,
    borderRadius: 12,
    border: "1px solid #cbd5e1",
    background: "#fff",
    fontWeight: 700,
    padding: "0 12px",
    cursor: "pointer",
  } as const,
  filterBackdrop: {
    position: "fixed" as const,
    inset: 0,
    zIndex: 20,
    border: 0,
    padding: 0,
    background: "transparent",
    cursor: "default",
  },
  filterMenu: {
    position: "absolute" as const,
    right: 0,
    top: 46,
    zIndex: 21,
    width: 280,
    display: "grid",
    gap: 12,
    padding: 12,
    borderRadius: 16,
    border: "1px solid #e2e8f0",
    background: "#fff",
    boxShadow: "0 16px 40px rgba(15,23,42,.12)",
  },
  filterLabel: {
    margin: "0 0 6px",
    fontSize: 11,
    fontWeight: 800,
    letterSpacing: "0.08em",
    textTransform: "uppercase" as const,
    color: "#94a3b8",
  },
  filterOptions: {
    display: "flex",
    flexWrap: "wrap" as const,
    gap: 6,
  },
  filterOption: {
    height: 30,
    padding: "0 10px",
    borderRadius: 999,
    border: "1px solid #e2e8f0",
    background: "#f8fafc",
    color: "#334155",
    fontSize: 12,
    fontWeight: 700,
    cursor: "pointer",
    transition: "background 160ms ease, color 160ms ease, border-color 160ms ease",
  } as const,
  filterOptionOn: {
    background: "#0f172a",
    color: "#fff",
    border: "1px solid #0f172a",
  } as const,
  filterClear: {
    height: 32,
    borderRadius: 10,
    border: "1px solid #e2e8f0",
    background: "#fff",
    color: "#64748b",
    fontSize: 12,
    fontWeight: 800,
    cursor: "pointer",
  } as const,
  danger: {
    height: 40,
    borderRadius: 12,
    border: "1px solid #fecaca",
    background: "#fef2f2",
    color: "#b91c1c",
    fontWeight: 700,
    cursor: "pointer",
  } as const,
  form: { display: "grid", gap: 10, marginTop: 12 } as const,
  split: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 12,
    alignItems: "start",
  } as const,
  list: { display: "grid", gap: 10, marginTop: 16 } as const,
  row: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "center",
    textAlign: "left" as const,
    border: "1px solid #e2e8f0",
    background: "#f8fafc",
    borderRadius: 14,
    padding: "12px 14px",
    cursor: "pointer",
    width: "100%",
    transition: "box-shadow 180ms ease, border-color 180ms ease",
  },
  statusRow: { display: "flex", gap: 8, flexWrap: "wrap" as const },
  statusStack: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap" as const,
    justifyContent: "flex-end",
  },
  rowMain: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "center",
    width: "100%",
  } as const,
  delayBand: {
    display: "grid",
    gridTemplateColumns: "1fr auto 1fr",
    gap: 10,
    alignItems: "center",
    marginTop: 10,
    padding: "10px 12px",
    borderRadius: 12,
    background: "#fff7ed",
    border: "1px solid #fdba74",
    width: "100%",
  } as const,
  delayKicker: {
    fontSize: 10,
    fontWeight: 800,
    letterSpacing: "0.06em",
    textTransform: "uppercase" as const,
    color: "#9a3412",
  } as const,
  delayOld: {
    marginTop: 2,
    fontSize: 13,
    fontWeight: 700,
    color: "#9a3412",
    textDecoration: "line-through",
  } as const,
  delayNew: {
    marginTop: 2,
    fontSize: 14,
    fontWeight: 800,
    color: "#7c2d12",
  } as const,
  delayArrow: {
    fontSize: 18,
    fontWeight: 800,
    color: "#c2410c",
  } as const,
  athleteList: { display: "grid", gap: 8 } as const,
  athleteCard: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 16,
    background: "#fff",
    border: "1px solid #e2e8f0",
    borderRadius: 16,
    padding: "14px 16px",
  } as const,
  athleteName: {
    display: "block",
    fontSize: 15,
    fontWeight: 800,
    color: "#0f172a",
  } as const,
  athleteMeta: {
    margin: "3px 0 0",
    fontSize: 13,
    fontWeight: 500,
    color: "#64748b",
  } as const,
  notice: {
    marginTop: 16,
    padding: "12px 14px",
    borderRadius: 14,
    background: "#fff7ed",
    color: "#9a3412",
    display: "grid",
    gap: 10,
    fontSize: 14,
    lineHeight: 1.45,
  } as const,
  noticeRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    background: "#fff",
    color: "#0f172a",
    borderRadius: 12,
    padding: "10px 12px",
  } as const,
  noticeMeta: {
    marginTop: 2,
    fontSize: 13,
    color: "#9a3412",
    fontWeight: 600,
  } as const,
  pillBtn: {
    height: 36,
    borderRadius: 999,
    border: "1px solid #e2e8f0",
    background: "#fff",
    padding: "0 12px",
    fontWeight: 800,
    cursor: "pointer",
  } as const,
  band: {
    border: "1px solid #e2e8f0",
    borderRadius: 16,
    padding: 14,
    background: "#f8fafc",
  } as const,
  badge: {
    flex: "0 0 auto",
    fontSize: 12,
    fontWeight: 800,
    background: "#fff",
    border: "1px solid #e2e8f0",
    borderRadius: 999,
    padding: "6px 10px",
    cursor: "default",
  } as const,
  hits: { display: "grid", gap: 6 } as const,
  hit: {
    textAlign: "left" as const,
    border: "1px solid #e2e8f0",
    background: "#fff",
    borderRadius: 10,
    padding: "8px 10px",
    cursor: "pointer",
  },
  err: {
    margin: "12px 0 0",
    color: "#b91c1c",
    background: "#fef2f2",
    borderRadius: 10,
    padding: 10,
    fontSize: 14,
  } as const,
  ok: {
    margin: "12px 0 0",
    color: "#166534",
    background: "#f0fdf4",
    borderRadius: 10,
    padding: 10,
    fontSize: 14,
  } as const,
};
