"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { packageIdFromVipPlanLabel, vouchersClaimableAtZone } from "@/lib/hhg-vouchers";
import { monthPackageFilters } from "@/lib/olympic-pool-menu";
import { SWIM_PACKAGES, swimBonusExpiresAt } from "@/lib/swim-packages";

type Sector = "vip" | "swim" | "spa" | "grill" | "tournament" | "checkin";

type Subscriber = {
  id: string;
  fullName: string;
  phone: string;
  planLabel: string;
  staffName: string | null;
  startedAt: string | null;
  expiresAt: string | null;
};

type SwimStudent = {
  id: string;
  fullName: string;
  phone: string | null;
  packageLabel: string;
  sessionsTotal: number;
  sessionsLeft: number;
  bonusVisitsTotal: number;
  bonusVisitsLeft: number;
  createdByName: string | null;
  startedAt: string | null;
  expiresAt: string | null;
};

type BonusLog = {
  id: string;
  purpose: string;
  usedAt: string;
};

type CheckinPhone = {
  id: string;
  fullName: string;
  phone: string;
  lastAt: string;
  zone: string;
  visits: number;
};

type RedeemedVoucher = {
  id: string;
  at: string;
  offerTitle: string | null;
  tournamentName?: string | null;
  placeLabel?: string | null;
  phone: string | null;
  customerName: string | null;
  claimedByName: string | null;
};

const TOURNAMENT_PLACES: FilterChoice[] = [
  { id: "MIA_OI", label: "Mía Ơi" },
  { id: "OLYMPIC_POOL", label: "Olympic" },
  { id: "SPA", label: "Spa" },
  { id: "LONG_NUONG", label: "Lòng Nướng" },
];

const REDEEM_ZONE: Record<"spa" | "grill", string> = {
  spa: "SAUNA",
  grill: "LONG_NUONG",
};

function formatWhen(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Ho_Chi_Minh",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(d);
  const pick = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value || "";
  return `${pick("day")}/${pick("month")}/${pick("year")} ${pick("hour")}:${pick("minute")}`;
}

function sessionsLabel(row: SwimStudent) {
  if (row.sessionsTotal > 0) return `${row.sessionsLeft}/${row.sessionsTotal}`;
  return "Theo tháng";
}

function bonusLabel(row: SwimStudent) {
  if (row.bonusVisitsTotal <= 0) return "—";
  const count = `${row.bonusVisitsLeft}/${row.bonusVisitsTotal}`;
  if (!row.startedAt) return count;
  const until = swimBonusExpiresAt(new Date(row.startedAt));
  if (Number.isNaN(until.getTime())) return count;
  return `${count} · đến ${formatWhen(until.toISOString())}`;
}

type AdminSort =
  | "time-desc"
  | "time-asc"
  | "expires-desc"
  | "expires-asc"
  | "staff"
  | "name"
  | "phone"
  | "plan"
  | "sessions"
  | "bonus"
  | "visits";

function sortsFor(sector: Sector): { id: AdminSort; label: string }[] {
  const newest = sector === "checkin" ? "Check-in mới" : "Mới nhất";
  const oldest = sector === "checkin" ? "Check-in cũ" : "Cũ nhất";
  const people: { id: AdminSort; label: string }[] = [
    { id: "name", label: "Họ tên" },
    ...(sector === "checkin"
      ? []
      : [{ id: "staff" as const, label: "Nhân viên đứng ca" }]),
    { id: "phone", label: "Số điện thoại" },
  ];
  const time: { id: AdminSort; label: string }[] = [
    { id: "time-desc", label: newest },
    { id: "time-asc", label: oldest },
  ];
  if (sector === "vip" || sector === "swim") {
    return [
      ...time,
      { id: "expires-desc", label: "Hết hạn gần" },
      { id: "expires-asc", label: "Hết hạn xa" },
      ...people,
      { id: "plan", label: "Gói" },
      ...(sector === "swim"
        ? [
            { id: "sessions" as const, label: "Buổi" },
            { id: "bonus" as const, label: "Lượt tự chọn" },
          ]
        : []),
    ];
  }
  if (sector === "checkin") {
    return [
      ...time,
      ...people,
      { id: "plan", label: "Khu" },
      { id: "visits", label: "Số lần" },
    ];
  }
  return [...time, ...people, { id: "plan", label: "Voucher" }];
}

const SORT_GROUP: Record<AdminSort, string> = {
  "time-desc": "time",
  "time-asc": "time",
  "expires-desc": "expires",
  "expires-asc": "expires",
  staff: "staff",
  name: "name",
  phone: "phone",
  plan: "plan",
  sessions: "sessions",
  bonus: "bonus",
  visits: "visits",
};

type FieldId =
  | "name"
  | "staff"
  | "phone"
  | "started"
  | "expires"
  | "plan"
  | "sessions"
  | "bonus";

const EMPTY_FIELD_QUERY: Record<FieldId, string> = {
  name: "",
  staff: "",
  phone: "",
  started: "",
  expires: "",
  plan: "",
  sessions: "",
  bonus: "",
};

