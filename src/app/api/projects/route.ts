import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, isSystemAdmin } from "@/lib/auth";
import {
  findUserByOwnerLabel,
  projectInclude,
} from "@/lib/project-access";
import {
  deriveQuadrant,
  legacyPriorityToMatrix,
  matrixToLegacyPriority,
  viewerContext,
} from "@/lib/task-workflow";
import { computeDeadlineRisk } from "@/lib/task-risk";

export async function GET(req: NextRequest) {
  const gate = await requireAuth();
  if ("error" in gate) return gate.error;

  const url = new URL(req.url);
  const scope = url.searchParams.get("scope"); // mine | collab | all | review

  const include = {
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
    },
  };

  let projects = await prisma.project.findMany({
    include,
    orderBy: { updatedAt: "desc" },
  });

  if (scope === "review") {
    projects = projects.filter(
      (p) =>
        p.status === "IN_REVIEW" &&
        (isSystemAdmin(gate.user) ||
          p.reviewerUserId === gate.user.id ||
          (!p.reviewerUserId && p.assignedByUserId === gate.user.id))
    );
  } else if (gate.user.systemRole !== "SYSTEM_ADMIN") {
    const uid = gate.user.id;
    const username = gate.user.username.toLowerCase();
    const display = gate.user.displayName.toLowerCase().replace(/\s+/g, "");
    projects = projects.filter((p) => {
      const isMember = p.members.some((m) => m.userId === uid);
      const isReviewer =
        p.reviewerUserId === uid ||
        (!p.reviewerUserId && p.assignedByUserId === uid);
      const owner = String(p.owner || "")
        .toLowerCase()
        .replace(/\s+/g, "");
      const isOwner =
        owner &&
        (owner === username ||
          owner === display ||
          owner.includes(username) ||
          (display && owner.includes(display)));
      if (scope === "mine") {
        // Inbox: PRIMARY + COLLABORATOR (không chỉ owner chính)
        return isMember || !!isOwner;
      }
      if (scope === "collab") {
        return p.members.some(
          (m) => m.userId === uid && m.role === "COLLABORATOR"
        );
      }
      return isMember || !!isOwner || isReviewer;
    });
  }

  const enriched = projects.map((p) => {
    const important =
      p.important != null
        ? !!p.important
        : legacyPriorityToMatrix(p.priority).important;
    const urgent =
      p.urgent != null ? !!p.urgent : legacyPriorityToMatrix(p.priority).urgent;
    const ctx = viewerContext(gate.user, p);
    ctx.quadrant = deriveQuadrant(important, urgent);
    const risk = computeDeadlineRisk(p);
    return {
      ...p,
      important,
      urgent,
      quadrant: ctx.quadrant,
      deadlineRisk: risk.risk,
      deadlineRiskReason: risk.reason,
      remainingWorkMinutes: risk.remainingMinutes,
      availableWorkMinutes: risk.availableMinutes,
      workPlanProgress: ctx.progress,
      currentStep: ctx.currentStep,
      viewerContext: ctx,
    };
  });

  return NextResponse.json(enriched);
}

