"use client";

import { performCheckin } from "@/app/actions";
import { Badge, Button, Card, Input, Select } from "@/components/ui";
import { formatDate, formatDateTime, getInitials, cn } from "@/lib/utils";
import { getAreaTheme, getPackageByCode } from "@/config/crm.config";
import { ServiceTag } from "@/components/service-tag";
import { PackageNumberBadge } from "@/components/package-number-badge";
import { fuzzyMatchCustomer, normalizeSearchText } from "@/lib/customer-search";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type Membership = {
  id: string;
  code: string;
  status: string;
  planName: string;
  expiryDate: string;
  allowedServiceIds: string[];
  allowedServices: { id: string; code: string; name: string }[];
};

type DaySegment = {
  date: string;
  label: string;
  status: "present" | "absent" | "future";
  times: string[];
};

type MembershipProgress = {
  id: string;
  membershipCode: string;
  planName: string;
  planCode: string;
  totalDays: number;
  attendedCount: number;
  remainingDays: number;
  startDate: string;
  expiryDate: string;
  checkedInToday: boolean;
  checkInCountToday: number;
  serviceIds: string[];
  serviceNames: string[];
  days: DaySegment[];
};

type Customer = {
  id: string;
  customerCode: string;
  fullName: string;
  phone: string;
  lastVisitAt: string | null;
  absentDays: number | null;
  absenceAlert: boolean;
  presentToday: boolean;
  presentTodayBy: string | null;
  checkInCountToday: number;
  familyLabel: string | null;
  membership: Membership | null;
  membershipsProgress: MembershipProgress[];
};

function EnergyBar({ days }: { days: DaySegment[] }) {
  return (
    <div className="flex h-4 w-full overflow-hidden rounded-md bg-[#2a2a2a]">
      {days.map((d) => (
        <div
          key={d.date}
          title={`${d.label}: ${
            d.status === "present"
              ? `Đã tới ${d.times.length} lần: ${d.times.join(", ")}`
              : d.status === "absent"
                ? "Không tới"
                : "Chưa tới ngày"
          }`}
          className={cn(
            "min-w-[3px] flex-1",
            d.status === "present" && "bg-[#22c55e]",
            d.status === "absent" && "bg-[#ef4444]",
            d.status === "future" && "bg-[#4b5563]"
          )}
        />
      ))}
    </div>
  );
}

