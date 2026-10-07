import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { Badge, Card, CardHeader, PageHeader } from "@/components/ui";
import {
  formatDate,
  formatDateTime,
  formatTime,
  getInitials,
  MEMBERSHIP_STATUSES,
  daysUntil,
} from "@/lib/utils";
import { ServiceTag } from "@/components/service-tag";
import { MembershipPlanTag } from "@/components/membership-plan-tag";
import { PackageNumberBadge } from "@/components/package-number-badge";
import { RegisterMembershipForm } from "@/components/register-membership-form";
import { CustomerCheckinPanel } from "@/components/customer-checkin-panel";
import { CustomerNotesColumn } from "@/components/customer-notes-column";
import { DeleteCustomerButton } from "@/components/delete-customer-button";
import { FamilyPanel } from "@/components/family-panel";
import { RenewMembershipForm } from "@/components/renew-membership-form";
import { CustomerPromotionPanel } from "@/components/customer-promotion-panel";
import {
  buildDaySegments,
  startOfDay,
  toDateKey,
  visitsByDateForMembership,
  formatVisitLabel,
} from "@/lib/attendance";
import { displayContractCode } from "@/lib/contract";
import { displayMemberCode } from "@/lib/member-code";
import { ReceiptPrintButton } from "@/components/receipt-print-button";
import { departmentLabel, salesPersonLabel } from "@/config/crm.config";
import { getCustomerEntitlements } from "@/lib/entitlements";
import { requireFeature } from "@/lib/require-feature";

const ABSENCE_ALERT_DAYS = 15;

