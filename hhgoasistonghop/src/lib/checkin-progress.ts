"use server";

import { departmentLabel } from "@/config/crm.config";
import {
  buildDaySegments,
  formatVisitLabel,
  startOfDay,
  toDateKey,
  visitsByDateForMembership,
} from "@/lib/attendance";
import { auth, sessionHasFeature } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { daysUntil } from "@/lib/utils";

const ABSENCE_WINDOW_DAYS = 40;

export async function loadCheckinProgress(customerId: string) {
  const session = await auth();
  if (!session?.user) return { ok: false as const, error: "Unauthorized" };
  if (!sessionHasFeature(session, "checkin")) {
    return { ok: false as const, error: "Không có quyền check-in" };
  }
  if (!customerId) return { ok: false as const, error: "Thiếu khách" };

  const earliest = new Date();
  earliest.setDate(earliest.getDate() - ABSENCE_WINDOW_DAYS);
  const today = startOfDay(new Date());

  const [memberships, visits] = await Promise.all([
    prisma.membership.findMany({
      where: {
        customerId,
        status: { in: ["ACTIVE", "EXPIRED", "PAUSED"] },
      },
      include: {
        plan: { include: { services: { include: { service: true } } } },
      },
      orderBy: { expiryDate: "desc" },
    }),
    prisma.visit.findMany({
      where: { customerId, visitDate: { gte: earliest } },
      orderBy: { checkInAt: "asc" },
      select: {
        visitDate: true,
        checkInAt: true,
        membershipId: true,
        note: true,
        staff: { select: { fullName: true, department: true } },
        usages: { select: { service: { select: { name: true } } } },
      },
    }),
  ]);

  const active = memberships.filter((m) => {
    if (m.status !== "ACTIVE") return false;
    const d = daysUntil(m.expiryDate);
    return d != null && d >= 0;
  });

  const todayVisits = visits.filter((v) => toDateKey(v.visitDate) === toDateKey(today));
  const presentTodayBy =
    todayVisits.length > 0
      ? todayVisits
          .map((v) => {
            const who = v.staff?.fullName || "nhân viên";
            const dept = v.staff?.department
              ? ` (${departmentLabel(v.staff.department)})`
              : "";
            return `${formatVisitLabel(v)} · ${who}${dept}`;
          })
          .join(" · ")
      : null;

  return {
    ok: true as const,
    checkInCountToday: todayVisits.length,
    presentTodayBy,
    membershipsProgress: active.map((m) => {
      const built = buildDaySegments(
        m.startDate,
        m.expiryDate,
        visitsByDateForMembership(visits, {
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
        serviceNames: m.plan.services.map((ps) => ps.service.name),
        days: built.days,
      };
    }),
  };
}
