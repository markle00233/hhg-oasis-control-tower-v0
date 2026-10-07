import { Card, PageHeader } from "@/components/ui";
import { formatDateTime } from "@/lib/utils";
import type { AccountDayStats } from "@/lib/static-stats";

export function StaticDayDashboard({ stats }: { stats: AccountDayStats }) {
  const totalMoves = stats.buckets.reduce((s, b) => s + b.count, 0);

  return (
    <div>
      <PageHeader
        title="Static · hôm nay"
        description={`Chỉ tài khoản ${stats.accountName} (${stats.accountEmail}) · ${stats.dateLabel} · không gồm thao tác acc kia`}
      />

      <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950">
        Hôm nay bạn có <strong>{totalMoves}</strong> thay đổi được ghi nhận trên acc này.
        Dashboard / danh sách khách vẫn thấy dữ liệu chung của cả hệ thống.
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {stats.buckets.map((b) => (
          <Card key={b.key} className="p-4">
            <div className="text-xs font-semibold uppercase text-muted">{b.label}</div>
            <div className="mt-2 text-2xl font-semibold tabular-nums">{b.count}</div>
          </Card>
        ))}
      </div>

      <Card>
        <div className="border-b px-5 py-4 text-sm font-semibold">
          Nhật ký thay đổi hôm nay ({stats.activities.length})
        </div>
        <ul className="divide-y">
          {stats.activities.map((a) => (
            <li key={a.id} className="px-5 py-3 text-sm">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div className="font-medium text-[#111827]">{a.title}</div>
                <div className="text-[11px] text-muted">{formatDateTime(a.at)}</div>
              </div>
              {a.detail ? (
                <p className="mt-0.5 text-xs text-muted">{a.detail}</p>
              ) : null}
              <p className="mt-1 text-[10px] uppercase tracking-wide text-[#9ca3af]">
                {a.kind}
              </p>
            </li>
          ))}
          {stats.activities.length === 0 ? (
            <li className="px-5 py-10 text-center text-sm text-muted">
              Hôm nay acc này chưa có thao tác nào.
            </li>
          ) : null}
        </ul>
      </Card>
    </div>
  );
}