export default async function CustomerProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  await requireFeature("customers");
  const { id } = await params;
  const { tab: tabParam } = await searchParams;
  const rawTab = tabParam || "overview";
  const tab = rawTab === "journey" ? "checkin" : rawTab;
  const session = await auth();
  const isAdmin = session?.user?.role === "ADMIN";

  const customer = await prisma.customer.findUnique({
    where: { id },
    include: {
      memberships: {
        include: {
          plan: { include: { services: { include: { service: true } } } },
        },
        orderBy: { createdAt: "desc" },
      },
      usages: {
        include: { service: true },
        orderBy: { startedAt: "desc" },
      },
      visits: {
        orderBy: { checkInAt: "asc" },
        select: {
          visitDate: true,
          checkInAt: true,
          membershipId: true,
          note: true,
          staff: { select: { fullName: true, department: true } },
          usages: { select: { service: { select: { name: true } } } },
        },
      },
      notes: { orderBy: { createdAt: "desc" }, take: 20 },
      familyGroup: {
        include: {
          owner: { select: { id: true, fullName: true } },
          members: {
            select: {
              id: true,
              fullName: true,
              customerCode: true,
              phone: true,
            },
            orderBy: { fullName: "asc" },
          },
        },
      },
      ownedFamily: true,
      customerPromotions: {
        include: { promotion: { include: { service: true } } },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!customer) notFound();

  const promoCatalog = await prisma.promotion.findMany({
    where: { status: "ACTIVE" },
    include: { service: true },
    orderBy: { name: "asc" },
  });
  const activePromos = customer.customerPromotions.filter((cp) => cp.status === "ACTIVE");

  const entitled = await getCustomerEntitlements(customer.id);

  const validMems = customer.memberships.filter((m) => {
    if (m.status !== "ACTIVE") return false;
    const d = daysUntil(m.expiryDate);
    return d != null && d >= 0;
  });
  const activeMem = validMems[0] || customer.memberships.find((m) => m.status === "ACTIVE");
  const usedServices = [
    ...new Map(customer.usages.map((u) => [u.serviceId, u.service])).values(),
  ];

  const todayKey = toDateKey(startOfDay(new Date()));
  const todayVisits = customer.visits.filter((v) => toDateKey(v.visitDate) === todayKey);
  const checkInCountToday = todayVisits.length;
  const presentToday = checkInCountToday > 0;
  const presentTodayBy = presentToday
    ? todayVisits
        .map((v) => {
          const who = v.staff?.fullName || "nhân viên";
          const dept = v.staff?.department ? ` (${departmentLabel(v.staff.department)})` : "";
          return `${formatVisitLabel(v)} · ${who}${dept}`;
        })
        .join(" · ")
    : null;

  const checkinMemberships = validMems.map((m) => {
    const built = buildDaySegments(
      m.startDate,
      m.expiryDate,
      visitsByDateForMembership(customer.visits, {
        id: m.id,
        membershipCode: m.membershipCode,
      })
    );
    return {
      id: m.id,
      membershipCode: m.membershipCode,
      planName: m.plan.name,
      planCode: m.plan.planCode,
      totalDays: built.totalDays,
      attendedCount: built.attendedCount,
      remainingDays: built.remainingDays,
      startDate: m.startDate.toISOString(),
      expiryDate: m.expiryDate.toISOString(),
      checkedInToday: built.checkedInToday,
      checkInCountToday: built.checkInCountToday,
      serviceIds: m.plan.services.map((ps) => ps.serviceId),
      days: built.days,
      services: m.plan.services.map((ps) => ({
        code: ps.service.code,
        name: ps.service.name,
      })),
    };
  });

  const daysSinceStart =
    validMems[0] != null
      ? (() => {
          const sinceStart = daysUntil(validMems[0].startDate);
          return sinceStart != null ? Math.max(0, -sinceStart) : null;
        })()
      : null;
  const absentDays = (() => {
    if (!customer.lastVisitAt) return daysSinceStart;
    const d = daysUntil(customer.lastVisitAt);
    return d != null ? Math.max(0, -d) : null;
  })();

  const tabs = [
    { key: "overview", label: "Overview" },
    { key: "checkin", label: "Check-in" },
    { key: "promotion", label: "Promotion" },
    { key: "membership", label: "Membership" },
    { key: "receipt", label: "Receipt" },
    { key: "family", label: "Gia đình" },
  ];

  return (
    <div>
      <PageHeader
        title={customer.fullName}
        description={customer.customerCode}
        actions={
          isAdmin ? (
            <DeleteCustomerButton
              customerId={customer.id}
              customerName={customer.fullName}
            />
          ) : undefined
        }
      />

      <Card className="mb-4 overflow-hidden">
        <div className="flex flex-col gap-4 bg-gradient-to-r from-[#0f1c2e] to-[#1e3a5f] px-4 py-4 text-white sm:px-6 sm:py-5 md:flex-row md:items-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/15 text-lg font-semibold">
            {getInitials(customer.fullName)}
          </div>
          <div className="flex-1">
            <div className="text-xl font-semibold">{customer.fullName}</div>
            <div className="mt-1 text-sm text-slate-300">
              {customer.phone}
              {customer.email ? ` · ${customer.email}` : ""}
            </div>
            {activeMem && (
              <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-200">
                <PackageNumberBadge planCode={activeMem.plan.planCode} />
                <MembershipPlanTag
                  planCode={activeMem.plan.planCode}
                  planName={activeMem.plan.name}
                  status={activeMem.status}
                  services={activeMem.plan.services.map((ps) => ({
                    code: ps.service.code,
                    name: ps.service.name,
                  }))}
                />
                <span className="text-xs text-slate-400">
                  {formatDate(activeMem.startDate)} → {formatDate(activeMem.expiryDate)}
                  {(() => {
                    const d = daysUntil(activeMem.expiryDate);
                    return d != null ? ` · còn ${d} ngày` : "";
                  })()}
                </span>
              </div>
            )}
          </div>
        </div>
        <div className="flex gap-1 overflow-x-auto px-2 py-2 [-ms-overflow-style:none] [scrollbar-width:none] sm:px-3 [&::-webkit-scrollbar]:hidden">
          {tabs.map((t) => (
            <Link
              key={t.key}
              href={`/customers/${id}?tab=${t.key}`}
              className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium ${
                tab === t.key ? "bg-primary text-white" : "text-muted hover:bg-slate-100"
              }`}
            >
              {t.label}
            </Link>
          ))}
        </div>
      </Card>

      {tab === "overview" && (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader title="Thông tin khách" />
            <dl className="grid grid-cols-2 gap-3 p-5 text-sm">
              <Field label="Họ tên" value={customer.fullName} />
              <Field label="SĐT" value={customer.phone} />
              <Field label="Ngày sinh" value={formatDate(customer.dateOfBirth)} />
              <Field label="Giới tính" value={customer.gender || "—"} />
              <Field label="Nguồn khách" value={customer.source.replace(/_/g, " ")} />
              <Field
                label="NV kinh doanh"
                value={salesPersonLabel(customer.salesPersonCode)}
              />
              <Field label="Ngày tạo" value={formatDateTime(customer.createdAt)} />
            </dl>

            <div className="border-t border-border px-5 py-4">
              <div className="mb-3 flex items-center justify-between">
                <div className="text-xs font-semibold uppercase text-muted">Membership</div>
                <Link
                  href={`/customers/${id}?tab=membership`}
                  className="text-xs font-medium text-accent hover:underline"
                >
                  Chi tiết / Đăng ký →
                </Link>
              </div>
              {activeMem ? (
                <div className="rounded-xl border border-border bg-slate-50/80 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <PackageNumberBadge planCode={activeMem.plan.planCode} />
                        <MembershipPlanTag
                          planCode={activeMem.plan.planCode}
                          planName={activeMem.plan.name}
                          status={activeMem.status}
                          services={activeMem.plan.services.map((ps) => ({
                            code: ps.service.code,
                            name: ps.service.name,
                          }))}
                        />
                      </div>
                      <div className="mt-1 font-mono text-xs text-muted">
                        {activeMem.membershipCode} · {displayContractCode(activeMem.contractCode)}
                      </div>
                    </div>
                    <Badge className="bg-emerald-100 text-emerald-800">{activeMem.status}</Badge>
                  </div>
                  <dl className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
                    <Field label="Start" value={formatDate(activeMem.startDate)} />
                    <Field label="Expiry" value={formatDate(activeMem.expiryDate)} />
                    <Field
                      label="Còn lại"
                      value={
                        daysUntil(activeMem.expiryDate) != null
                          ? `${daysUntil(activeMem.expiryDate)} ngày`
                          : "—"
                      }
                    />
                  </dl>
                </div>
              ) : (
                <p className="text-sm text-muted">
                  Chưa có membership active.{" "}
                  <Link
                    href={`/customers/${id}?tab=membership`}
                    className="font-medium text-accent hover:underline"
                  >
                    Đăng ký ngay
                  </Link>
                </p>
              )}
            </div>

            <div className="border-t border-border px-5 py-4">
              <div className="mb-2 text-xs font-semibold uppercase text-muted">
                Promotion / Voucher
              </div>
              {activePromos.length === 0 ? (
                <p className="text-sm text-muted">
                  Chưa có.{" "}
                  <Link
                    href={`/customers/${id}?tab=promotion`}
                    className="font-medium text-accent hover:underline"
                  >
                    Gắn promotion
                  </Link>
                  .
                </p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {activePromos.map((cp) => (
                    <li key={cp.id}>
                      <span className="font-medium">{cp.promotion.name}</span>
                      <span className="text-xs text-muted">
                        {" "}
                        · {cp.promotion.code}
                        {cp.promotion.service ? ` · ${cp.promotion.service.name}` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="border-t border-border px-5 py-4">
              <div className="mb-2 text-xs font-semibold uppercase text-muted">Dịch vụ đã dùng</div>
              <div className="flex flex-wrap gap-2">
                {usedServices.length === 0 && <span className="text-sm text-muted">Chưa có</span>}
                {usedServices.map((s) => (
                  <ServiceTag key={s.id} code={s.code} name={s.name} size="md" />
                ))}
              </div>
            </div>
          </Card>
          <Card className="h-fit p-5">
            <CustomerNotesColumn
              customerId={customer.id}
              note={customer.note || ""}
              personality={customer.personality || ""}
              notes={customer.notes.map((n) => ({
                id: n.id,
                content: n.content,
                createdAt: n.createdAt.toISOString(),
              }))}
            />
          </Card>
        </div>
      )}

      {tab === "checkin" && (
        <CustomerCheckinPanel
          customerId={customer.id}
          customerName={customer.fullName}
          memberships={checkinMemberships}
          entitledServiceIds={entitled.map((s) => s.id)}
          absenceAlert={absentDays != null && absentDays >= ABSENCE_ALERT_DAYS}
          absentDays={absentDays}
          lastVisitAt={customer.lastVisitAt?.toISOString() ?? null}
          presentToday={presentToday}
          presentTodayBy={presentTodayBy}
          checkInCountToday={checkInCountToday}
        />
      )}

      {tab === "promotion" && (
        <Card className="p-5">
          <h3 className="mb-1 text-sm font-semibold">Promotion / Voucher</h3>
          <p className="mb-4 text-[11px] text-muted">
            Gắn mã cho khách này (ví dụ bơi miễn phí). Tạo mã mới ở menu Promotion.
          </p>
          <CustomerPromotionPanel
            customerId={customer.id}
            assigned={customer.customerPromotions.map((cp) => ({
              id: cp.id,
              name: cp.promotion.name,
              code: cp.promotion.code,
              type: cp.promotion.type,
              serviceName: cp.promotion.service?.name ?? null,
              createdAt: cp.createdAt.toISOString(),
              status: cp.status,
            }))}
            catalog={promoCatalog.map((p) => ({
              id: p.id,
              code: p.code,
              name: p.name,
              serviceName: p.service?.name ?? null,
            }))}
          />
        </Card>
      )}

      {tab === "membership" && (
        <div className="space-y-4">
          <div className="space-y-3">
            {customer.memberships.map((m) => {
              const st = MEMBERSHIP_STATUSES.find((s) => s.value === m.status);
              const days = daysUntil(m.expiryDate);
              return (
                <Card key={m.id} className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2 font-medium">
                        <PackageNumberBadge planCode={m.plan.planCode} />
                        <MembershipPlanTag
                          planCode={m.plan.planCode}
                          planName={m.plan.name}
                          status={m.status}
                          services={m.plan.services.map((ps) => ({
                            code: ps.service.code,
                            name: ps.service.name,
                          }))}
                        />
                      </div>
                      <div className="mt-1 font-mono text-xs text-muted">
                        {m.membershipCode} · {displayContractCode(m.contractCode)}
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-2">
                      <Badge className={st?.color}>{m.status}</Badge>
                      <a
                        href={`/api/receipts/${m.contractCode}`}
                        className="text-[11px] font-medium text-accent hover:underline"
                      >
                        Tải HĐ CSV
                      </a>
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
                    <Field label="Start" value={formatDate(m.startDate)} />
                    <Field
                      label="Expiry"
                      value={
                        days != null && m.status === "ACTIVE"
                          ? `${formatDate(m.expiryDate)} (${days}d)`
                          : formatDate(m.expiryDate)
                      }
                    />
                    <Field label="Created" value={formatDate(m.createdAt)} />
                    <Field
                      label="NV sale"
                      value={salesPersonLabel(m.salesPersonCode)}
                    />
                  </div>
                  {m.note && <p className="mt-2 text-xs text-muted">{m.note}</p>}
                  {(m.status === "ACTIVE" || m.status === "EXPIRED") && (
                    <RenewMembershipForm
                      membershipId={m.id}
                      planName={m.plan.name}
                      durationDays={m.plan.durationDays}
                      currentExpiry={m.expiryDate.toISOString()}
                    />
                  )}
                </Card>
              );
            })}
            {customer.memberships.length === 0 && (
              <Card className="p-8 text-center text-sm text-muted">Chưa có membership</Card>
            )}
          </div>
          <Card className="p-5">
            <h3 className="mb-1 text-sm font-semibold">Thêm membership</h3>
            <p className="mb-3 text-[11px] text-muted">
              Chọn gói (mỗi loại 1–4) · mặc định 30 ngày hoặc Custom · Lưu = Active ngay
            </p>
            <RegisterMembershipForm lockedCustomerId={customer.id} />
          </Card>
        </div>
      )}

      {tab === "receipt" && (
        <div className="space-y-6">
          <p className="text-[11px] text-muted">
            Mã hội viên = mã khách:{" "}
            <strong className="font-mono">
              {displayMemberCode(customer.customerCode, !!customer.familyGroupId)}
            </strong>
            {customer.familyGroupId ? " (gia đình)" : " (cá nhân)"}
          </p>

          <div>
            <h3 className="mb-2 text-sm font-semibold">I. Hợp đồng Hội viên</h3>
            <div className="space-y-3">
              {customer.memberships.map((m) => (
                <Card key={`member-${m.id}`} className="p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="font-mono text-base font-semibold">
                        {displayMemberCode(customer.customerCode, !!customer.familyGroupId)}
                      </div>
                      <div className="mt-1 text-sm">
                        {m.plan.name} · {displayContractCode(m.contractCode)}
                      </div>
                      <div className="mt-1 text-xs text-muted">
                        {formatDate(m.startDate)} → {formatDate(m.expiryDate)} · {m.status}
                      </div>
                    </div>
                    <ReceiptPrintButton
                      href={`/receipts/print/${encodeURIComponent(m.contractCode)}?type=member`}
                      label="In HĐ Hội viên"
                    />
                  </div>
                </Card>
              ))}
              {customer.memberships.length === 0 && (
                <Card className="p-8 text-center text-sm text-muted">
                  Chưa có hợp đồng — đăng ký gói để in
                </Card>
              )}
            </div>
          </div>

          <div>
            <h3 className="mb-2 text-sm font-semibold">II. Hợp đồng HLV (dịch vụ)</h3>
            <div className="space-y-3">
              {customer.memberships.map((m) => (
                <Card key={`hlv-${m.id}`} className="p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="font-mono text-base font-semibold">
                        {displayMemberCode(customer.customerCode, !!customer.familyGroupId)}
                      </div>
                      <div className="mt-1 text-sm">
                        {m.plan.name} · {displayContractCode(m.contractCode)}
                      </div>
                      <div className="mt-1 text-xs text-muted">
                        {formatDate(m.startDate)} → {formatDate(m.expiryDate)} · {m.status}
                      </div>
                    </div>
                    <ReceiptPrintButton
                      href={`/receipts/print/${encodeURIComponent(m.contractCode)}?type=hlv`}
                      label="In HĐ HLV"
                    />
                  </div>
                </Card>
              ))}
              {customer.memberships.length === 0 && (
                <Card className="p-8 text-center text-sm text-muted">
                  Chưa có hợp đồng — đăng ký gói để in
                </Card>
              )}
            </div>
          </div>
        </div>
      )}

      {tab === "family" && (
        <Card className="p-5">
          <h3 className="mb-1 text-sm font-semibold">Gói gia đình</h3>
          <p className="mb-4 text-[11px] text-muted">
            1 SĐT chủ hộ · chỉ người trong danh sách được vào khi đọc số này · người lạ phải mua gói lẻ
          </p>
          <FamilyPanel
            customerId={customer.id}
            group={
              customer.familyGroup
                ? {
                    id: customer.familyGroup.id,
                    groupCode: customer.familyGroup.groupCode,
                    name: customer.familyGroup.name,
                    phone: customer.familyGroup.phone,
                    ownerId: customer.familyGroup.ownerId,
                    members: customer.familyGroup.members.map((m) => ({
                      id: m.id,
                      fullName: m.fullName,
                      customerCode: m.customerCode,
                      phone: m.phone,
                      isOwner: m.id === customer.familyGroup!.ownerId,
                    })),
                  }
                : null
            }
          />
        </Card>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] text-muted">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
