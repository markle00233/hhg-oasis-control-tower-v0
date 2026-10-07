import Link from "next/link";
import { Card, PageHeader } from "@/components/ui";
import { SALES_PEOPLE } from "@/config/crm.config";

export function InternalSalesDashboard({
  stats,
}: {
  stats: {
    code: string;
    name: string;
    customerCount: number;
    membershipCount: number;
    activeMembershipCount: number;
  }[];
}) {
  return (
    <div>
      <PageHeader
        title="Nội bộ · NV kinh doanh"
        description="3 sale phụ trách khách · bấm tên để xem danh sách membership đã bán"
      />
      <div className="grid gap-4 sm:grid-cols-3">
        {stats.map((s) => (
          <Link key={s.code} href={`/internal/${s.code}?auth=1`}>
            <Card className="h-full p-5 transition hover:border-[#111827] hover:shadow-md">
              <div className="text-lg font-semibold text-[#111827]">{s.name}</div>
              <div className="mt-1 text-xs text-muted">{s.code}</div>
              <dl className="mt-4 space-y-2 text-sm">
                <div className="flex justify-between gap-2">
                  <dt className="text-muted">Khách phụ trách</dt>
                  <dd className="font-medium">{s.customerCount}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-muted">Membership đã bán</dt>
                  <dd className="font-medium">{s.membershipCount}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-muted">Đang active</dt>
                  <dd className="font-medium text-emerald-700">{s.activeMembershipCount}</dd>
                </div>
              </dl>
              <p className="mt-4 text-xs font-medium text-[#111827]">Xem chi tiết →</p>
            </Card>
          </Link>
        ))}
      </div>
      <p className="mt-4 text-center text-[11px] text-muted">
        Sale trong hệ thống: {SALES_PEOPLE.map((s) => s.name).join(" · ")}. Đổi tên → Settings.
      </p>
    </div>
  );
}