export function CheckinClient({
  customers,
  services,
  recent,
}: {
  customers: Customer[];
  services: { id: string; name: string; code: string }[];
  recent: {
    id: string;
    code: string;
    customerCode: string;
    name: string;
    services: { code: string; name: string }[];
    at: string;
    staff?: string | null;
  }[];
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [visitQ, setVisitQ] = useState("");
  const [visitSort, setVisitSort] = useState<"time" | "name" | "id">("time");
  const [selectedId, setSelectedId] = useState<string | null>(customers[0]?.id ?? null);
  const [selectedServices, setSelectedServices] = useState<string[]>([]);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [detailId, setDetailId] = useState<string | null>(null);

  const filtered = useMemo(
    () => customers.filter((c) => fuzzyMatchCustomer(c, q)),
    [customers, q]
  );

  const visitsShown = useMemo(() => {
    const needle = normalizeSearchText(visitQ);
    const list = needle
      ? recent.filter((r) =>
          normalizeSearchText(`${r.name} ${r.code} ${r.customerCode}`).includes(
            needle
          )
        )
      : [...recent];

    list.sort((a, b) => {
      if (visitSort === "name") {
        return a.name.localeCompare(b.name, "vi", { sensitivity: "base" });
      }
      if (visitSort === "id") {
        const byCustomer = a.customerCode.localeCompare(b.customerCode, "en");
        if (byCustomer !== 0) return byCustomer;
        return a.code.localeCompare(b.code, "en");
      }
      return new Date(b.at).getTime() - new Date(a.at).getTime();
    });
    return list;
  }, [recent, visitQ, visitSort]);

  const selected = filtered.find((c) => c.id === selectedId) ?? filtered[0] ?? null;

  useEffect(() => {
    if (filtered.length === 0) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !filtered.some((c) => c.id === selectedId)) {
      setSelectedId(filtered[0].id);
    }
  }, [filtered, selectedId]);

  function toggleService(id: string) {
    setSelectedServices((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  async function checkInPackage(m: MembershipProgress) {
    if (!selected || busyKey) return;
    const next = (m.checkInCountToday || 0) + 1;
    const svc = (m.serviceNames || []).join(", ") || m.planName;
    const ids = m.serviceIds;
    if (ids.length === 0) {
      setMessage("Gói chưa gắn dịch vụ — chọn dịch vụ bên dưới rồi CHECK IN");
      return;
    }

    const fd = new FormData();
    fd.set("customerId", selected.id);
    fd.set("membershipId", m.id);
    ids.forEach((id) => fd.append("serviceIds", id));
    fd.set("note", `Check-in gói ${m.membershipCode}`);

    setBusyKey(m.id);
    try {
      const res = await performCheckin(fd);
      if (!res.ok) {
        setMessage(res.error || "Check-in lỗi");
        return;
      }
      const now = new Date().toLocaleTimeString("vi-VN", {
        hour: "2-digit",
        minute: "2-digit",
      });
      setMessage(
        `+1 lúc ${now} · ${res.serviceNames || svc} · gói này hôm nay ${res.checkInCountToday ?? next} lần`
      );
      router.refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Check-in lỗi");
    } finally {
      setBusyKey(null);
    }
  }

  async function checkInManual() {
    if (!selected || selectedServices.length === 0 || busyKey) return;
    const next = (selected.checkInCountToday || 0) + 1;
    const fd = new FormData();
    fd.set("customerId", selected.id);
    selectedServices.forEach((id) => fd.append("serviceIds", id));
    setBusyKey("manual");
    try {
      const res = await performCheckin(fd);
      if (!res.ok) {
        setMessage(res.error || "Check-in lỗi");
        return;
      }
      const now = new Date().toLocaleTimeString("vi-VN", {
        hour: "2-digit",
        minute: "2-digit",
      });
      setMessage(`+1 lúc ${now} · hôm nay ${res.checkInCountToday ?? next} lần`);
      setSelectedServices([]);
      router.refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Check-in lỗi");
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        <Card className="p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Gõ tên / SĐT / mã… (không cần đúng dấu)"
              autoFocus
              className="flex-1"
            />
            {q ? (
              <Button type="button" variant="outline" onClick={() => setQ("")}>
                Xóa lọc
              </Button>
            ) : null}
          </div>
          <p className="mt-2 text-[11px] text-muted">
            Hiện {filtered.length}/{customers.length} khách · lọc realtime khi gõ
          </p>
        </Card>

        {filtered.length > 0 ? (
          <div className="grid max-h-[320px] gap-2 overflow-y-auto sm:grid-cols-2">
            {filtered.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  setSelectedId(c.id);
                  setSelectedServices([]);
                  setMessage("");
                  setDetailId(null);
                }}
                className={`rounded-xl border p-4 text-left ${
                  selected?.id === c.id
                    ? "border-[#111827] bg-[#f3f4f6]"
                    : "border-[#ececef] bg-white"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="font-medium">{c.fullName}</div>
                  {c.absenceAlert ? (
                    <Badge className="bg-amber-100 text-amber-900">15d+</Badge>
                  ) : null}
                </div>
                <div className="text-xs text-muted">
                  {c.customerCode} · {c.phone}
                  {c.familyLabel ? ` · ${c.familyLabel}` : ""}
                </div>
                {c.checkInCountToday > 0 ? (
                  <div className="mt-1 text-[11px] text-emerald-700">
                    Hôm nay {c.checkInCountToday} lần
                  </div>
                ) : null}
              </button>
            ))}
          </div>
        ) : (
          <Card className="p-8 text-center text-sm text-muted">
            Không khớp “{q}” · thử bỏ dấu hoặc gõ một phần tên
          </Card>
        )}

        {selected ? (
          <Card className="overflow-hidden">
            <div className="bg-[#111827] px-5 py-5 text-white">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/15 font-semibold">
                  {getInitials(selected.fullName)}
                </div>
                <div>
                  <div className="text-lg font-semibold">{selected.fullName}</div>
                  <div className="text-sm text-slate-300">
                    {selected.customerCode} · {selected.phone}
                    {selected.familyLabel ? ` · ${selected.familyLabel}` : ""}
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-4 p-5">
              {selected.checkInCountToday > 0 ? (
                <div className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-950">
                  <strong>Hôm nay {selected.checkInCountToday} lần (tất cả gói).</strong>{" "}
                  {selected.presentTodayBy} Acc kia cũng +1 thêm được.
                </div>
              ) : null}

              {selected.absenceAlert ? (
                <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 text-sm text-amber-950">
                  <strong>Alert:</strong> khách không tới{" "}
                  <strong>{selected.absentDays} ngày</strong> liên tục
                  {selected.lastVisitAt
                    ? ` (lần cuối ${formatDate(selected.lastVisitAt)})`
                    : " (chưa có visit)"}
                  .
                </div>
              ) : null}

              {selected.membershipsProgress.length > 0 ? (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-xs font-semibold uppercase text-muted">
                      Tiến độ gói (theo số ngày)
                    </div>
                    <div className="flex items-center gap-3 text-[11px] text-muted">
                      <span className="inline-flex items-center gap-1">
                        <span className="h-2.5 w-2.5 rounded-sm bg-[#22c55e]" /> Đã tới
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <span className="h-2.5 w-2.5 rounded-sm bg-[#ef4444]" /> Không tới
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <span className="h-2.5 w-2.5 rounded-sm bg-[#4b5563]" /> Chưa tới
                      </span>
                    </div>
                  </div>

                  {selected.membershipsProgress.map((m) => {
                    const pkg = getPackageByCode(m.planCode);
                    const open = detailId === m.id;
                    const absentDayList = m.days.filter((d) => d.status === "absent");
                    const presentDays = m.days.filter((d) => d.status === "present");

                    return (
                      <div
                        key={m.id}
                        className="rounded-xl border border-[#e5e7eb] bg-white p-3"
                      >
                        <button
                          type="button"
                          className="w-full text-left"
                          onClick={() => setDetailId(open ? null : m.id)}
                        >
                          <div className="mb-2 flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <PackageNumberBadge planCode={m.planCode} />
                              <span className="text-sm font-medium">
                                {pkg?.name || m.planName}
                              </span>
                            </div>
                            <span className="text-xs text-muted">
                              {m.attendedCount}/{m.totalDays} ngày tới
                            {m.checkInCountToday > 0
                                ? ` · hôm nay ${m.checkInCountToday} lần`
                                : ""}
                            </span>
                          </div>
                        </button>

                        <div className="flex items-center gap-2">
                          <div className="min-w-0 flex-1">
                            <EnergyBar days={m.days} />
                          </div>
                          <Button
                            type="button"
                            size="sm"
                            disabled={busyKey === m.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              void checkInPackage(m);
                            }}
                            className="shrink-0"
                          >
                            {busyKey === m.id ? "…" : "+1"}
                            {m.checkInCountToday > 0 ? ` (${m.checkInCountToday})` : ""}
                          </Button>
                        </div>

                        <div className="mt-1.5 flex justify-between text-[11px] text-muted">
                          <span>
                            {formatDate(m.startDate)} → {formatDate(m.expiryDate)}
                          </span>
                          <span>Còn {m.remainingDays} ngày · bấm gói để xem chi tiết</span>
                        </div>

                        {open ? (
                          <div className="mt-3 space-y-3 border-t border-[#f3f4f6] pt-3 text-sm">
                            <div>
                              <div className="mb-1 text-xs font-semibold text-emerald-700">
                                Đã tới ({presentDays.length})
                              </div>
                              {presentDays.length === 0 ? (
                                <p className="text-xs text-muted">Chưa có ngày nào</p>
                              ) : (
                                <ul className="max-h-40 space-y-1 overflow-y-auto text-xs">
                                  {presentDays.map((d) => (
                                    <li key={d.date} className="flex justify-between gap-2">
                                      <span>{d.label}</span>
                                      <span className="font-medium text-emerald-700">
                                        {d.times.length} lần · {d.times.join(" · ")}
                                      </span>
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                            <div>
                              <div className="mb-1 text-xs font-semibold text-rose-700">
                                Không tới ({absentDayList.length})
                              </div>
                              {absentDayList.length === 0 ? (
                                <p className="text-xs text-muted">Không có ngày vắng</p>
                              ) : (
                                <ul className="max-h-40 space-y-1 overflow-y-auto text-xs text-rose-800">
                                  {absentDayList.map((d) => (
                                    <li key={d.date}>{d.label} — không tới</li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-muted">
                  Chưa có membership còn hạn — vẫn check-in walk-in được
                </div>
              )}

              {selected.membership ? (
                <div
                  className={`rounded-lg border p-3 text-sm ${
                    selected.membership.status === "ACTIVE"
                      ? "border-emerald-200 bg-emerald-50"
                      : "border-rose-200 bg-rose-50"
                  }`}
                >
                  <div className="font-medium">
                    {selected.membership.planName} · {selected.membership.code}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {selected.membership.allowedServices.map((s) => (
                      <ServiceTag key={s.id} code={s.code} name={s.name} />
                    ))}
                  </div>
                </div>
              ) : null}

              <div>
                <div className="mb-2 text-xs font-semibold uppercase text-muted">
                  Hoặc chọn dịch vụ rồi check-in
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {services.map((s) => {
                    const theme = getAreaTheme(s.code);
                    const allowed =
                      !selected.membership ||
                      selected.membership.status !== "ACTIVE" ||
                      selected.membership.allowedServiceIds.includes(s.id);
                    const active = selectedServices.includes(s.id);
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => toggleService(s.id)}
                        className="rounded-xl border px-3 py-3 text-left text-sm font-medium transition"
                        style={
                          active
                            ? {
                                background: theme.solid,
                                borderColor: theme.solid,
                                color: "#fff",
                              }
                            : {
                                background: "#fff",
                                borderColor: theme.border,
                                color: theme.text,
                              }
                        }
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className="h-2 w-2 rounded-full"
                            style={{ background: active ? "#fff" : theme.solid }}
                          />
                          {s.name}
                        </div>
                        {selected.membership?.status === "ACTIVE" ? (
                          <div
                            className="mt-1 text-[10px]"
                            style={{ opacity: active ? 0.85 : 0.7 }}
                          >
                            {allowed ? "✓ trong gói" : "ngoài gói"}
                          </div>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </div>

              <Button
                className="h-12 w-full text-base"
                onClick={checkInManual}
                disabled={busyKey === "manual" || selectedServices.length === 0}
              >
                {busyKey === "manual"
                  ? "…"
                  : selected.checkInCountToday > 0
                    ? `+1 · lần ${selected.checkInCountToday + 1}`
                    : "+1"}
              </Button>
              {message ? (
                <p
                  className={`text-center text-sm ${
                    message.startsWith("+1") || message.startsWith("OK")
                      ? "text-success"
                      : "text-danger"
                  }`}
                >
                  {message}
                </p>
              ) : null}
            </div>
          </Card>
        ) : null}
      </div>

      <Card>
        <div className="border-b px-4 py-3">
          <div className="text-sm font-semibold">Visit hôm nay</div>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <Input
              value={visitQ}
              onChange={(e) => setVisitQ(e.target.value)}
              placeholder="Lọc tên / CUS / VIS…"
            />
            <Select
              value={visitSort}
              onChange={(e) =>
                setVisitSort(e.target.value as "time" | "name" | "id")
              }
            >
              <option value="time">Sắp xếp: giờ mới nhất</option>
              <option value="name">Sắp xếp: tên A → Z</option>
              <option value="id">Sắp xếp: mã khách + mã visit</option>
            </Select>
          </div>
        </div>
        <ul className="divide-y">
          {visitsShown.map((r) => (
            <li key={r.id} className="px-4 py-3 text-sm">
              <div className="font-medium">{r.name}</div>
              <div className="mt-1 flex flex-wrap gap-1">
                {r.services.map((s) => (
                  <ServiceTag key={s.code + s.name} code={s.code} name={s.name} />
                ))}
              </div>
              <div className="mt-1 text-[11px] text-muted">
                {r.customerCode} · {r.code} · {formatDateTime(r.at)}
                {r.staff ? ` · ${r.staff}` : ""}
              </div>
            </li>
          ))}
          {visitsShown.length === 0 ? (
            <li className="px-4 py-8 text-center text-xs text-muted">Chưa có</li>
          ) : null}
        </ul>
      </Card>
    </div>
  );
}
