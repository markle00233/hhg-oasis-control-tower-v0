import { prisma } from "@/lib/prisma";
import { startOfDay } from "@/lib/attendance";

export type DayStatBucket = {
  key: string;
  label: string;
  count: number;
};

export type DayActivityItem = {
  id: string;
  at: string;
  title: string;
  detail: string | null;
  kind: string;
};

export type AccountDayStats = {
  accountEmail: string;
  accountName: string;
  dateLabel: string;
  buckets: DayStatBucket[];
  activities: DayActivityItem[];
  totals: {
    customers: number;
    memberships: number;
    checkIns: number;
    notes: number;
    promotions: number;
    family: number;
    other: number;
  };
};

function endOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

export async function getAccountDayStats(userId: string): Promise<AccountDayStats> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, fullName: true },
  });
  const today = startOfDay(new Date());
  const tomorrow = endOfDay(today);

  const [activities, memberships, visits, notes, promos] = await Promise.all([
    prisma.activityLog.findMany({
      where: {
        staffId: userId,
        occurredAt: { gte: today, lte: tomorrow },
      },
      orderBy: { occurredAt: "desc" },
      take: 300,
    }),
    prisma.membership.findMany({
      where: {
        createdById: userId,
        createdAt: { gte: today, lte: tomorrow },
      },
      include: {
        customer: { select: { fullName: true, customerCode: true } },
        plan: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.visit.findMany({
      where: {
        staffId: userId,
        visitDate: today,
      },
      include: {
        customer: { select: { fullName: true, customerCode: true } },
        usages: { include: { service: { select: { name: true } } } },
      },
      orderBy: { checkInAt: "desc" },
    }),
    prisma.customerNote.findMany({
      where: {
        authorId: userId,
        createdAt: { gte: today, lte: tomorrow },
      },
      include: { customer: { select: { fullName: true, customerCode: true } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.customerPromotion.findMany({
      where: {
        assignedById: userId,
        createdAt: { gte: today, lte: tomorrow },
      },
      include: {
        customer: { select: { fullName: true, customerCode: true } },
        promotion: { select: { code: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const customers = activities.filter((a) => a.activityType === "CUSTOMER_CREATED").length;
  const family = activities.filter((a) =>
    a.activityType === "FAMILY_CREATED" || a.activityType === "FAMILY_MEMBER_ADDED"
  ).length;
  const membershipFromLog = activities.filter(
    (a) =>
      a.activityType === "MEMBERSHIP_REGISTERED" ||
      a.activityType === "MEMBERSHIP_RENEWED"
  ).length;
  const checkInFromLog = activities.filter((a) => a.activityType === "CHECK_IN").length;
  const noteFromLog = activities.filter((a) => a.activityType === "NOTE").length;

  const membershipCount = Math.max(memberships.length, membershipFromLog);
  const checkInCount = Math.max(visits.length, checkInFromLog);
  const noteCount = Math.max(notes.length, noteFromLog);
  const promoCount = promos.length;

  const other = activities.filter(
    (a) =>
      ![
        "CUSTOMER_CREATED",
        "FAMILY_CREATED",
        "FAMILY_MEMBER_ADDED",
        "MEMBERSHIP_REGISTERED",
        "MEMBERSHIP_RENEWED",
        "CHECK_IN",
        "NOTE",
      ].includes(a.activityType)
  ).length;

  const buckets: DayStatBucket[] = [
    { key: "customers", label: "Khách mới tạo", count: customers },
    { key: "memberships", label: "Đăng ký / gia hạn gói", count: membershipCount },
    { key: "checkIns", label: "Check-in", count: checkInCount },
    { key: "notes", label: "Ghi chú", count: noteCount },
    { key: "promotions", label: "Gắn promotion", count: promoCount },
    { key: "family", label: "Gia đình (tạo / thêm TV)", count: family },
    { key: "other", label: "Thay đổi khác", count: other },
  ];

  const items: DayActivityItem[] = [];

  for (const a of activities) {
    items.push({
      id: `act-${a.id}`,
      at: a.occurredAt.toISOString(),
      title: a.title,
      detail: a.note,
      kind: a.activityType,
    });
  }
  for (const m of memberships) {
    const already = activities.some(
      (a) =>
        (a.activityType === "MEMBERSHIP_REGISTERED" ||
          a.activityType === "MEMBERSHIP_RENEWED") &&
        a.note?.includes(m.membershipCode)
    );
    if (!already) {
      items.push({
        id: `mem-${m.id}`,
        at: m.createdAt.toISOString(),
        title: `Membership · ${m.plan.name}`,
        detail: `${m.customer.fullName} (${m.customer.customerCode}) · ${m.membershipCode}`,
        kind: "MEMBERSHIP",
      });
    }
  }
  for (const v of visits) {
    const svc = v.usages.map((u) => u.service.name).join(", ");
    items.push({
      id: `vis-${v.id}`,
      at: v.checkInAt.toISOString(),
      title: `Check-in · ${v.customer.fullName}`,
      detail: `${v.visitCode}${svc ? ` · ${svc}` : ""}`,
      kind: "CHECK_IN",
    });
  }
  for (const n of notes) {
    items.push({
      id: `note-${n.id}`,
      at: n.createdAt.toISOString(),
      title: `Ghi chú · ${n.customer.fullName}`,
      detail: n.content.slice(0, 120),
      kind: "NOTE",
    });
  }
  for (const p of promos) {
    items.push({
      id: `promo-${p.id}`,
      at: p.createdAt.toISOString(),
      title: `Promotion · ${p.promotion.name}`,
      detail: `${p.customer.fullName} · ${p.promotion.code}`,
      kind: "PROMOTION",
    });
  }

  items.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  // Dedupe near-identical check-in lines from activity + visit
  const seen = new Set<string>();
  const activitiesDeduped = items.filter((it) => {
    const key = `${it.kind}|${it.title}|${it.detail}|${it.at.slice(0, 16)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return {
    accountEmail: user?.email || "",
    accountName: user?.fullName || "",
    dateLabel: today.toLocaleDateString("vi-VN"),
    buckets,
    activities: activitiesDeduped.slice(0, 200),
    totals: {
      customers,
      memberships: membershipCount,
      checkIns: checkInCount,
      notes: noteCount,
      promotions: promoCount,
      family,
      other,
    },
  };
}
