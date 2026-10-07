"use client";

import { performCheckin } from "@/app/actions";
import { Button, Card } from "@/components/ui";
import { formatDate } from "@/lib/utils";
import { getPackageByCode } from "@/config/crm.config";
import { PackageNumberBadge } from "@/components/package-number-badge";
import { ServiceTag } from "@/components/service-tag";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/utils";
import type { DaySegment } from "@/lib/attendance";

export type CustomerMembershipCheckin = {
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
  days: DaySegment[];
  services: { code: string; name: string }[];
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

/** Check-in cá nhân trên hồ sơ khách (tab Journey) */
export function CustomerCheckinPanel({
  customerId,
  customerName,
  memberships,
  entitledServiceIds = [],
  absenceAlert,
  absentDays,
  lastVisitAt,
  presentTodayBy,
  checkInCountToday = 0,
}: {
  customerId: string;
  customerName: string;
  memberships: CustomerMembershipCheckin[];
  entitledServiceIds?: string[];
  absenceAlert: boolean;
  absentDays: number | null;
  lastVisitAt: string | null;
  presentToday?: boolean;
  presentTodayBy?: string | null;
  checkInCountToday?: number;
}) {
  const router = useRouter();
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [detailId, setDetailId] = useState<string | null>(
    memberships[0]?.id ?? null
  );

  async function checkInPackage(m: CustomerMembershipCheckin) {
    if (busyKey) return;
    const next = (m.checkInCountToday || 0) + 1;
    const svc = m.services.map((s) => s.name).join(", ") || m.planName;
    if (m.serviceIds.length === 0) {
      setMessage("Gói chưa gắn dịch vụ");
      return;
    }

    const fd = new FormData();
    fd.set("customerId", customerId);
    fd.set("membershipId", m.id);
    m.serviceIds.forEach((id) => fd.append("serviceIds", id));
    fd.set("note", `Check-in gói ${m.membershipCode}`);

    setBusyKey(m.id);
    try {
      const res = await performCheckin(fd);
      if (!res.ok) {
        setMessage(res.error || "Check-in lỗi");
        return;
      }
      setMessage(
        `+1 lúc ${new Date().toLocaleTimeString("vi-VN", {
          hour: "2-digit",
          minute: "2-digit",
        })} · ${res.serviceNames || svc} · gói này hôm nay ${res.checkInCountToday ?? next} lần`
      );
      router.refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Check-in lỗi");
    } finally {
      setBusyKey(null);
    }
  }

  if (memberships.length === 0) {
    if (entitledServiceIds.length === 0) {
      return (
        <Card className="p-8 text-center text-sm text-muted">
          Chưa có gói còn hạn — đăng ký membership trước khi check-in.
        </Card>
      );
    }
    return (
      <Card className="p-5">
        <h3 className="text-sm font-semibold">Check-in cá nhân</h3>
        <p className="mb-3 text-[11px] text-muted">
          Quyền từ gói gia đình hoặc promotion/voucher
        </p>
        {checkInCountToday > 0 ? (
          <div className="mb-3 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-950">
            <strong>Hôm nay {checkInCountToday} lần.</strong> {presentTodayBy}
          </div>
        ) : null}
        <Button
            type="button"
            disabled={busyKey === "promo"}
            onClick={() => {
              if (busyKey) return;
              const next = checkInCountToday + 1;
              const fd = new FormData();
              fd.set("customerId", customerId);
              entitledServiceIds.forEach((id) => fd.append("serviceIds", id));
              fd.set("note", "Check-in quyền gia đình/promotion");
              setBusyKey("promo");
              void (async () => {
                try {
                  const res = await performCheckin(fd);
                  if (!res.ok) setMessage(res.error);
                  else {
                    setMessage(
                      `+1 lúc ${new Date().toLocaleTimeString("vi-VN", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })} · hôm nay ${res.checkInCountToday ?? next} lần`
                    );
                    router.refresh();
                  }
                } finally {
                  setBusyKey(null);
                }
              })();
            }}
          >
            {busyKey === "promo" ? "…" : "+1"}
          </Button>
        {message && <p className="mt-3 text-sm">{message}</p>}
      </Card>
    );
  }

  return (
    <Card className="p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">Check-in cá nhân</h3>
          <p className="text-[11px] text-muted">
            Chỉ khách này · Xanh = đã tới · Đỏ = không tới · bấm gói xem giờ chi tiết
          </p>
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

      {checkInCountToday > 0 && (
        <div className="mb-4 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-950">
          <strong>Hôm nay {checkInCountToday} lần (tất cả gói).</strong> {presentTodayBy} Acc kia cũng +1 thêm được.
        </div>
      )}

      {absenceAlert && (
        <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 text-sm text-amber-950">
          <strong>Alert:</strong> không tới{" "}
          <strong>{absentDays} ngày</strong> liên tục
          {lastVisitAt ? ` (lần cuối ${formatDate(lastVisitAt)})` : ""}.
        </div>
      )}

      <div className="space-y-3">
        {memberships.map((m) => {
          const pkg = getPackageByCode(m.planCode);
          const open = detailId === m.id;
          const absent = m.days.filter((d) => d.status === "absent");
          const present = m.days.filter((d) => d.status === "present");

          return (
            <div key={m.id} className="rounded-xl border border-[#e5e7eb] bg-white p-3">
              <button
                type="button"
                className="w-full text-left"
                onClick={() => setDetailId(open ? null : m.id)}
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <PackageNumberBadge planCode={m.planCode} />
                    <span className="text-sm font-medium">{pkg?.name || m.planName}</span>
                    {m.services.map((s) => (
                      <ServiceTag key={s.code} code={s.code} name={s.name} />
                    ))}
                  </div>
                  <span className="shrink-0 text-xs text-muted">
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
                <span>Còn {m.remainingDays} ngày</span>
              </div>

              {open && (
                <div className="mt-3 space-y-3 border-t border-[#f3f4f6] pt-3 text-sm">
                  <div>
                    <div className="mb-1 text-xs font-semibold text-emerald-700">
                      Đã tới ({present.length})
                    </div>
                    {present.length === 0 ? (
                      <p className="text-xs text-muted">Chưa có ngày nào</p>
                    ) : (
                      <ul className="max-h-48 space-y-1 overflow-y-auto text-xs">
                        {present.map((d) => (
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
                      Không tới ({absent.length})
                    </div>
                    {absent.length === 0 ? (
                      <p className="text-xs text-muted">Không có ngày vắng</p>
                    ) : (
                      <ul className="max-h-48 space-y-1 overflow-y-auto text-xs text-rose-800">
                        {absent.map((d) => (
                          <li key={d.date}>{d.label} — không tới</li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {message && (
        <p
          className={`mt-3 text-center text-sm ${
            message.startsWith("+1") || message.startsWith("OK")
              ? "text-success"
              : "text-danger"
          }`}
        >
          {message}
        </p>
      )}
    </Card>
  );
}
