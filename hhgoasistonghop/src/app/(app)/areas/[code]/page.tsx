import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Badge, Card, CardHeader, KpiCard, PageHeader } from "@/components/ui";
import { getAreaTheme } from "@/config/crm.config";
import { formatDateTime } from "@/lib/utils";
import { startOfDay, startOfMonth, addDays, format, subDays } from "date-fns";
import { ArrowLeft } from "lucide-react";
import { DonutProgress, WeeklyStackedBars, HorizontalAllocBars } from "@/components/charts";
import { ServiceAvatar, ServiceTag } from "@/components/service-tag";
import { requireFeature } from "@/lib/require-feature";

export default async function AreaDashboardPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  await requireFeature("dashboard");
  const { code: raw } = await params;
  const code = raw.toUpperCase();

  const service = await prisma.service.findUnique({ where: { code } });
  if (!service || service.status !== "ACTIVE") notFound();

  const now = new Date();
  const today = startOfDay(now);
  const monthStart = startOfMonth(now);
  const in7 = addDays(today, 7);
  const weekStart = subDays(today, 6);
  const theme = getAreaTheme(service.code);

  const planLinks = await prisma.membershipPlanService.findMany({
    where: { serviceId: service.id },
    select: { planId: true },
  });
  const planIds = planLinks.map((p) => p.planId);

  const [firstUsages, membershipsOfArea, checkinsToday, recentUsages, weekUsages] =
    await Promise.all([
      prisma.serviceUsage.groupBy({
        by: ["customerId"],
        where: { serviceId: service.id },
        _min: { startedAt: true },
      }),
      planIds.length
        ? prisma.membership.findMany({
            where: { planId: { in: planIds }, status: { not: "CANCELLED" } },
            select: {
              customerId: true,
              status: true,
              createdAt: true,
              expiryDate: true,
            },
          })
        : Promise.resolve([]),
      prisma.serviceUsage.count({
        where: { serviceId: service.id, startedAt: { gte: today } },
      }),
      prisma.serviceUsage.findMany({
        where: { serviceId: service.id },
        include: { customer: true, visit: true },
        orderBy: { startedAt: "desc" },
        take: 8,
      }),
      prisma.serviceUsage.findMany({
        where: { serviceId: service.id, startedAt: { gte: weekStart } },
        select: { startedAt: true },
      }),
    ]);

  const firstTouch = new Map<string, Date>();
  for (const row of firstUsages) {
    if (row._min.startedAt) firstTouch.set(row.customerId, row._min.startedAt);
  }
  for (const m of membershipsOfArea) {
    const prev = firstTouch.get(m.customerId);
    if (!prev || m.createdAt < prev) firstTouch.set(m.customerId, m.createdAt);
  }

  const totalCustomers = firstTouch.size;
  const newToday = [...firstTouch.values()].filter((d) => d >= today).length;
  const newMonth = [...firstTouch.values()].filter((d) => d >= monthStart).length;
  const activeMemberships = membershipsOfArea.filter((m) => m.status === "ACTIVE").length;
  const expiringSoon = membershipsOfArea.filter(
    (m) => m.status === "ACTIVE" && m.expiryDate >= today && m.expiryDate <= in7
  ).length;

  // Weekly chart data
  const weekData = Array.from({ length: 7 }, (_, i) => {
    const d = subDays(today, 6 - i);
    const key = format(d, "yyyy-MM-dd");
    const count = weekUsages.filter((u) => format(u.startedAt, "yyyy-MM-dd") === key).length;
    return {
      day: format(d, "EEE d"),
      checkin: count,
      membership: Math.max(0, Math.round(count * 0.4)),
    };
  });

  const allocData = [
    { name: "Check-in", value: checkinsToday },
    { name: "Thẻ active", value: activeMemberships },
    { name: "Khách mới tháng", value: newMonth },
    { name: "Sắp hết hạn", value: expiringSoon },
  ];

  const activeMemList =
    planIds.length > 0
      ? await prisma.membership.findMany({
          where: { status: "ACTIVE", planId: { in: planIds } },
          include: { customer: true, plan: true },
          orderBy: { expiryDate: "asc" },
          take: 6,
        })
      : [];

  const goal = Math.max(checkinsToday, 10);

  return (
    <div>
      <div className="mb-4">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm text-[#6b7280] hover:text-[#111827]"
        >
          <ArrowLeft className="h-4 w-4" />
          Tất cả khu vực
        </Link>
      </div>

      <PageHeader
        title={service.name}
        description={`Tổng quan vận hành · ${service.code}`}
        actions={
          <div className="flex items-center gap-2">
            <ServiceTag code={service.code} name={service.name} size="md" />
            <ServiceAvatar code={service.code} name={service.name} />
          </div>
        }
      />

      <div
        className="mb-4 h-1 rounded-full"
        style={{ background: theme.solid }}
        aria-hidden
      />

      {/* Top KPI row */}
      <div className="mb-4 grid grid-cols-2 gap-4 xl:grid-cols-6">
        <KpiCard label="Tổng khách" value={totalCustomers} hint="Unique theo khu vực" />
        <KpiCard label="Khách mới hôm nay" value={newToday} badge={newToday > 0 ? "New" : undefined} />
        <KpiCard label="Khách mới tháng này" value={newMonth} />
        <KpiCard label="Thẻ đang hoạt động" value={activeMemberships} tone="success" />
        <KpiCard label="Sắp hết hạn (7 ngày)" value={expiringSoon} tone="warning" />
        <KpiCard label="Check-in hôm nay" value={checkinsToday} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
        {/* Left column */}
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card className="flex items-center gap-4 p-5">
              <DonutProgress value={checkinsToday} total={goal} />
              <div>
                <div className="text-sm text-[#6b7280]">Tiến độ check-in</div>
                <div className="mt-1 text-[26px] font-semibold tracking-tight">
                  {checkinsToday}/{goal}
                </div>
                <div className="text-xs text-[#9ca3af]">Hôm nay</div>
              </div>
            </Card>
            <Card className="p-5">
              <div className="mb-3 text-sm font-medium text-[#111827]">Phân bổ nhanh</div>
              <HorizontalAllocBars data={allocData} />
            </Card>
          </div>

          <Card className="p-5">
            <div className="mb-1 flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold text-[#111827]">Check-in 7 ngày</div>
                <div className="text-xs text-[#9ca3af]">Theo ngày trong tuần</div>
              </div>
              <div className="flex items-center gap-3 text-[11px] text-[#6b7280]">
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-[#111827]" /> Check-in
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-[#9ca3af]" /> Ước lượng thẻ
                </span>
              </div>
            </div>
            <WeeklyStackedBars data={weekData} />
          </Card>
        </div>

        {/* Right column */}
        <div className="space-y-4">
          <Card>
            <CardHeader title="Check-in gần đây" subtitle={service.name} />
            <ul className="divide-y divide-[#f3f4f6]">
              {recentUsages.map((u) => (
                <li key={u.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                  <div>
                    <Link
                      href={`/customers/${u.customerId}`}
                      className="font-medium text-[#111827] hover:underline"
                    >
                      {u.customer.fullName}
                    </Link>
                    <div className="text-xs text-[#9ca3af]">
                      {u.visit.visitCode} · {formatDateTime(u.startedAt)}
                    </div>
                  </div>
                  <Badge
                    className={
                      u.status === "ACTIVE"
                        ? "bg-[#ecfdf5] text-[#16a34a]"
                        : "bg-[#f3f4f6] text-[#6b7280]"
                    }
                  >
                    {u.status}
                  </Badge>
                </li>
              ))}
              {recentUsages.length === 0 && (
                <li className="px-5 py-10 text-center text-sm text-[#9ca3af]">Chưa có check-in</li>
              )}
            </ul>
          </Card>

          <Card>
            <CardHeader title="Membership liên quan" subtitle="Plan gồm khu vực này" />
            <ul className="divide-y divide-[#f3f4f6]">
              {activeMemList.map((m) => (
                <li key={m.id} className="px-5 py-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <Link
                      href={`/customers/${m.customerId}`}
                      className="font-medium hover:underline"
                    >
                      {m.customer.fullName}
                    </Link>
                    <Badge className="bg-[#ecfdf5] text-[#16a34a]">ACTIVE</Badge>
                  </div>
                  <div className="mt-0.5 text-xs text-[#9ca3af]">
                    {m.plan.name} · hết hạn {m.expiryDate.toLocaleDateString("vi-VN")}
                  </div>
                </li>
              ))}
              {activeMemList.length === 0 && (
                <li className="px-5 py-10 text-center text-sm text-[#9ca3af]">Không có thẻ active</li>
              )}
            </ul>
            <div className="border-t border-[#f3f4f6] px-5 py-3">
              <Link href="/customers" className="text-sm font-medium text-[#111827] hover:underline">
                Xem khách →
              </Link>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
