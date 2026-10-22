import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionCustomer } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Buổi / lượt tự chọn còn lại, khớp SĐT tài khoản với quầy học bơi. */
export async function GET() {
  const customer = await getSessionCustomer();
  if (!customer) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const phone = String(customer.phoneNormalized || "").trim();
  if (!phone) {
    return NextResponse.json({ ok: true, lessons: [] });
  }

  const rows = await prisma.appSwimStudent.findMany({
    where: { phoneNormalized: phone },
    select: {
      id: true,
      packageLabel: true,
      sessionsTotal: true,
      sessionsLeft: true,
      bonusVisitsTotal: true,
      bonusVisitsLeft: true,
      status: true,
      updatedAt: true,
    },
    orderBy: { updatedAt: "desc" },
    take: 12,
  });

  const rank: Record<string, number> = { ACTIVE: 0, PAUSED: 1, DONE: 2 };
  const lessons = rows
    .slice()
    .sort((a, b) => (rank[a.status] ?? 9) - (rank[b.status] ?? 9))
    .map((row) => ({
      id: row.id,
      packageLabel: row.packageLabel,
      sessionsTotal: row.sessionsTotal,
      sessionsLeft: row.sessionsLeft,
      bonusVisitsTotal: row.bonusVisitsTotal,
      bonusVisitsLeft: row.bonusVisitsLeft,
      status: row.status,
    }));

  return NextResponse.json({ ok: true, lessons });
}
