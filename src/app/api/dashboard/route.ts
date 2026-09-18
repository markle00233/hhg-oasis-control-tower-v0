import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const date = "2026-09-13";

  const [
    units,
    closes,
    expenses,
    tasks,
    issues,
    projects,
    decisions,
    messages,
  ] = await Promise.all([
    prisma.unit.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.dailyClose.findMany({
      where: { date },
      include: { unit: true },
    }),
    prisma.expense.findMany({
      include: { unit: true, linkedTask: true },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.task.findMany({
      include: {
        unit: true,
        project: true,
        events: { orderBy: { createdAt: "desc" }, take: 8 },
        decisions: true,
      },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.issue.findMany({ orderBy: { createdAt: "desc" }, take: 20 }),
    prisma.project.findMany({
      include: { unit: true, tasks: true, decisions: true },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.decision.findMany({
      include: {
        linkedTask: true,
        linkedProject: true,
      },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.messageInbox.findMany({
      include: { drafts: { orderBy: { createdAt: "asc" } } },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
  ]);

  const revenue = closes.reduce((s, c) => s + c.revenue, 0);
  const cash = closes.reduce((s, c) => s + c.cashCollected, 0);
  const expenseTotal = expenses.reduce((s, e) => s + e.amount, 0);
  const provisional = expenses
    .filter((e) => e.status === "PROVISIONAL")
    .reduce((s, e) => s + e.amount, 0);
  const reconciled = expenses
    .filter((e) => e.status === "RECONCILED" || e.status === "LOCKED")
    .reduce((s, e) => s + e.amount, 0);
  const linkedExpense = expenses
    .filter((e) => e.linkedTaskId)
    .reduce((s, e) => s + e.amount, 0);

  return NextResponse.json({
    ok: true,
    date,
    summary: {
      revenue,
      cash,
      expenseTotal,
      provisional,
      reconciled,
      linkedExpense,
      submitted: closes.length,
      totalUnits: units.length,
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
    decisions,
    messages,
  });
}
