"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { packageIdFromVipPlanLabel, vouchersClaimableAtZone } from "@/lib/hhg-vouchers";
import { monthPackageFilters } from "@/lib/olympic-pool-menu";
import { SWIM_PACKAGES, swimBonusExpiresAt } from "@/lib/swim-packages";

type Sector = "vip" | "swim" | "spa" | "grill";

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

type RedeemedVoucher = {
  id: string;
  at: string;
  offerTitle: string | null;
  phone: string | null;
  customerName: string | null;
  claimedByName: string | null;
};

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

type AdminSort = "time-desc" | "time-asc" | "staff" | "name";

const ADMIN_SORTS: { id: AdminSort; label: string }[] = [
  { id: "time-desc", label: "Mới nhất" },
  { id: "time-asc", label: "Cũ nhất" },
  { id: "staff", label: "Nhân viên đứng ca" },
  { id: "name", label: "Tên khách" },
];

const SORT_GROUP: Record<AdminSort, string> = {
  "time-desc": "time",
  "time-asc": "time",
  staff: "staff",
  name: "name",
};

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
  const idx = current.findIndex((id) => SORT_GROUP[id] === group);
  if (idx >= 0 && current[idx] === next) {
    const removed = current.filter((_, i) => i !== idx);
    return removed.length ? removed : current;
  }
  if (idx >= 0) {
    const copy = [...current];
    copy[idx] = next;
    return copy;
  }
  return [...current, next];
}

function compareListed(
  a: { id: string; name: string; at: string | null; staff: string | null },
  b: { id: string; name: string; at: string | null; staff: string | null },
  sort: AdminSort
) {
  if (sort === "name") return a.name.localeCompare(b.name, "vi");
  if (sort === "staff") {
    return (a.staff || "").localeCompare(b.staff || "", "vi");
  }
  const ta = a.at ? new Date(a.at).getTime() : 0;
  const tb = b.at ? new Date(b.at).getTime() : 0;
  return sort === "time-asc" ? ta - tb : tb - ta;
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
  const [staffQuery, setStaffQuery] = useState("");
  const [nameQuery, setNameQuery] = useState("");
  const [menu, setMenu] = useState<null | "filter" | "sort">(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [rows, setRows] = useState<Subscriber[] | null>(null);
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

  useEffect(() => {
    setGoi("");
    setSorts(["time-desc"]);
    setStaffQuery("");
    setNameQuery("");
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
    } else if (sector === "swim") {
      void loadSwim().catch(() => setError("Không tải được danh sách học viên."));
    } else {
      void loadRedeemed(sector);
    }
  }, [sector, loadVip, loadSwim, loadRedeemed]);

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
  }, [sector, rows, students, redeemed]);
  const selectedChoice = packageChoices.find((item) => item.id === goi) || null;
  const selectedGoi = selectedChoice?.id || "";
  const activeSorts: AdminSort[] = sorts.length ? sorts : ["time-desc"];
  function matchesQuery(name: string, staff: string | null) {
    if (activeSorts.includes("staff") && staffQuery.trim()) {
      if (!foldVi(staff || "").includes(foldVi(staffQuery.trim()))) return false;
    }
    if (activeSorts.includes("name") && nameQuery.trim()) {
      if (!foldVi(name).includes(foldVi(nameQuery.trim()))) return false;
    }
    return true;
  }
  function ordered<T extends { id: string; name: string; at: string | null; staff: string | null }>(
    list: T[]
  ) {
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
      .filter((row) => matchesQuery(row.fullName, row.staffName))
      .map((row) => ({
        ...row,
        name: row.fullName,
        at: row.startedAt,
        staff: row.staffName,
      }))
  );
  const swimShown = ordered(
    (students || [])
      .filter((row) => labelSelected(row.packageLabel, selectedGoi, SWIM_PACKAGE_FILTERS))
      .filter((row) => matchesQuery(row.fullName, row.createdByName))
      .map((row) => ({
        ...row,
        name: row.fullName,
        at: row.startedAt,
        staff: row.createdByName,
      }))
  );
  const redeemedShown = ordered(
    (redeemed || [])
      .filter((row) =>
        labelSelected(row.offerTitle || "Voucher", selectedGoi, packageChoices)
      )
      .filter((row) => matchesQuery(row.customerName || "Khách", row.claimedByName))
      .map((row) => ({
        ...row,
        name: row.customerName || "Khách",
        at: row.at,
        staff: row.claimedByName,
      }))
  );
  const searching = Boolean(staffQuery.trim() || nameQuery.trim());
  const emptyFilter =
    searching
      ? "Không có khách cho bộ lọc này."
      : sector === "swim"
        ? "Không có học viên cho gói này."
        : sector === "vip"
          ? "Không có khách cho gói này."
          : "Không có lượt đổi cho voucher này.";
  const sourceCount =
    sector === "vip"
      ? rows?.length || 0
      : sector === "swim"
        ? students?.length || 0
        : redeemed?.length || 0;
  const swimCount = swimShown.length;
  const vipCount = vipShown.length;
  const redeemedCount = redeemedShown.length;
  const title =
    sector === "vip"
      ? "Khách đang dùng gói VIP"
      : sector === "swim"
        ? "Khách học bơi"
        : sector === "spa"
          ? "Voucher Spa đã đổi"
          : "Voucher Lòng Nướng đã đổi";
  const subtitle =
    sector === "vip"
      ? rows
        ? `${vipCount} khách còn hạn`
        : "Tên, số điện thoại, ngày đăng ký, gói và ngày hết hạn."
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
                  id: "sort" as const,
                  value:
                    activeSorts
                      .map((id) => ADMIN_SORTS.find((item) => item.id === id)?.label)
                      .filter(Boolean)
                      .join(" · ") || "Mới nhất",
                  active:
                    activeSorts.length !== 1 ||
                    activeSorts[0] !== "time-desc" ||
                    menu === "sort",
                  options: ADMIN_SORTS.map((item) => ({
                    id: item.id,
                    label: item.label,
                    on: activeSorts.includes(item.id),
                    search:
                      item.id === "staff" ? "staff" : item.id === "name" ? "name" : "",
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
                        ...(item.id === "sort" ? styles.menuSort : null),
                      }}
                    >
                      {item.options.map((opt) => (
                        <div key={opt.id || "all"}>
                          <button
                            type="button"
                            role={item.id === "sort" ? "menuitemcheckbox" : "menuitemradio"}
                            aria-checked={opt.on}
                            onClick={() => {
                              if (item.id === "filter") {
                                setGoi(opt.id);
                                setMenu(null);
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
                          {opt.search && opt.on ? (
                            <input
                              type="search"
                              value={opt.search === "staff" ? staffQuery : nameQuery}
                              placeholder={
                                opt.search === "staff" ? "Tìm nhân viên" : "Tìm tên khách"
                              }
                              aria-label={
                                opt.search === "staff"
                                  ? "Tìm nhân viên đứng ca"
                                  : "Tìm tên khách"
                              }
                              onChange={(e) => {
                                if (opt.search === "staff") setStaffQuery(e.target.value);
                                else setNameQuery(e.target.value);
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
                    <td style={styles.td}>{row.offerTitle || "Voucher"}</td>
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
