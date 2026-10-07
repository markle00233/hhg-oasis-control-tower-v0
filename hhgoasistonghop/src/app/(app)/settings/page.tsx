import { prisma } from "@/lib/prisma";
import { Badge, Card, CardHeader, PageHeader } from "@/components/ui";
import { redirect } from "next/navigation";
import { ROLES, MEMBERSHIP_PACKAGES, departmentLabel, SALES_PEOPLE } from "@/config/crm.config";
import { CreatePlanForm } from "@/components/create-plan-form";
import { ServiceTag } from "@/components/service-tag";
import { PackageNumberBadge } from "@/components/package-number-badge";
import { requireFeature } from "@/lib/require-feature";

export default async function SettingsPage() {
  const session = await requireFeature("settings");
  if (!session?.user) redirect("/login");

  const [users, plans, services, planList] = await Promise.all([
    prisma.user.findMany({ orderBy: { fullName: "asc" } }),
    prisma.membershipPlan.count({ where: { status: "ACTIVE" } }),
    prisma.service.count({ where: { status: "ACTIVE" } }),
    session.user.role === "ADMIN"
      ? prisma.membershipPlan.findMany({
          where: { status: "ACTIVE" },
          include: { services: { include: { service: true } } },
        })
      : Promise.resolve([]),
  ]);

  const packageOrder = MEMBERSHIP_PACKAGES.map((p) => p.code);
  const sortedPlans = [...planList].sort((a, b) => {
    const ia = packageOrder.indexOf(a.planCode as (typeof packageOrder)[number]);
    const ib = packageOrder.indexOf(b.planCode as (typeof packageOrder)[number]);
    return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
  });

  const serviceOptions =
    session.user.role === "ADMIN"
      ? await prisma.service.findMany({
          where: { status: "ACTIVE" },
          orderBy: { sortOrder: "asc" },
        })
      : [];

  return (
    <div>
      <PageHeader
        title="Settings"
        description={
          session.user.role === "ADMIN"
            ? "Quản trị hệ thống V1"
            : "Chỉ Admin được đổi cấu hình quan trọng"
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Roles V1" />
          <div className="divide-y">
            {ROLES.map((r) => (
              <div key={r.value} className="px-5 py-3 text-sm">
                <div className="font-medium">{r.label}</div>
                <div className="text-xs text-muted">
                  {r.value === "ADMIN" && "Toàn quyền · xóa khách · cấu hình"}
                  {r.value === "MANAGER" && "Xem toàn bộ · không đổi cấu hình"}
                  {r.value === "STAFF" &&
                    "User vận hành: tạo khách, check-in (nhiều lần/ngày), đăng ký gói, gia hạn, promotion"}
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <CardHeader title="Users" />
          <div className="divide-y">
            {users.map((u) => (
              <div key={u.id} className="flex items-center justify-between px-5 py-3 text-sm">
                <div>
                  <div className="font-medium">{u.fullName}</div>
                  <div className="text-xs text-muted">
                    {u.email} · {departmentLabel(u.department)}
                  </div>
                </div>
                <Badge className="bg-slate-100">{u.role}</Badge>
              </div>
            ))}
          </div>
          <p className="border-t px-5 py-3 text-[11px] text-muted">
            Acc vận hành: <strong>27/56a</strong>, <strong>55/62</strong> · Chỉ xem:{" "}
            <strong>viewer1</strong>, <strong>viewer2</strong> · Admin:{" "}
            <strong>namanhadministrattion</strong> (mục Nội bộ).
          </p>
        </Card>

        <Card>
          <CardHeader
            title="NV kinh doanh (Sale)"
            subtitle="Chọn khi tạo khách / đăng ký gói · xem chi tiết ở menu Nội bộ"
          />
          <div className="divide-y">
            {SALES_PEOPLE.map((s) => (
              <div key={s.code} className="flex items-center justify-between px-5 py-3 text-sm">
                <div>
                  <div className="font-medium">{s.name}</div>
                  <div className="text-xs text-muted">{s.code}</div>
                </div>
              </div>
            ))}
          </div>
          <p className="border-t px-5 py-3 text-[11px] text-muted">
            Muốn đổi tên Anh A/B/C → báo admin (sửa danh sách SALES_PEOPLE trong cấu hình).
          </p>
        </Card>

        {session.user.role === "ADMIN" && (
          <>
            <Card className="lg:col-span-2">
              <CardHeader
                title="12 gói membership (HHG Oasis)"
                subtitle="Mỗi loại đánh số 1–4 · xanh Bơi · cam Pick · tím VIP"
              />
              <div className="divide-y">
                {sortedPlans.map((p) => (
                  <div key={p.id} className="px-5 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <PackageNumberBadge planCode={p.planCode} />
                      <div className="font-medium">{p.name}</div>
                      <span className="text-xs text-muted">{p.durationDays} ngày</span>
                    </div>
                    <div className="mt-1 text-xs text-muted">{p.description}</div>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {p.services.map((s) => (
                        <ServiceTag
                          key={s.serviceId}
                          code={s.service.code}
                          name={s.service.name}
                        />
                      ))}
                    </div>
                  </div>
                ))}
                {sortedPlans.length === 0 && (
                  <p className="px-5 py-4 text-sm text-muted">Chưa có plan</p>
                )}
              </div>
            </Card>
            <Card className="p-5 lg:col-span-2">
              <h3 className="mb-3 text-sm font-semibold">Tạo Membership Plan thêm</h3>
              <CreatePlanForm
                services={serviceOptions.map((s) => ({ id: s.id, name: s.name }))}
              />
            </Card>
          </>
        )}

        <Card className="p-5 lg:col-span-2">
          <h3 className="text-sm font-semibold">Hệ thống</h3>
          <p className="mt-2 text-sm text-muted">
            {services} services · {plans} membership plans · Stack: Next.js + Prisma + SQLite
          </p>
          <p className="mt-1 text-xs text-muted">
            V1 scope: Customer · Service · Membership · Visit · Service Usage · Check-in · Journey ·
            Dashboard
          </p>
        </Card>
      </div>
    </div>
  );
}