function fieldChoicesFor(sector: Sector) {
  const started =
    sector === "vip" || sector === "swim"
      ? "Ngày đăng ký"
      : sector === "checkin"
        ? "Check-in"
        : "Thời điểm";
  const list: { id: FieldId; label: string }[] = [
    { id: "name", label: "Họ tên" },
    ...(sector === "checkin"
      ? []
      : [{ id: "staff" as const, label: "Nhân viên đứng ca" }]),
    { id: "phone", label: "Số điện thoại" },
    { id: "started", label: started },
  ];
  if (sector === "vip" || sector === "swim") {
    list.push({ id: "expires", label: "Hết hạn" }, { id: "plan", label: "Gói" });
  } else if (sector === "checkin") {
    list.push({ id: "plan", label: "Khu" });
  } else {
    list.push({ id: "plan", label: "Voucher" });
  }
  if (sector === "swim") {
    list.push(
      { id: "sessions", label: "Buổi" },
      { id: "bonus", label: "Lượt tự chọn" }
    );
  }
  return list;
}

function fieldPlaceholder(id: FieldId) {
  if (id === "name") return "Tìm tên khách";
  if (id === "staff") return "Tìm nhân viên";
  if (id === "phone") return "Tìm số điện thoại";
  if (id === "plan") return "Tìm gói, khu hoặc voucher";
  if (id === "sessions") return "vd. 8/12";
  if (id === "bonus") return "vd. 2/4";
  if (id === "expires") return "vd. 10/03/2028";
  return "vd. 10/01/2027";
}

type FilterChoice = { id: string; label: string };

const MONTH_PACKAGES = monthPackageFilters();
const MONTH_LABEL = new Map(MONTH_PACKAGES.map((item) => [item.id, item.label]));
const MONTH_ID_BY_LABEL = new Map(MONTH_PACKAGES.map((item) => [item.label, item.id]));

const SWIM_PACKAGE_FILTERS: FilterChoice[] = SWIM_PACKAGES.map((pkg) => ({
  id: pkg.id,
  label: `${pkg.programLabel} · ${pkg.name}`,
}));

/** Menu name, or the older "Gói Olympic …" label for the same month package. */
function vipPackageIdForPlan(planLabel: string) {
  const label = planLabel.trim();
  const exact = MONTH_ID_BY_LABEL.get(label);
  if (exact) return exact;
  if (/vip/i.test(label)) return null;
  const id = packageIdFromVipPlanLabel(label);
  return id && MONTH_LABEL.has(id) ? id : null;
}

function displayPlanLabel(planLabel: string) {
  const id = vipPackageIdForPlan(planLabel);
  return (id && MONTH_LABEL.get(id)) || planLabel;
}

function withExtras(
  catalog: FilterChoice[],
  labels: string[],
  covered: (label: string) => boolean
) {
  const seen = new Set<string>();
  const extras: FilterChoice[] = [];
  for (const raw of labels) {
    const label = raw.trim();
    if (!label || seen.has(label) || covered(label)) continue;
    seen.add(label);
    extras.push({ id: `raw:${label}`, label });
  }
  extras.sort((a, b) => a.label.localeCompare(b.label, "vi"));
  return [...catalog, ...extras];
}

function labelSelected(label: string, selectedId: string, catalog: FilterChoice[]) {
  if (!selectedId) return true;
  const text = label.trim();
  if (selectedId.startsWith("raw:")) return text === selectedId.slice(4);
  return catalog.find((item) => item.id === selectedId)?.label === text;
}

function planSelected(planLabel: string, selectedId: string) {
  if (!selectedId) return true;
  if (selectedId.startsWith("raw:")) return planLabel.trim() === selectedId.slice(4);
  return vipPackageIdForPlan(planLabel) === selectedId;
}

function foldVi(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase();
}

function toggleAdminSort(current: AdminSort[], next: AdminSort) {
  const group = SORT_GROUP[next];
  const without = current.filter((id) => SORT_GROUP[id] !== group);
  if (current[0] === next) {
    return without.length ? without : current;
  }
  return [next, ...without.filter((id) => id !== next)];
}

type Sortable = {
  id: string;
  name: string;
  at: string | null;
  staff: string | null;
  phone?: string | null;
  expiresAt?: string | null;
  plan?: string | null;
  sessions?: string | null;
  bonus?: string | null;
  visits?: number;
};

function textSort(a: string | null | undefined, b: string | null | undefined) {
  return (a || "").localeCompare(b || "", "vi");
}

function compareListed(a: Sortable, b: Sortable, sort: AdminSort) {
  if (sort === "name") return textSort(a.name, b.name);
  if (sort === "staff") return textSort(a.staff, b.staff);
  if (sort === "phone") {
    const pa = (a.phone || "").replace(/\D/g, "");
    const pb = (b.phone || "").replace(/\D/g, "");
    if (!pa && !pb) return 0;
    if (!pa) return 1;
    if (!pb) return -1;
    return pa.localeCompare(pb);
  }
  if (sort === "plan") return textSort(a.plan, b.plan);
  if (sort === "sessions") return textSort(a.sessions, b.sessions);
  if (sort === "bonus") return textSort(a.bonus, b.bonus);
  if (sort === "visits") return (a.visits || 0) - (b.visits || 0);
  const key = sort.startsWith("expires") ? "expiresAt" : "at";
  const ta = a[key] ? new Date(a[key] as string).getTime() : 0;
  const tb = b[key] ? new Date(b[key] as string).getTime() : 0;
  return sort.endsWith("asc") ? ta - tb : tb - ta;
}

