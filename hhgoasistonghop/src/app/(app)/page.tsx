import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Card, PageHeader } from "@/components/ui";
import { AREA_COLORS } from "@/config/crm.config";
import { startOfDay, startOfMonth } from "date-fns";
import { ArrowUpRight, ChevronRight } from "lucide-react";
import { DonutProgress } from "@/components/charts";
import { requireFeature } from "@/lib/require-feature";

export default async function DashboardPage() {
  await requireFeature("dashboard");
  const today = startOfDay(new Date());
  const monthStart = startOfMonth(new Date());

  try {
    const services = await prisma.service.findMany({
      where: { status: "ACTIVE" },
      orderBy: { sortOrder: "asc" },
    });

    const [usagesToday, totalCustomers, newMonth] =
      await Promise.all([
        prisma.serviceUsage.groupBy({
          by: ["serviceId"],
          where: { startedAt: { gte: today } },
          _count: true,
        }),
        prisma.customer.count(),
        prisma.customer.count({ where: { createdAt: { gte: monthStart } } }),
      ]);

    const countMap = Object.fromEntries(
      usagesToday.map((u) => [u.serviceId, u._count])
    );
    const checkinsToday = usagesToday.reduce((s, u) => s + u._count, 0);

    return (
      <div>
        <PageHeader
          title="Dashboard"
          description="Chọn khu vực để xem vận hành chi tiết"
        />

        <div className="mb-6 grid gap-4 md:grid-cols-2">
          <Card className="flex items-center gap-4 p-5">
            <DonutProgress
              value={checkinsToday}
              total={Math.max(checkinsToday, 20)}
            />
            <div>
              <div className="text-sm text-[#6b7280]">Check-in hôm nay</div>
              <div className="mt-1 text-[28px] font-semibold tracking-tight">
                {checkinsToday}
                <span className="text-base font-normal text-[#9ca3af]">/20</span>
              </div>
              <div className="text-xs text-[#9ca3af]">Mục tiêu ngày</div>
            </div>
          </Card>

          <Card className="p-5">
            <div className="flex items-start justify-between">
              <div className="text-sm text-[#6b7280]">Tổng khách hàng</div>
              <span className="inline-flex items-center gap-0.5 rounded-full bg-[#ecfdf5] px-2 py-0.5 text-[11px] font-medium text-[#16a34a]">
                <ArrowUpRight className="h-3 w-3" />
                {newMonth} mới
              </span>
            </div>
            <div className="mt-2 text-[28px] font-semibold tracking-tight">
              {totalCustomers}
            </div>
            <div className="mt-1 text-xs text-[#9ca3af]">Toàn khu phức hợp</div>
          </Card>
        </div>

        <div className="mb-3 text-sm font-semibold text-[#111827]">
          {services.length} khu vực
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {services.map((s) => {
            const color = AREA_COLORS[s.code] || "#111827";
            const todayCount = countMap[s.id] || 0;
            return (
              <Link
                key={s.id}
                href={`/areas/${s.code.toLowerCase()}`}
                className="group rounded-2xl border border-[#ececef] bg-white p-5 shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition hover:border-[#d1d5db] hover:shadow-[0_8px_24px_rgba(16,24,40,0.06)]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div
                      className="flex h-10 w-10 items-center justify-center rounded-xl text-sm font-bold text-white"
                      style={{ background: color }}
                    >
                      {s.name.slice(0, 1)}
                    </div>
                    <div>
                      <div className="text-[15px] font-semibold text-[#111827]">
                        {s.name}
                      </div>
                      <div className="font-mono text-[11px] text-[#9ca3af]">
                        {s.code}
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-[#d1d5db] transition group-hover:translate-x-0.5 group-hover:text-[#111827]" />
                </div>

                <div className="mt-5 flex items-end justify-between border-t border-[#f3f4f6] pt-4">
                  <div>
                    <div className="text-[11px] uppercase tracking-wide text-[#9ca3af]">
                      Check-in hôm nay
                    </div>
                    <div className="mt-1 text-2xl font-semibold tabular-nums text-[#111827]">
                      {todayCount}
                    </div>
                  </div>
                  <span className="text-xs font-medium text-[#6b7280] group-hover:text-[#111827]">
                    Mở khu vực
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    );
  } catch (err) {
    console.error("[dashboard] DB error:", err);
    return (
      <div>
        <PageHeader title="Dashboard" description="Lỗi kết nối database" />
        <Card className="p-6">
          <p className="text-sm font-medium text-[#111827]">
            Không đọc được database trên Vercel.
          </p>
          <p className="mt-2 text-sm text-[#6b7280]">
            Vào Vercel → Settings → Environment Variables, cập nhật lại{" "}
            <code className="rounded bg-slate-100 px-1">DATABASE_URL</code> từ
            file Desktop/<strong>vercel-env.txt</strong>, rồi Redeploy.
          </p>
        </Card>
      </div>
    );
  }
}
