import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import type { User } from "@prisma/client";
import { ProjectMemberRole, Prisma } from "@prisma/client";

export const PROJECT_STATUSES = [
  "TODO",
  "DOING",
  "WAITING",
  "BLOCKED",
  "PAUSED",
  "IN_REVIEW",
  "DONE",
] as const;

export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export function normalizeProjectStatus(raw: unknown): ProjectStatus {
  const s = String(raw || "TODO").toUpperCase();
  if ((PROJECT_STATUSES as readonly string[]).includes(s)) {
    return s as ProjectStatus;
  }
  // legacy map
  if (s === "ON_TRACK") return "DOING";
  if (s === "AT_RISK") return "WAITING";
  return "TODO";
}

export function clampProgress(n: unknown): number {
  const v = Number(n);
  if (Number.isNaN(v)) return 0;
  return Math.max(0, Math.min(100, Math.round(v)));
}

export async function logProjectEvent(opts: {
  projectId: string;
  actorUserId?: string | null;
  action: string;
  detail?: string | null;
  oldValue?: string | null;
  newValue?: string | null;
}) {
  await prisma.projectEvent.create({
    data: {
      projectId: opts.projectId,
      actorUserId: opts.actorUserId || null,
      action: opts.action,
      detail: opts.detail || null,
      oldValue: opts.oldValue ?? null,
      newValue: opts.newValue ?? null,
    },
  });
}

export function projectInclude() {
  return {
    unit: true,
    tasks: true,
    decisions: true,
    expenses: true,
    assignedBy: {
      select: { id: true, username: true, displayName: true },
    },
    reviewer: {
      select: { id: true, username: true, displayName: true },
    },
    members: {
      include: {
        user: {
          select: {
            id: true,
            username: true,
            displayName: true,
            systemRole: true,
          },
        },
      },
      orderBy: { createdAt: "asc" as const },
    },
    events: {
      include: {
        actor: {
          select: { id: true, username: true, displayName: true },
        },
      },
      orderBy: { createdAt: "desc" as const },
      take: 50,
    },
    documentLinks: {
      include: { document: true },
      orderBy: { createdAt: "desc" as const },
      take: 40,
    },
  };
}

export type ProjectAccess =
  | { ok: true; role: ProjectMemberRole | "ADMIN"; user: User }
  | { ok: false; error: NextResponse };

export async function getProjectAccess(
  projectId: string
): Promise<ProjectAccess> {
  const gate = await requireAuth();
  if ("error" in gate) return { ok: false, error: gate.error };

  const user = gate.user;
  if (user.systemRole === "SYSTEM_ADMIN") {
    return { ok: true, role: "ADMIN", user };
  }

  const member = await prisma.projectMember.findUnique({
    where: {
      projectId_userId: { projectId, userId: user.id },
    },
  });

  if (member) {
    return { ok: true, role: member.role, user };
  }

  // Reviewer may not be a member — allow read + review actions only
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (
    project?.reviewerUserId === user.id ||
    (!project?.reviewerUserId && project?.assignedByUserId === user.id)
  ) {
    return { ok: true, role: ProjectMemberRole.VIEWER, user };
  }

  // Legacy fallback: owner string matches username/displayName
  if (project?.owner) {
    const o = project.owner.trim().toLowerCase().replace(/\s+/g, "");
    const u = user.username.toLowerCase();
    const d = user.displayName.toLowerCase().replace(/\s+/g, "");
    if (o === u || o === d || o.includes(u) || (d && o.includes(d))) {
      return { ok: true, role: ProjectMemberRole.PRIMARY, user };
    }
  }

  return {
    ok: false,
    error: NextResponse.json({ error: "Không có quyền trên Task này" }, { status: 403 }),
  };
}

/** @deprecated Prefer task-workflow canEditMainTask / canEditWorkPlanStructure — Collaborator is no longer a full editor. */
export function canEditProject(role: ProjectMemberRole | "ADMIN") {
  return role === "ADMIN" || role === ProjectMemberRole.PRIMARY || role === ProjectMemberRole.COLLABORATOR;
}

export function canManageMembers(role: ProjectMemberRole | "ADMIN") {
  return role === "ADMIN" || role === ProjectMemberRole.PRIMARY;
}

/** Access roles that may PATCH something (Main / Work Plan / Step / workflow). */
export function canTouchProject(role: ProjectMemberRole | "ADMIN") {
  return role === "ADMIN" || role === ProjectMemberRole.PRIMARY || role === ProjectMemberRole.COLLABORATOR;
}

export async function ensurePrimaryMember(
  projectId: string,
  userId: string
) {
  await prisma.projectMember.upsert({
    where: { projectId_userId: { projectId, userId } },
    create: {
      projectId,
      userId,
      role: ProjectMemberRole.PRIMARY,
    },
    update: { role: ProjectMemberRole.PRIMARY },
  });
}

export async function findUserByOwnerLabel(label: string) {
  const raw = String(label || "").trim();
  if (!raw) return null;

  const byUsername = await prisma.user.findFirst({
    where: { username: { equals: raw, mode: "insensitive" } },
  });
  if (byUsername) return byUsername;

  const byDisplay = await prisma.user.findFirst({
    where: { displayName: { equals: raw, mode: "insensitive" } },
  });
  if (byDisplay) return byDisplay;

  // Soft match: "Vy" ↔ "VYNGUYEN", ignore spaces/case
  const compact = raw.toLowerCase().replace(/\s+/g, "");
  if (compact.length < 2) return null;
  const candidates = await prisma.user.findMany({
    where: { status: "ACTIVE" },
    take: 200,
  });
  const hits = candidates.filter((u) => {
    const un = u.username.toLowerCase().replace(/\s+/g, "");
    const dn = u.displayName.toLowerCase().replace(/\s+/g, "");
    return (
      un === compact ||
      dn === compact ||
      un.includes(compact) ||
      dn.includes(compact) ||
      compact.includes(un) ||
      (dn.length >= 2 && compact.includes(dn))
    );
  });
  if (hits.length === 1) return hits[0];
  return null;
}

export type JsonValue = Prisma.InputJsonValue;
