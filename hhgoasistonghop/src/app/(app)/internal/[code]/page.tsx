import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { hasInternalAccess, requireInternalAdmin } from "@/lib/internal-access";
import { InternalPasswordForm } from "@/components/internal-password-form";
import { Badge, Card, PageHeader } from "@/components/ui";
import { SALES_PEOPLE, salesPersonLabel } from "@/config/crm.config";
import { displayContractCode } from "@/lib/contract";
import { formatDate } from "@/lib/utils";
import { MembershipPlanTag } from "@/components/membership-plan-tag";

export default async function InternalSalesPersonPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const gate = await requireInternalAdmin();
  if (!gate.ok) {
    return (
      <div>
        <PageHeader title="Nội bộ" description="Chỉ tài khoản Admin được vào mục này" />
        <Card className="mt-4 border-rose-200 bg-rose-50 p-6 text-sm text-rose-900">
          Bạn không có quyền xem mục Internal. Liên hệ admin nếu cần truy cập.
        </Card>
      </div>
    );
  }

  const { code } = await params;
  const person = SALES_PEOPLE.find((s) => s.code === code);
  if (!person) notFound();

  const unlocked = await hasInternalAccess();
  if (!unlocked) {
    return <InternalPasswordForm />;
  }

  const memberships = await prisma.membership.findMany({
    where: { salesPersonCode: code },
    include: {
      customer: { select: { id: true, fullName: true, customerCode: true, phone: true } },
      plan: { select: { planCode: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  const customers = await prisma.customer.findMany({
    where: { salesPersonCode: code },
    select: { id: true, fullName: true, customerCode: true, phone: true },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return (
    <div>
      <PageHeader
        title={`Nội bộ · ${person.name}`}
        description={`Membership do ${person.name} chăm sóc / bán · ${memberships.length} gói`}
        actions={
          <Link
            href="/internal"
            className="text-sm font-medium text-[#111827] underline-offset-2 hover:underline"
          >
            ← 3 sale
          </Link>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2">
        <Card className="p-4">
          <div className="text-xs font-semibold uppercase text-muted">Khách phụ trách</div>
          <div className="mt-2 text-2xl font-semibold">{customers.length}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs font-semibold uppercase text-muted">Membership đã bán</div>
          <div className="mt-2 text-2xl font-semibold">{memberships.length}</div>
        </Card>
      </div>

      <Card>
        <div className="border-b px-5 py-4 text-sm font-semibold">Danh sách membership</div>
        <ul className="divide-y">
          {memberships.map((m) => (
            <li key={m.id} className="px-5 py-4 text-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <Link
                    href={`/customers/${m.customer.id}?tab=membership`}
                    className="font-medium text-[#111827] hover:underline"
                  >
                    {m.customer.fullName}
                  </Link>
                  <div className="mt-0.5 text-xs text-muted">
                    {m.customer.customerCode} · {m.customer.phone}
                  </div>
                </div>
                <Badge
                  className={
                    m.status === "ACTIVE"
                      ? "bg-emerald-100 text-emerald-800"
                      : "bg-slate-100 text-slate-700"
                  }
                >
                  {m.status}
                </Badge>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <MembershipPlanTag planCode={m.plan.planCode} planName={m.plan.name} />
                <span className="text-xs text-muted">
                  {m.membershipCode} · {displayContractCode(m.contractCode)}
                </span>
              </div>
              <div className="mt-1 text-xs text-muted">
                {formatDate(m.startDate)} → {formatDate(m.expiryDate)} · bán{" "}
                {formatDate(m.createdAt)}
              </div>
            </li>
          ))}
          {memberships.length === 0 ? (
            <li className="px-5 py-10 text-center text-sm text-muted">
              Chưa có membership nào gắn {salesPersonLabel(code)}
            </li>
          ) : null}
        </ul>
      </Card>
    </div>
  );
}
