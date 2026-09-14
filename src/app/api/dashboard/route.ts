import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const date = "2026-09-13";

  const [units, closes, expenses, tasks, issues, projects] = await Promise.all([
    prisma.unit.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.dailyClose.findMany({
      where: { date },
      include: { unit: true },
    }),
    prisma.expense.findMany({
      include: { unit: true },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    prisma.task.findMany({
      include: { unit: true, project: true },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.issue.findMany({ orderBy: { createdAt: "desc" }, take: 20 }),
    prisma.project.findMany({ orderBy: { updatedAt: "desc" } }),
  ]);

  const revenue = closes.reduce((s, c) => s + c.revenue, 0);
  const cash = closes.reduce((s, c) => s + c.cashCollected, 0);
  const expenseTotal = expenses.reduce((s, e) => s + e.amount, 0);
  const submitted = closes.length;
  const totalUnits = units.length;

  return NextResponse.json({
    ok: true,
    date,
    summary: {
      revenue,
      cash,
      expenseTotal,
      submitted,
      totalUnits,
      missingUnits: units
        .filter((u) => !closes.some((c) => c.unitId === u.id))
        .map((u) => u.name),
    },
    units,
    dailyCloses: closes,
    expenses,
    tasks,
    issues,
    projects,
  });
}
