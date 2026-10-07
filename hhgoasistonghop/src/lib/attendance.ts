import { daysUntil } from "@/lib/utils";

export type DaySegment = {
  date: string;
  label: string;
  status: "present" | "absent" | "future";
  times: string[];
};

export type AttendanceVisit = {
  visitDate: Date;
  checkInAt: Date;
  membershipId?: string | null;
  note?: string | null;
  usages?: { service: { name: string } }[];
};

export function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function toDateKey(d: Date) {
  const x = startOfDay(d);
  const y = x.getFullYear();
  const m = String(x.getMonth() + 1).padStart(2, "0");
  const day = String(x.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function formatTimeVi(d: Date) {
  return d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
}

export function formatVisitLabel(v: AttendanceVisit) {
  const time = formatTimeVi(v.checkInAt);
  const services = (v.usages || [])
    .map((u) => u.service.name)
    .filter(Boolean);
  return services.length > 0 ? `${time} · ${services.join(", ")}` : time;
}

export function visitBelongsToMembership(
  v: AttendanceVisit,
  membership: { id: string; membershipCode: string }
) {
  if (v.membershipId) return v.membershipId === membership.id;
  const note = v.note || "";
  return note.includes(`Check-in gói ${membership.membershipCode}`);
}

/** Chỉ các lần check-in của đúng gói — không lẫn sang membership khác */
export function visitsByDateForMembership(
  visits: AttendanceVisit[],
  membership: { id: string; membershipCode: string }
) {
  const map = new Map<string, string[]>();
  for (const v of visits) {
    if (!visitBelongsToMembership(v, membership)) continue;
    const key = toDateKey(v.visitDate);
    const list = map.get(key) || [];
    list.push(formatVisitLabel(v));
    map.set(key, list);
  }
  return map;
}

export function buildDaySegments(
  startDate: Date,
  expiryDate: Date,
  visitsByDate: Map<string, string[]>
) {
  const today = startOfDay(new Date());
  const start = startOfDay(startDate);
  const end = startOfDay(expiryDate);
  const totalDays = Math.max(
    1,
    Math.round((end.getTime() - start.getTime()) / 86400000) || 30
  );

  const days: DaySegment[] = [];

  for (let i = 0; i < totalDays; i++) {
    const day = new Date(start);
    day.setDate(start.getDate() + i);
    const key = toDateKey(day);
    const times = visitsByDate.get(key) || [];

    let status: DaySegment["status"];
    if (day.getTime() > today.getTime()) status = "future";
    else if (times.length > 0) status = "present";
    else status = "absent";

    days.push({
      date: key,
      label: day.toLocaleDateString("vi-VN"),
      status,
      times,
    });
  }

  const pastOrToday = days.filter((d) => d.status !== "future");
  const attendedCount = pastOrToday.filter((d) => d.status === "present").length;
  const todayKey = toDateKey(today);
  const todayVisits = visitsByDate.get(todayKey) || [];
  const checkInCountToday = todayVisits.length;
  const checkedInToday = checkInCountToday > 0;

  return {
    totalDays,
    days,
    attendedCount,
    remainingDays: Math.max(0, daysUntil(expiryDate) ?? 0),
    checkedInToday,
    checkInCountToday,
  };
}