function CheckinPhoneCell({
  customerId,
  phone,
  onSaved,
}: {
  customerId: string;
  phone: string;
  onSaved: (phone: string) => void;
}) {
  const [value, setValue] = useState(phone);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  useEffect(() => setValue(phone), [phone]);

  async function save() {
    const next = value.trim();
    if (!next || next === phone) return;
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch("/api/crm/desk/checkin-phones", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ customerId, phone: next }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Không lưu được số.");
      const saved = String(data.phone || next);
      setValue(saved);
      onSaved(saved);
      setMsg("Đã lưu");
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Không lưu được số.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
      <input
        value={value}
        inputMode="tel"
        aria-label="Số điện thoại"
        placeholder="Nhập số để lưu"
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") void save();
        }}
        style={styles.phoneInput}
      />
      <button type="button" style={styles.logBtn} disabled={busy} onClick={() => void save()}>
        {busy ? "…" : "Lưu"}
      </button>
      {msg ? (
        <span style={{ fontSize: 12, color: msg === "Đã lưu" ? "#166534" : "#b91c1c" }}>
          {msg}
        </span>
      ) : null}
    </div>
  );
}

export function DeskVipSubscribers({
  onBack,
  onLogout,
}: {
  onBack: () => void;
  onLogout: () => void;
}) {
  const [sector, setSector] = useState<Sector>("vip");
  const [goi, setGoi] = useState("");
  const [sorts, setSorts] = useState<AdminSort[]>(["time-desc"]);
  const [fieldOn, setFieldOn] = useState<FieldId[]>([]);
  const [fieldQuery, setFieldQuery] =
    useState<Record<FieldId, string>>(EMPTY_FIELD_QUERY);
  const [menu, setMenu] = useState<null | "filter" | "fields" | "sort">(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [rows, setRows] = useState<Subscriber[] | null>(null);
  const [checkins, setCheckins] = useState<CheckinPhone[] | null>(null);
  const [students, setStudents] = useState<SwimStudent[] | null>(null);
  const [redeemed, setRedeemed] = useState<RedeemedVoucher[] | null>(null);
  const [error, setError] = useState("");
  const [logFor, setLogFor] = useState<{
    id: string;
    fullName: string;
    used: number;
    total: number;
  } | null>(null);
  const [logs, setLogs] = useState<BonusLog[] | null>(null);
  const [logError, setLogError] = useState("");
  const listReq = useRef(0);

  const loadVip = useCallback(async () => {
    setError("");
    const res = await fetch("/api/crm/desk/vip-subscribers", { cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 || res.status === 403) {
      setRows(null);
      setError(data.error || "Phiên đăng nhập đã hết. Chọn lại khu.");
      return;
    }
    if (!res.ok) {
      setError(data.error || "Không tải được danh sách.");
      return;
    }
    setRows(Array.isArray(data.subscribers) ? data.subscribers : []);
  }, []);

  const loadCheckins = useCallback(async () => {
    setError("");
    const res = await fetch("/api/crm/desk/checkin-phones", { cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 || res.status === 403) {
      setCheckins(null);
      setError(data.error || "Phiên đăng nhập đã hết. Chọn lại khu.");
      return;
    }
    if (!res.ok) {
      setError(data.error || "Không tải được số check-in.");
      return;
    }
    setCheckins(Array.isArray(data.phones) ? data.phones : []);
  }, []);

  function rememberPhone(id: string, phone: string) {
    setCheckins((prev) =>
      prev ? prev.map((row) => (row.id === id ? { ...row, phone } : row)) : prev
    );
    setRows((prev) =>
      prev ? prev.map((row) => (row.id === id ? { ...row, phone } : row)) : prev
    );
    setStudents((prev) =>
      prev ? prev.map((row) => (row.id === id ? { ...row, phone } : row)) : prev
    );
  }

  const loadSwim = useCallback(async () => {
    setError("");
    const res = await fetch("/api/crm/desk/swim-students?status=ALL", {
      cache: "no-store",
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 || res.status === 403) {
      setStudents(null);
      setError(data.error || "Phiên đăng nhập đã hết. Chọn lại khu.");
      return;
    }
    if (!res.ok) {
      setError(data.error || "Không tải được danh sách học viên.");
      return;
    }
    setStudents(Array.isArray(data.students) ? data.students : []);
  }, []);

  const loadRedeemed = useCallback(async (which: "spa" | "grill") => {
    const seq = ++listReq.current;
    setError("");
    setRedeemed(null);
    try {
      const zone = REDEEM_ZONE[which];
      const res = await fetch(
        `/api/crm/desk/offers?history=1&zone=${encodeURIComponent(zone)}`,
        { cache: "no-store" }
      );
      const data = await res.json().catch(() => ({}));
      if (seq !== listReq.current) return;
      if (res.status === 401 || res.status === 403) {
        setRedeemed(null);
        setError(data.error || "Phiên đăng nhập đã hết. Chọn lại khu.");
        return;
      }
      if (!res.ok) {
        setError(data.error || "Không tải được voucher đã đổi.");
        return;
      }
      setRedeemed(Array.isArray(data.logs) ? data.logs : []);
    } catch {
      if (seq !== listReq.current) return;
      setError("Không tải được voucher đã đổi.");
    }
  }, []);

  const loadTournament = useCallback(async () => {
    const seq = ++listReq.current;
    setError("");
    setRedeemed(null);
    try {
      const res = await fetch("/api/crm/desk/tournament-vouchers", {
        cache: "no-store",
      });
      const data = await res.json().catch(() => ({}));
      if (seq !== listReq.current) return;
      if (res.status === 401 || res.status === 403) {
        setRedeemed(null);
        setError(data.error || "Phiên đăng nhập đã hết. Chọn lại khu.");
        return;
      }
      if (!res.ok) {
        setError(data.error || "Không tải được voucher đã đổi.");
        return;
      }
      setRedeemed(Array.isArray(data.logs) ? data.logs : []);
    } catch {
      if (seq !== listReq.current) return;
      setError("Không tải được voucher đã đổi.");
    }
  }, []);

  useEffect(() => {
    setGoi("");
    setSorts(["time-desc"]);
    setFieldOn([]);
    setFieldQuery(EMPTY_FIELD_QUERY);
    setMenu(null);
  }, [sector]);

  useEffect(() => {
    if (!menu) return;
    function onDown(e: MouseEvent) {
      if (!menuRef.current?.contains(e.target as Node)) setMenu(null);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMenu(null);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menu]);

  useEffect(() => {
    if (sector !== "swim") setLogFor(null);
    if (sector === "vip") {
      void loadVip().catch(() => setError("Không tải được danh sách."));
    } else if (sector === "checkin") {
      void loadCheckins().catch(() => setError("Không tải được số check-in."));
    } else if (sector === "swim") {
      void loadSwim().catch(() => setError("Không tải được danh sách học viên."));
    } else if (sector === "tournament") {
      void loadTournament().catch(() => setError("Không tải được voucher đã đổi."));
    } else {
      void loadRedeemed(sector);
    }
  }, [sector, loadVip, loadCheckins, loadSwim, loadRedeemed, loadTournament]);

  async function openLog(person: SwimStudent) {
    setLogFor({
      id: person.id,
      fullName: person.fullName,
      used: Math.max(0, person.bonusVisitsTotal - person.bonusVisitsLeft),
      total: person.bonusVisitsTotal,
    });
    setLogs(null);
    setLogError("");
    const url = `/api/crm/desk/swim-bonus-log?studentId=${encodeURIComponent(person.id)}`;
    try {
      const res = await fetch(url, { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Không mở được nhật ký.");
      setLogs(Array.isArray(data.logs) ? data.logs : []);
    } catch (err) {
      setLogError(err instanceof Error ? err.message : "Không mở được nhật ký.");
    }
  }

  const packageChoices = useMemo(() => {
    if (sector === "vip") {
      return withExtras(
        MONTH_PACKAGES,
        (rows || []).map((row) => row.planLabel),
        (label) => vipPackageIdForPlan(label) != null
      );
    }
    if (sector === "swim") {
      const known = new Set(SWIM_PACKAGE_FILTERS.map((item) => item.label));
      return withExtras(
        SWIM_PACKAGE_FILTERS,
        (students || []).map((row) => row.packageLabel),
        (label) => known.has(label)
      );
    }
    if (sector === "tournament") {
      return withExtras(
        TOURNAMENT_PLACES,
        (redeemed || []).map((row) => row.placeLabel || ""),
        (label) => TOURNAMENT_PLACES.some((place) => place.label === label)
      );
    }
    if (sector === "checkin") {
      return withExtras(
        [],
        (checkins || []).map((row) => row.zone),
        () => false
      );
    }
    const zone = sector === "spa" ? "SAUNA" : "LONG_NUONG";
    const vouchers = vouchersClaimableAtZone(zone).map((voucher) => ({
      id: voucher.id,
      label: voucher.title,
    }));
    const known = new Set(vouchers.map((item) => item.label));
    return withExtras(
      vouchers,
      (redeemed || []).map((row) => row.offerTitle || "Voucher"),
      (label) => known.has(label)
    );
  }, [sector, rows, students, redeemed, checkins]);
  const selectedChoice = packageChoices.find((item) => item.id === goi) || null;
  const selectedGoi = selectedChoice?.id || "";
  const activeSorts: AdminSort[] = sorts.length ? sorts : ["time-desc"];
  const sortChoices = sortsFor(sector);
  const fieldChoices = fieldChoicesFor(sector);
  function matchesFields(row: {
    name: string;
    staff: string | null;
    phone?: string | null;
    at: string | null;
    expiresAt?: string | null;
    plan?: string | null;
    sessions?: string | null;
    bonus?: string | null;
  }) {
    const text: Record<FieldId, string> = {
      name: row.name,
      staff: row.staff || "",
      phone: row.phone || "",
      started: formatWhen(row.at),
      expires: formatWhen(row.expiresAt ?? null),
      plan: row.plan || "",
      sessions: row.sessions || "",
      bonus: row.bonus || "",
    };
    for (const id of fieldOn) {
      const q = fieldQuery[id].trim();
      if (!q) continue;
      if (id === "phone") {
        const digits = q.replace(/\D/g, "");
        if (digits) {
          if (!(row.phone || "").replace(/\D/g, "").includes(digits)) return false;
          continue;
        }
      }
      if (!foldVi(text[id]).includes(foldVi(q))) return false;
    }
    return true;
  }
  function ordered<T extends Sortable>(list: T[]) {
    const copy = [...list];
    copy.sort((a, b) => {
      for (const sort of activeSorts) {
        const diff = compareListed(a, b, sort);
        if (diff) return diff;
      }
      return a.id.localeCompare(b.id);
    });
    return copy;
  }
  const vipShown = ordered(
    (rows || [])
      .filter((row) => planSelected(row.planLabel, selectedGoi))
      .map((row) => ({
        ...row,
        name: row.fullName,
        at: row.startedAt,
        staff: row.staffName,
        phone: row.phone,
        expiresAt: row.expiresAt,
        plan: displayPlanLabel(row.planLabel),
      }))
      .filter((row) => matchesFields(row))
  );
  const swimShown = ordered(
    (students || [])
      .filter((row) => labelSelected(row.packageLabel, selectedGoi, SWIM_PACKAGE_FILTERS))
      .map((row) => ({
        ...row,
        name: row.fullName,
        at: row.startedAt,
        staff: row.createdByName,
        phone: row.phone,
        expiresAt: row.expiresAt,
        plan: row.packageLabel,
        sessions: sessionsLabel(row),
        bonus: bonusLabel(row),
      }))
      .filter((row) => matchesFields(row))
  );
  const checkinShown = ordered(
    (checkins || [])
      .filter((row) => labelSelected(row.zone, selectedGoi, packageChoices))
      .map((row) => ({
        ...row,
        name: row.fullName,
        at: row.lastAt,
        staff: null,
        phone: row.phone,
        plan: row.zone,
      }))
      .filter((row) => matchesFields(row))
  );
  const redeemedShown = ordered(
    (redeemed || [])
      .filter((row) =>
        labelSelected(
          sector === "tournament" ? row.placeLabel || "" : row.offerTitle || "Voucher",
          selectedGoi,
          packageChoices
        )
      )
      .map((row) => ({
        ...row,
        name: row.customerName || "Khách",
        at: row.at,
        staff: row.claimedByName,
        phone: row.phone,
        plan:
          sector === "tournament"
            ? [row.placeLabel, row.offerTitle, row.tournamentName]
                .filter(Boolean)
                .join(" · ") || "Voucher"
            : row.offerTitle || "Voucher",
      }))
      .filter((row) => matchesFields(row))
  );
  const searching = fieldOn.some((id) => fieldQuery[id].trim());
  const emptyFilter =
    searching
      ? "Không có khách cho bộ lọc này."
      : sector === "swim"
        ? "Không có học viên cho gói này."
        : sector === "vip"
          ? "Không có khách cho gói này."
          : sector === "checkin"
            ? "Không có số cho khu này."
          : sector === "tournament"
        ? "Không có lượt đổi tại khu này."
        : "Không có lượt đổi cho voucher này.";
  const sourceCount =
    sector === "vip"
      ? rows?.length || 0
      : sector === "checkin"
        ? checkins?.length || 0
      : sector === "swim"
        ? students?.length || 0
        : redeemed?.length || 0;
  const swimCount = swimShown.length;
  const vipCount = vipShown.length;
  const redeemedCount = redeemedShown.length;
  const checkinCount = checkinShown.length;
  const title =
    sector === "vip"
      ? "Khách đang dùng gói VIP"
      : sector === "checkin"
        ? "SĐT đã check-in"
      : sector === "swim"
        ? "Khách học bơi"
        : sector === "spa"
          ? "Voucher Spa đã đổi"
          : sector === "grill"
            ? "Voucher Lòng Nướng đã đổi"
            : "Voucher giải đấu đã đổi";
  const subtitle =
    sector === "vip"
      ? rows
        ? `${vipCount} khách còn hạn`
        : "Tên, số điện thoại, ngày đăng ký, gói và ngày hết hạn."
      : sector === "checkin"
        ? checkins
          ? `${checkinCount} số đã lưu từ check-in`
          : "Số khách đưa lúc check-in. Sửa rồi bấm Lưu để giữ lại."
      : sector === "swim"
        ? students
          ? `${swimCount} học viên`
          : "Cùng thông tin gói, thêm buổi và lượt tự chọn còn lại."
        : redeemed
          ? `${redeemedCount} lượt đã quét`
          : "Khách, số điện thoại, thời điểm và voucher đã đổi.";

  return (
    <main style={styles.page}>
      <div style={styles.card}>
        <p style={styles.eyebrow}>Admin</p>
        <div style={styles.head}>
          <div>
            <h1 style={styles.h1}>{title}</h1>
            <div style={styles.pills}>
              <button
                type="button"
                style={{
                  ...styles.pill,
                  ...(sector === "vip" ? styles.pillOn : null),
                }}
                onClick={() => {
                  setGoi("");
                  setSector("vip");
                }}
              >
                Gói VIP
              </button>
              <button
                type="button"
                style={{
                  ...styles.pill,
                  ...(sector === "checkin" ? styles.pillOn : null),
                }}
                onClick={() => {
                  setGoi("");
                  setSector("checkin");
                }}
              >
                SĐT check-in
              </button>
              <button
                type="button"
                style={{
                  ...styles.pill,
                  ...(sector === "swim" ? styles.pillOn : null),
                }}
                onClick={() => {
                  setGoi("");
                  setSector("swim");
                }}
              >
                Khách học bơi
              </button>
              <button
                type="button"
                style={{
                  ...styles.pill,
                  ...(sector === "spa" ? styles.pillOn : null),
                }}
                onClick={() => {
                  setGoi("");
                  setRedeemed(null);
                  setSector("spa");
                }}
              >
                Voucher Spa
              </button>
              <button
                type="button"
                style={{
                  ...styles.pill,
                  ...(sector === "grill" ? styles.pillOn : null),
                }}
                onClick={() => {
                  setGoi("");
                  setRedeemed(null);
                  setSector("grill");
                }}
              >
                Voucher Lòng Nướng
              </button>
              <button
                type="button"
                style={{
                  ...styles.pill,
                  ...(sector === "tournament" ? styles.pillOn : null),
                }}
                onClick={() => {
                  setGoi("");
                  setRedeemed(null);
                  setSector("tournament");
                }}
              >
                Voucher giải đấu
              </button>
            </div>
            <p style={styles.mute}>{subtitle}</p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" style={styles.ghost} onClick={onBack}>
              ← Đổi khu
            </button>
            <button type="button" style={styles.ghost} onClick={onLogout}>
              Đăng xuất
            </button>
          </div>
        </div>

        {error ? <p style={styles.err}>{error}</p> : null}

        {sourceCount > 0 ? (
          <div ref={menuRef} style={styles.menus}>
            {(
              [
                {
                  id: "filter" as const,
                  value: selectedChoice?.label || "Tất cả",
                  active: Boolean(selectedGoi) || menu === "filter",
                  options: [
                    { id: "", label: "Tất cả", on: !selectedGoi, search: "" },
                    ...packageChoices.map((choice) => ({
                      id: choice.id,
                      label: choice.label,
                      on: selectedGoi === choice.id,
                      search: "",
                    })),
                  ],
                },
                {
                  id: "fields" as const,
                  value:
                    fieldChoices
                      .filter((choice) => fieldOn.includes(choice.id))
                      .map((choice) => choice.label)
                      .join(" · ") || "Lọc trường",
                  active: fieldOn.length > 0 || menu === "fields",
                  options: fieldChoices.map((choice) => ({
                    id: choice.id,
                    label: choice.label,
                    on: fieldOn.includes(choice.id),
                    search: "field",
                  })),
                },
                {
                  id: "sort" as const,
                  value:
                    activeSorts
                      .map((id) => sortChoices.find((item) => item.id === id)?.label)
                      .filter(Boolean)
                      .join(" · ") || "Mới nhất",
                  active:
                    activeSorts.length !== 1 ||
                    activeSorts[0] !== "time-desc" ||
                    menu === "sort",
                  options: sortChoices.map((item) => ({
                    id: item.id,
                    label: item.label,
                    on: activeSorts.includes(item.id),
                    search: "",
                  })),
                },
              ]
            ).map((item) => {
              const open = menu === item.id;
              return (
                <div key={item.id} style={{ position: "relative" }}>
                  <button
                    type="button"
                    aria-expanded={open}
                    onClick={() => setMenu((cur) => (cur === item.id ? null : item.id))}
                    style={{
                      ...styles.menuBtn,
                      ...(item.active ? styles.menuBtnOn : null),
                    }}
                  >
                    <span style={styles.menuLabel}>{item.value}</span>
                    <span aria-hidden style={{ fontSize: 10, opacity: 0.8 }}>
                      {open ? "▴" : "▾"}
                    </span>
                  </button>
                  {open ? (
                    <div
                      role="menu"
                      style={{
                        ...styles.menu,
                        ...(item.id === "filter" ? styles.menuScroll : null),
                        ...(item.id === "fields" ? styles.menuFields : null),
                        ...(item.id === "sort" ? styles.menuSort : null),
                      }}
                    >
                      {item.options.map((opt) => (
                        <div key={opt.id || "all"}>
                          <button
                            type="button"
                            role={item.id === "filter" ? "menuitemradio" : "menuitemcheckbox"}
                            aria-checked={opt.on}
                            onClick={() => {
                              if (item.id === "filter") {
                                setGoi(opt.id);
                                setMenu(null);
                                return;
                              }
                              if (item.id === "fields") {
                                const id = opt.id as FieldId;
                                setFieldOn((cur) =>
                                  cur.includes(id)
                                    ? cur.filter((itemId) => itemId !== id)
                                    : [...cur, id]
                                );
                                return;
                              }
                              setSorts((cur) => toggleAdminSort(cur, opt.id as AdminSort));
                            }}
                            style={{
                              ...styles.menuItem,
                              ...(opt.on ? styles.menuItemOn : null),
                            }}
                          >
                            {opt.label}
                          </button>
                          {item.id === "fields" && opt.on ? (
                            <input
                              type="search"
                              value={fieldQuery[opt.id as FieldId]}
                              placeholder={fieldPlaceholder(opt.id as FieldId)}
                              aria-label={opt.label}
                              onChange={(e) => {
                                const id = opt.id as FieldId;
                                setFieldQuery((cur) => ({ ...cur, [id]: e.target.value }));
                              }}
                              style={styles.menuSearch}
                            />
                          ) : null}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : null}

        {sector === "vip" ? (
          rows === null ? (
            error ? null : <p style={styles.mute}>Đang tải…</p>
          ) : rows.length === 0 ? (
            <p style={styles.mute}>Chưa có khách đang dùng gói VIP.</p>
          ) : (
            <div style={{ overflowX: "auto", marginTop: 16 }}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Họ tên</th>
                    <th style={styles.th}>Nhân viên đứng ca</th>
                    <th style={styles.th}>Số điện thoại</th>
                    <th style={styles.th}>Ngày đăng ký</th>
                    <th style={styles.th}>Gói</th>
                    <th style={styles.th}>Hết hạn</th>
                  </tr>
                </thead>
                <tbody>
                  {vipShown.length === 0 ? (
                    <tr>
                      <td style={styles.td} colSpan={6}>
                        {emptyFilter}
                      </td>
                    </tr>
                  ) : (
                    vipShown.map((row) => (
                    <tr key={row.id}>
                      <td style={{ ...styles.td, fontWeight: 700 }}>{row.fullName}</td>
                      <td style={styles.td}>{row.staffName || "—"}</td>
                      <td style={styles.td}>{row.phone}</td>
                      <td style={styles.td}>{formatWhen(row.startedAt)}</td>
                      <td style={styles.td}>{displayPlanLabel(row.planLabel)}</td>
                      <td style={styles.td}>{formatWhen(row.expiresAt)}</td>
                    </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )
        ) : sector === "swim" ? (
          students === null ? (
          error ? null : <p style={styles.mute}>Đang tải…</p>
        ) : students.length === 0 ? (
          <p style={styles.mute}>Chưa có học viên.</p>
        ) : (
          <div style={{ overflowX: "auto", marginTop: 16 }}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Họ tên</th>
                  <th style={styles.th}>Nhân viên đứng ca</th>
                  <th style={styles.th}>Số điện thoại</th>
                  <th style={styles.th}>Ngày đăng ký</th>
                  <th style={styles.th}>Gói</th>
                  <th style={styles.th}>Hết hạn</th>
                  <th style={styles.th}>Buổi</th>
                  <th style={styles.th}>Lượt tự chọn</th>
                  <th style={styles.th}>Nhật ký</th>
                </tr>
              </thead>
              <tbody>
                {swimShown.length === 0 ? (
                  <tr>
                    <td style={styles.td} colSpan={9}>
                      {emptyFilter}
                    </td>
                  </tr>
                ) : (
                  swimShown.map((row) => (
                  <tr key={row.id}>
                    <td style={{ ...styles.td, fontWeight: 700 }}>{row.fullName}</td>
                    <td style={styles.td}>{row.createdByName || "—"}</td>
                    <td style={styles.td}>{row.phone || "—"}</td>
                    <td style={styles.td}>{formatWhen(row.startedAt)}</td>
                    <td style={styles.td}>{row.packageLabel}</td>
                    <td style={styles.td}>{formatWhen(row.expiresAt)}</td>
                    <td style={{ ...styles.td, fontWeight: 800 }}>{sessionsLabel(row)}</td>
                    <td style={{ ...styles.td, fontWeight: 800 }}>{bonusLabel(row)}</td>
                    <td style={styles.td}>
                      <button
                        type="button"
                        style={styles.logBtn}
                        onClick={() => void openLog(row)}
                      >
                        Log
                      </button>
                    </td>
                  </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )
        ) : sector === "checkin" ? (
          checkins === null ? (
            error ? null : <p style={styles.mute}>Đang tải…</p>
          ) : checkins.length === 0 ? (
            <p style={styles.mute}>Chưa có lượt check-in nào được lưu số.</p>
          ) : (
            <div style={{ overflowX: "auto", marginTop: 16 }}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Họ tên</th>
                    <th style={styles.th}>Số điện thoại</th>
                    <th style={styles.th}>Check-in gần nhất</th>
                    <th style={styles.th}>Khu</th>
                    <th style={styles.th}>Số lần</th>
                  </tr>
                </thead>
                <tbody>
                  {checkinShown.length === 0 ? (
                    <tr>
                      <td style={styles.td} colSpan={5}>
                        {emptyFilter}
                      </td>
                    </tr>
                  ) : (
                    checkinShown.map((row) => (
                      <tr key={row.id}>
                        <td style={{ ...styles.td, fontWeight: 700 }}>{row.fullName}</td>
                        <td style={styles.td}>
                          <CheckinPhoneCell
                            customerId={row.id}
                            phone={row.phone}
                            onSaved={(phone) => rememberPhone(row.id, phone)}
                          />
                        </td>
                        <td style={styles.td}>{formatWhen(row.lastAt)}</td>
                        <td style={styles.td}>{row.zone}</td>
                        <td style={{ ...styles.td, fontWeight: 800 }}>{row.visits}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )
        ) : redeemed === null ? (
          error ? null : <p style={styles.mute}>Đang tải…</p>
        ) : redeemed.length === 0 ? (
          <p style={styles.mute}>Chưa có voucher đã đổi.</p>
        ) : (
          <div style={{ overflowX: "auto", marginTop: 16 }}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Họ tên</th>
                  <th style={styles.th}>Nhân viên đứng ca</th>
                  <th style={styles.th}>Số điện thoại</th>
                  <th style={styles.th}>Thời điểm</th>
                  <th style={styles.th}>Voucher</th>
                </tr>
              </thead>
              <tbody>
                {redeemedShown.length === 0 ? (
                  <tr>
                    <td style={styles.td} colSpan={5}>
                      {emptyFilter}
                    </td>
                  </tr>
                ) : (
                  redeemedShown.map((row) => (
                  <tr key={row.id}>
                    <td style={{ ...styles.td, fontWeight: 700 }}>
                      {row.customerName || "Khách"}
                    </td>
                    <td style={styles.td}>{row.claimedByName || "—"}</td>
                    <td style={styles.td}>{row.phone || "—"}</td>
                    <td style={styles.td}>{formatWhen(row.at)}</td>
                    <td style={styles.td}>
                      {sector === "tournament"
                        ? [row.placeLabel, row.offerTitle, row.tournamentName]
                            .filter(Boolean)
                            .join(" · ") || "Voucher"
                        : row.offerTitle || "Voucher"}
                    </td>
                  </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {logFor ? (
        <div style={styles.backdrop} onClick={() => setLogFor(null)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div style={styles.head}>
              <div>
                <h2 style={{ margin: 0, fontSize: 20 }}>Lượt tự chọn</h2>
                <p style={styles.mute}>{logFor.fullName}</p>
              </div>
              <button type="button" style={styles.ghost} onClick={() => setLogFor(null)}>
                Đóng
              </button>
            </div>
            {logError ? <p style={styles.err}>{logError}</p> : null}
            {logs === null && !logError ? (
              <p style={styles.mute}>Đang tải…</p>
            ) : logs && logs.length === 0 ? (
              <p style={styles.mute}>
                {logFor.used > 0
                  ? `Đã dùng ${logFor.used}/${logFor.total} lượt. Chưa lưu chi tiết từng lần.`
                  : "Chưa dùng lượt tự chọn."}
              </p>
            ) : (
              <ul style={styles.logList}>
                {(logs || []).map((entry) => (
                  <li key={entry.id} style={styles.logItem}>
                    <strong>{entry.purpose}</strong>
                    <span style={{ color: "#64748b" }}>{formatWhen(entry.usedAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}
    </main>
  );
}

const styles = {
  page: {
    minHeight: "100dvh",
    background: "#f8fafc",
    padding: "28px 16px 48px",
    fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
  } as const,
  card: {
    maxWidth: 1200,
    margin: "0 auto",
    background: "#fff",
    borderRadius: 16,
    padding: "22px 22px 18px",
    boxShadow: "0 1px 2px rgba(15,23,42,.06)",
  } as const,
  eyebrow: {
    margin: 0,
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: "0.08em",
    textTransform: "uppercase" as const,
    color: "#a16207",
  },
  head: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
    marginTop: 8,
  } as const,
  h1: { margin: 0, fontSize: 28, lineHeight: 1.15 } as const,
  pills: { display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" as const },
  pill: {
    height: 34,
    padding: "0 14px",
    borderRadius: 999,
    border: "1px solid #e2e8f0",
    background: "#fff",
    fontWeight: 700,
    cursor: "pointer",
  } as const,
  pillOn: {
    background: "#0f172a",
    color: "#fff",
    border: "1px solid #0f172a",
  } as const,
  mute: { margin: "8px 0 0", color: "#64748b", fontSize: 14 } as const,
  err: { margin: "14px 0 0", color: "#b91c1c", fontWeight: 700, fontSize: 14 } as const,
  ghost: {
    height: 36,
    padding: "0 12px",
    borderRadius: 10,
    border: "1px solid #e2e8f0",
    background: "#fff",
    fontWeight: 700,
    cursor: "pointer",
    flex: "0 0 auto",
  } as const,
  logBtn: {
    height: 32,
    padding: "0 12px",
    borderRadius: 10,
    border: "1px solid #bae6fd",
    background: "#e0f2fe",
    color: "#0369a1",
    fontWeight: 800,
    cursor: "pointer",
  } as const,
  table: { width: "100%", borderCollapse: "collapse" as const, fontSize: 14 },
  menus: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap" as const,
    justifyContent: "flex-end",
    marginTop: 16,
    position: "relative" as const,
    zIndex: 20,
  },
  menuBtn: {
    border: "1px solid #cbd5e1",
    background: "#fff",
    color: "#0f172a",
    borderRadius: 999,
    height: 34,
    padding: "0 14px",
    fontWeight: 800,
    fontSize: 12,
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    maxWidth: 280,
  } as const,
  menuBtnOn: {
    border: "1px solid #1e3a5f",
    background: "#1e3a5f",
    color: "#fff",
  } as const,
  menuLabel: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
  },
  menu: {
    position: "absolute" as const,
    top: 40,
    right: 0,
    minWidth: 220,
    background: "#fff",
    border: "1px solid #e2e8f0",
    borderRadius: 14,
    boxShadow: "0 16px 40px rgba(15,23,42,.16)",
    padding: 6,
    zIndex: 30,
  },
  menuScroll: {
    minWidth: 280,
    maxHeight: 360,
    overflowY: "auto" as const,
  },
  menuFields: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 8,
    minWidth: 260,
  },
  menuSort: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 8,
  },
  menuItem: {
    display: "block",
    width: "100%",
    textAlign: "left" as const,
    border: 0,
    borderRadius: 10,
    background: "transparent",
    color: "#0f172a",
    fontWeight: 700,
    fontSize: 13,
    padding: "9px 12px",
    cursor: "pointer",
  } as const,
  menuItemOn: {
    background: "#1e3a5f",
    color: "#fff",
  } as const,
  menuSearch: {
    display: "block",
    width: "calc(100% - 16px)",
    margin: "4px 8px 8px",
    height: 34,
    borderRadius: 8,
    border: "1px solid #e2e8f0",
    padding: "0 10px",
    fontSize: 13,
    boxSizing: "border-box" as const,
  },
  phoneInput: {
    height: 34,
    width: 140,
    borderRadius: 8,
    border: "1px solid #e2e8f0",
    padding: "0 10px",
    fontSize: 14,
  },
  th: {
    textAlign: "left" as const,
    fontSize: 11,
    letterSpacing: "0.06em",
    textTransform: "uppercase" as const,
    color: "#64748b",
    padding: "10px 8px",
    borderBottom: "1px solid #e2e8f0",
    whiteSpace: "nowrap" as const,
  },
  td: {
    padding: "12px 8px",
    borderBottom: "1px solid #f1f5f9",
    verticalAlign: "middle" as const,
  },
  backdrop: {
    position: "fixed" as const,
    inset: 0,
    background: "rgba(15,23,42,.45)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
    zIndex: 40,
  },
  modal: {
    width: "min(480px, 100%)",
    background: "#fff",
    borderRadius: 16,
    padding: 18,
  } as const,
  logList: { listStyle: "none", margin: "14px 0 0", padding: 0 } as const,
  logItem: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    padding: "10px 0",
    borderBottom: "1px solid #f1f5f9",
  } as const,
};
