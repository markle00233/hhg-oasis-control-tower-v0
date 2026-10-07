import { prisma } from "@/lib/prisma";
import { canViewInternal, requireInternalAdmin } from "@/lib/internal-access";
import { InternalPasswordForm } from "@/components/internal-password-form";
import { InternalSalesDashboard } from "@/components/internal-sales-dashboard";
import { SALES_PEOPLE } from "@/config/crm.config";
import { Card, PageHeader } from "@/components/ui";

export default async function InternalPage({
  searchParams,
}: {
  searchParams: Promise<{ auth?: string }>;
}) {
  const gate = await requireInternalAdmin();
  if (!gate.ok) {
    return (
      <div>
        <PageHeader title="Nội bộ" description="Doanh số theo NV kinh doanh — cần được Admin bật quyền Internal" />
        <Card className="mt-4 border-rose-200 bg-rose-50 p-6 text-sm text-rose-900">
          Bạn không có quyền xem mục Internal. Liên hệ admin nếu cần truy cập.
        </Card>
      </div>
    );
  }

  const { auth } = await searchParams;
  if (!(await canViewInternal(auth))) {
    return <InternalPasswordForm redirectTo="/internal?auth=1" />;
  }

  const stats = await Promise.all(
    SALES_PEOPLE.map(async (s) => {
      const [customerCount, membershipCount, activeMembershipCount] = await Promise.all([
        prisma.customer.count({ where: { salesPersonCode: s.code } }),
        prisma.membership.count({ where: { salesPersonCode: s.code } }),
        prisma.membership.count({
          where: { salesPersonCode: s.code, status: "ACTIVE" },
        }),
      ]);
      return {
        code: s.code,
        name: s.name,
        customerCount,
        membershipCount,
        activeMembershipCount,
      };
    })
  );

  return <InternalSalesDashboard stats={stats} />;
}
