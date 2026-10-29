import { prisma } from "@/lib/prisma";

/** Active CRM membership keyed by phoneNormalized. */
export async function activeCrmMemberships(phones: string[]) {
  const map = new Map<string, { planLabel: string; expiresAt: Date | null }>();
  const unique = [
    ...new Set(phones.map((p) => String(p || "").trim()).filter((p) => p.length >= 9)),
  ];
  if (!unique.length) return map;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  try {
    const members = await prisma.crmCustomer.findMany({
      where: {
        phoneNormalized: { in: unique },
        memberships: {
          some: { status: "ACTIVE", expiryDate: { gte: today } },
        },
      },
      select: {
        phoneNormalized: true,
        memberships: {
          where: { status: "ACTIVE", expiryDate: { gte: today } },
          orderBy: { expiryDate: "desc" },
          take: 1,
          select: {
            expiryDate: true,
            plan: { select: { name: true, planCode: true } },
          },
        },
      },
    });
    for (const row of members) {
      const mem = row.memberships[0];
      if (!mem) continue;
      map.set(row.phoneNormalized, {
        planLabel: mem.plan?.name || mem.plan?.planCode || "Hội viên",
        expiresAt: mem.expiryDate,
      });
    }
  } catch {
    /* CRM tables may be empty */
  }
  return map;
}
