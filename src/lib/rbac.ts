import { NextResponse } from "next/server";
import type { Decision, Expense, User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isSystemAdmin } from "@/lib/auth";
import { getProjectAccess, canEditProject } from "@/lib/project-access";

/** Normalize for string identity match (owner / proposer / approver). */
export function normalizePersonKey(raw: unknown): string {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");
}

export function personMatchesUser(
  label: string | null | undefined,
  user: Pick<User, "username" | "displayName">
): boolean {
  if (!label) return false;
  const o = normalizePersonKey(label);
  const u = normalizePersonKey(user.username);
  const d = normalizePersonKey(user.displayName);
  return o === u || (!!d && o === d) || o.includes(u) || (!!d && o.includes(d));
}

/** Finance controls: SYSTEM_ADMIN for now (no FINANCE role in schema yet). */
export function canManageFinance(user: Pick<User, "systemRole">): boolean {
  return isSystemAdmin(user);
}

export async function accessibleProjectIds(user: User): Promise<Set<string> | "ALL"> {
  if (isSystemAdmin(user)) return "ALL";
  const memberships = await prisma.projectMember.findMany({
    where: { userId: user.id },
    select: { projectId: true },
  });
  const ids = new Set(memberships.map((m) => m.projectId));

  // Legacy owner-string projects without membership row
  const owned = await prisma.project.findMany({
    where: {
      OR: [
        { owner: { equals: user.username, mode: "insensitive" } },
        { owner: { equals: user.displayName, mode: "insensitive" } },
      ],
    },
    select: { id: true, owner: true },
  });
  for (const p of owned) {
    if (personMatchesUser(p.owner, user)) ids.add(p.id);
  }
  return ids;
}

export async function canViewExpense(
  user: User,
  expense: Pick<Expense, "linkedProjectId" | "linkedTaskId">
): Promise<boolean> {
  if (canManageFinance(user)) return true;
  if (expense.linkedProjectId) {
    const access = await getProjectAccess(expense.linkedProjectId);
    return access.ok;
  }
  if (expense.linkedTaskId) {
    const task = await prisma.task.findUnique({
      where: { id: expense.linkedTaskId },
      select: { projectId: true },
    });
    if (task?.projectId) {
      const access = await getProjectAccess(task.projectId);
      return access.ok;
    }
  }
  // Unlinked expenses: only finance/admin
  return false;
}

export async function canCreateExpenseOnProject(
  user: User,
  linkedProjectId: string | null | undefined
): Promise<boolean> {
  if (canManageFinance(user)) return true;
  if (!linkedProjectId) {
    // Creating unlinked expense: finance only
    return false;
  }
  const access = await getProjectAccess(linkedProjectId);
  if (!access.ok) return false;
  return canEditProject(access.role);
}

/** Status transitions that change financial control state. */
export function isFinanceStatusChange(status: unknown): boolean {
  const s = String(status || "").toUpperCase();
  return s === "RECONCILED" || s === "LOCKED" || s === "PROVISIONAL";
}

export function canReconcileExpense(user: User): boolean {
  return canManageFinance(user);
}

const RESOLVED = new Set(["APPROVED", "REJECTED", "NEEDS_INFO"]);

export async function canViewDecision(
  user: User,
  d: Pick<
    Decision,
    "proposer" | "approver" | "linkedProjectId" | "linkedTaskId"
  >
): Promise<boolean> {
  if (isSystemAdmin(user)) return true;
  if (personMatchesUser(d.proposer, user) || personMatchesUser(d.approver, user)) {
    return true;
  }
  if (d.linkedProjectId) {
    const access = await getProjectAccess(d.linkedProjectId);
    if (access.ok) return true;
  }
  if (d.linkedTaskId) {
    const task = await prisma.task.findUnique({
      where: { id: d.linkedTaskId },
      select: { projectId: true },
    });
    if (task?.projectId) {
      const access = await getProjectAccess(task.projectId);
      if (access.ok) return true;
    }
  }
  return false;
}

/** Approve / reject / needs-info — admin or named approver only. */
export function canResolveDecision(
  user: User,
  d: Pick<Decision, "approver" | "status">
): boolean {
  if (isSystemAdmin(user)) return true;
  if (RESOLVED.has(String(d.status || "").toUpperCase()) && d.status !== "NEEDS_INFO") {
    // Already terminal — still allow admin only for re-open later; deny standard
  }
  return personMatchesUser(d.approver, user);
}

export function forbidden(message: string) {
  return NextResponse.json({ error: message }, { status: 403 });
}

/** Allowed expense status transitions (no silent downgrade from LOCKED). */
export function nextExpenseStatusAllowed(
  current: string,
  next: string,
  user: User
): boolean {
  if (!canReconcileExpense(user)) return false;
  const c = String(current || "PROVISIONAL").toUpperCase();
  const n = String(next || "").toUpperCase();
  if (c === n) return true;
  if (c === "PROVISIONAL" && n === "RECONCILED") return true;
  if (c === "RECONCILED" && n === "LOCKED") return true;
  // Admin may unlock / reopen with note later — for now only SYSTEM_ADMIN can set any
  if (isSystemAdmin(user) && ["PROVISIONAL", "RECONCILED", "LOCKED"].includes(n)) {
    return true;
  }
  return false;
}