export async function POST(req: NextRequest) {
  const gate = await requireAuth();
  if ("error" in gate) return gate.error;

  const body = await req.json();
  const {
    name,
    category,
    owner,
    ownerUserId,
    description,
    priority = "P2",
    budget,
    deadline,
    readiness = 0,
    unitName,
    collaboratorUserIds = [],
    reviewerUserId,
    important,
    urgent,
    expectedResult,
    proofRequired,
    proofDescription,
    estimatedDurationMinutes,
  } = body;

  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  // Non-admin: owner must be self
  let ownerLabel = String(owner || "").trim();
  if (!isSystemAdmin(gate.user)) {
    ownerLabel = gate.user.displayName || gate.user.username;
  }

  let unitId: string | undefined;
  if (unitName) {
    const unit = await prisma.unit.findUnique({ where: { name: unitName } });
    unitId = unit?.id;
  }

  let primaryUser = gate.user;
  if (isSystemAdmin(gate.user) && ownerUserId) {
    const byId = await prisma.user.findUnique({
      where: { id: String(ownerUserId) },
    });
    if (!byId || byId.status === "DISABLED") {
      return NextResponse.json(
        { error: "Owner không hợp lệ — chọn lại người phụ trách." },
        { status: 400 }
      );
    }
    primaryUser = byId;
    ownerLabel = byId.displayName || byId.username;
  } else if (ownerLabel) {
    const resolved = await findUserByOwnerLabel(ownerLabel);
    if (resolved) {
      primaryUser = resolved;
      ownerLabel = resolved.displayName || resolved.username;
    } else if (isSystemAdmin(gate.user)) {
      // Never silently assign to Admin — staff sẽ không thấy task
      return NextResponse.json(
        {
          error: `Không tìm thấy user cho Owner "${ownerLabel}". Chọn đúng tên trong danh sách Leaders.`,
        },
        { status: 400 }
      );
    }
  } else if (isSystemAdmin(gate.user)) {
    return NextResponse.json(
      { error: "Chọn Owner (người phụ trách) trước khi giao task." },
      { status: 400 }
    );
  }

  let reviewerId: string | null = gate.user.id;
  if (reviewerUserId) {
    if (!isSystemAdmin(gate.user) && String(reviewerUserId) !== gate.user.id) {
      return NextResponse.json(
        { error: "Chỉ Admin mới chỉ định Reviewer khác" },
        { status: 403 }
      );
    }
    const rev = await prisma.user.findUnique({
      where: { id: String(reviewerUserId) },
    });
    if (!rev) {
      return NextResponse.json({ error: "Reviewer không tồn tại" }, { status: 400 });
    }
    reviewerId = rev.id;
  }

  const matrix =
    important != null && urgent != null
      ? { important: !!important, urgent: !!urgent }
      : legacyPriorityToMatrix(String(priority));

  // Keep legacy priority in sync for old UI filters
  const legacyPriority = matrixToLegacyPriority(matrix.important, matrix.urgent);

  const proofReq =
    proofRequired != null ? !!proofRequired : true;

  const est =
    estimatedDurationMinutes === null || estimatedDurationMinutes === undefined || estimatedDurationMinutes === ""
      ? null
      : Math.max(0, Math.round(Number(estimatedDurationMinutes)) || 0);

  const saved = await prisma.project.create({
    data: {
      name: String(name).trim(),
      category: category || null,
      owner: ownerLabel,
      description: description ? String(description).trim() : null,
      priority: legacyPriority,
      budget: budget != null && budget !== "" ? Number(budget) : null,
      deadline: deadline || null,
      readiness: Number(readiness) || 0,
      status: "TODO", // always TODO on Assign — no free status
      unitId,
      assignedByUserId: gate.user.id,
      reviewerUserId: reviewerId,
      important: matrix.important,
      urgent: matrix.urgent,
      expectedResult: expectedResult
        ? String(expectedResult).trim().slice(0, 2000)
        : null,
      proofRequired: proofReq,
      requireAfterProof: proofReq,
      proofDescription: proofDescription
        ? String(proofDescription).trim().slice(0, 1000)
        : null,
      estimatedDurationMinutes: est,
      members: {
        create: [
          {
            userId: primaryUser.id,
            role: "PRIMARY",
          },
          ...((collaboratorUserIds as string[]) || [])
            .filter((id) => id && id !== primaryUser.id)
            .slice(0, 20)
            .map((userId) => ({
              userId,
              role: "COLLABORATOR" as const,
            })),
        ],
      },
      events: {
        create: {
          action: "TASK_ASSIGNED",
          detail: "Assign Task",
          actorUserId: gate.user.id,
          newValue: String(name).trim(),
        },
      },
    },
    include: projectInclude(),
  });

  const ctx = viewerContext(gate.user, saved);
  ctx.quadrant = deriveQuadrant(matrix.important, matrix.urgent);

  return NextResponse.json(
    {
      ...saved,
      important: matrix.important,
      urgent: matrix.urgent,
      quadrant: ctx.quadrant,
      viewerContext: ctx,
    },
    { status: 201 }
  );
}
