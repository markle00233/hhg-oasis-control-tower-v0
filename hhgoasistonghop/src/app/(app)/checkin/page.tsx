import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui";
import { CheckinClient } from "@/components/checkin-client";
import { daysUntil } from "@/lib/utils";
import { startOfDay } from "@/lib/attendance";
import { departmentLabel } from "@/config/crm.config";
import { requireFeature } from "@/lib/require-feature";

const ABSENCE_ALERT_DAYS = 15;
const LIST_LIMIT = 200;

export default async function CheckinPage() {
  await requireFeature("checkin");
  const today = startOfDay(new Date());

  const [rawCustomers, services, recent, todayGroups] = await Promise.all([
    prisma.customer.findMany({
      orderBy: { fullName: "asc" },
      take: LIST_LIMIT,
      include: {
        memberships: {
          where: { status: { in: ["ACTIVE", "EXPIRED", "PAUSED"] } },
          include: {
            plan: { include: { services: { include: { service: true } } } },
          },
          orderBy: { expiryDate: "desc" },
        },
        familyGroup: {
          include: {
            owner: { select: { id: true, fullName: true } },
            members: { select: { id: true } },
          },
        },
        customerPromotions: {
          where: { status: "ACTIVE" },
          include: { promotion: { include: { service: true } } },
        },
      },
    }),
    prisma.service.findMany({
      where: { status: "ACTIVE" },
      orderBy: { sortOrder: "asc" },
    }),
    prisma.visit.findMany({
      where: { visitDate: today },
      include: {
        customer: true,
        usages: { include: { service: true } },
        staff: true,
      },
      orderBy: { checkInAt: "desc" },
      take: 80,
    }),
    prisma.visit.groupBy({
      by: ["customerId"],
      where: { visitDate: today },
      _count: { _all: true },
    }),
  ]);
  const todayCountByCustomer = new Map(
    todayGroups.map((row) => [row.customerId, row._count._all])
  );

  return (
    <div>
      <PageHeader
        title="Check-in toàn bộ"
        description="Danh sách hiện sẵn · gõ để lọc · tiến độ gói tải khi chọn khách"
      />
      <CheckinClient
        customers={rawCustomers.map((c) => {
          const active = c.memberships.filter((m) => {
            if (m.status !== "ACTIVE") return false;
            const d = daysUntil(m.expiryDate);
            return d != null && d >= 0;
          });

          const allowedMap = new Map<
            string,
            { id: string; code: string; name: string }
          >();
          for (const m of active) {
            for (const s of m.plan.services) {
              allowedMap.set(s.serviceId, {
                id: s.serviceId,
                code: s.service.code,
                name: s.service.name,
              });
            }
          }
          for (const cp of c.customerPromotions) {
            const svc = cp.promotion.service;
            if (!svc) continue;
            allowedMap.set(svc.id, { id: svc.id, code: svc.code, name: svc.name });
          }
          const allowedServices = [...allowedMap.values()];
          const primary = active[0] || c.memberships[0];

          const daysSinceStart = (() => {
            if (active[0]) {
              const sinceStart = daysUntil(active[0].startDate);
              return sinceStart != null ? Math.max(0, -sinceStart) : null;
            }
            return null;
          })();

          const absentDays = (() => {
            if (!c.lastVisitAt) return daysSinceStart;
            const d = daysUntil(c.lastVisitAt);
            return d != null ? Math.max(0, -d) : null;
          })();

          const checkInCountToday = todayCountByCustomer.get(c.id) || 0;
          const presentToday = checkInCountToday > 0;
          const presentTodayBy = null;

          const familyLabel = c.familyGroup
            ? `Gia đình ${c.familyGroup.owner.fullName} (${c.familyGroup.members.length} người)`
            : null;

          const membershipsProgress = active.map((m) => {
            const start = new Date(m.startDate);
            start.setHours(0, 0, 0, 0);
            const end = new Date(m.expiryDate);
            end.setHours(0, 0, 0, 0);
            const totalDays = Math.max(
              1,
              Math.round((end.getTime() - start.getTime()) / 86400000) || 30
            );
            return {
              id: m.id,
              membershipCode: m.membershipCode,
              planName: m.plan.name,
              planCode: m.plan.planCode,
              totalDays,
              attendedCount: 0,
              remainingDays: Math.max(0, daysUntil(m.expiryDate) ?? 0),
              startDate: m.startDate.toISOString(),
              expiryDate: m.expiryDate.toISOString(),
              checkedInToday: false,
              checkInCountToday: 0,
              serviceIds: m.plan.services.map((ps) => ps.serviceId),
              serviceNames: m.plan.services.map((ps) => ps.service.name),
              days: [] as {
                date: string;
                label: string;
                status: "present" | "absent" | "future";
                times: string[];
              }[],
            };
          });

          return {
            id: c.id,
            customerCode: c.customerCode,
            fullName: c.fullName,
            phone: c.phone,
            lastVisitAt: c.lastVisitAt?.toISOString() ?? null,
            absentDays,
            absenceAlert:
              absentDays != null && absentDays >= ABSENCE_ALERT_DAYS,
            presentToday,
            presentTodayBy,
            checkInCountToday,
            familyLabel,
            membership: primary
              ? {
                  id: primary.id,
                  code: primary.membershipCode,
                  status: primary.status,
                  planName:
                    active.length > 1
                      ? `${active.length} gói active`
                      : primary.plan.name,
                  expiryDate: primary.expiryDate.toISOString(),
                  allowedServiceIds: allowedServices.map((s) => s.id),
                  allowedServices,
                }
              : null,
            membershipsProgress,
          };
        })}
        services={services.map((s) => ({ id: s.id, name: s.name, code: s.code }))}
        recent={recent.map((v) => ({
          id: v.id,
          code: v.visitCode,
          customerCode: v.customer.customerCode,
          name: v.customer.fullName,
          services: v.usages.map((u) => ({
            code: u.service.code,
            name: u.service.name,
          })),
          at: v.checkInAt.toISOString(),
          staff: v.staff
            ? `${v.staff.fullName} (${departmentLabel(v.staff.department)})`
            : null,
        }))}
      />
    </div>
  );
}
