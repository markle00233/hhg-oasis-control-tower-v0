import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, isSystemAdmin } from "@/lib/auth";
import {
  accessibleProjectIds,
  canManageFinance,
  canViewDecision,
  personMatchesUser,
} from "@/lib/rbac";

export async function GET(req: NextRequest) {
  const gate = await requireAuth();
  if ("error" in gate) return gate.error;

  const url = new URL(req.url);
  const dateParam = url.searchParams.get("date");

  const latestClose = await prisma.dailyClose.findFirst({
    orderBy: { date: "desc" },
    select: { date: true },
  });
  const date =
    dateParam ||
    latestClose?.date ||
    new Date().toISOString().slice(0, 10);

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
      orderBy: { updatedAt: "desc" },
    }),
    prisma.expense.findMany({
      include: { unit: true, linkedTask: true, linkedProject: true },
      orderBy: { createdAt: "desc" },
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
    prisma.issue.findMany({ orderBy: { createdAt: "desc" }, take: 50 }),
    prisma.project.findMany({
      include: {
        unit: true,
        tasks: true,
        decisions: true,
        expenses: true,
        members: {
          include: {
            user: {
              select: { id: true, username: true, displayName: true },
            },
          },
        },
        events: {
          include: {
            actor: { select: { id: true, username: true, displayName: true } },
          },
          orderBy: { createdAt: "desc" },
          take: 20,
        },
        documentLinks: { include: { document: true }, take: 20 },
      },
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

  const user = gate.user;
  const admin = isSystemAdmin(user);
  const finance = canManageFinance(user);
  const projectScope = await accessibleProjectIds(user);

  let scopedProjects = projects;
  let scopedExpenses = expenses;
  let scopedDecisions = decisions;
  let scopedTasks = tasks;

  if (!admin) {
    scopedProjects = projects.filter((p) => {
      if (projectScope !== "ALL" && projectScope.has(p.id)) return true;
      return personMatchesUser(p.owner, user);
    });
    const allowed = new Set(scopedProjects.map((p) => p.id));

    scopedExpenses = finance
      ? expenses
      : expenses.filter((e) => {
          if (e.linkedProjectId && allowed.has(e.linkedProjectId)) return true;
          if (e.linkedTask?.projectId && allowed.has(e.linkedTask.projectId)) return true;
          return false;
        });

    scopedDecisions = [];
    for (const d of decisions) {
      if (await canViewDecision(user, d)) scopedDecisions.push(d);
    }

    scopedTasks = tasks.filter(
      (t) => !t.projectId || allowed.has(t.projectId)
    );
  }

  const expenseTotal = scopedExpenses.reduce((s, e) => s + e.amount, 0);
  const provisional = scopedExpenses
    .filter((e) => e.status === "PROVISIONAL")
    .reduce((s, e) => s + e.amount, 0);
  const reconciled = scopedExpenses
    .filter((e) => e.status === "RECONCILED" || e.status === "LOCKED")
    .reduce((s, e) => s + e.amount, 0);
  const lockedExpense = scopedExpenses
    .filter((e) => e.status === "LOCKED")
    .reduce((s, e) => s + e.amount, 0);
  const linkedExpense = scopedExpenses
    .filter((e) => e.linkedTaskId || e.linkedProjectId)
    .reduce((s, e) => s + e.amount, 0);

  const revenue = closes.reduce((s, c) => s + c.revenue, 0);
  const cash = closes.reduce((s, c) => s + c.cashCollected, 0);
  const confirmedCloses = closes.filter(
    (c) => c.status === "RECONCILED" || c.status === "LOCKED"
  ).length;

  return NextResponse.json({
    ok: true,
    date,
    summary: {
      revenue,
      cash,
      expenseTotal,
      provisional,
      reconciled,
      lockedExpense,
      linkedExpense,
      submitted: closes.length,
      confirmedCloses,
      totalUnits: units.length,
      missingUnits: units
        .filter((u) => !closes.some((c) => c.unitId === u.id))
        .map((u) => u.name),
    },
    units,
    dailyCloses: closes,
    expenses: scopedExpenses,
    tasks: scopedTasks,
    issues,
    projects: scopedProjects,
    decisions: scopedDecisions,
    messages: admin ? messages : [],
    capabilities: {
      canReconcileExpense: finance,
      canResolveAnyDecision: admin,
      isAdmin: admin,
    },
  });
}
