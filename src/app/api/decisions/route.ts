import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { canViewDecision, forbidden } from "@/lib/rbac";

async function nextDecisionCode() {
  const count = await prisma.decision.count();
  return `QD-${String(count + 1).padStart(4, "0")}`;
}

export async function GET() {
  const gate = await requireAuth();
  if ("error" in gate) return gate.error;

  const decisions = await prisma.decision.findMany({
    include: {
      linkedTask: { include: { unit: true, project: true } },
      linkedProject: true,
    },
    orderBy: { updatedAt: "desc" },
  });

  const visible = [];
  for (const d of decisions) {
    if (await canViewDecision(gate.user, d)) visible.push(d);
  }
  return NextResponse.json(visible);
}

export async function POST(req: NextRequest) {
  const gate = await requireAuth();
  if ("error" in gate) return gate.error;

  const body = await req.json();
  const {
    title,
    description,
    amountLabel,
    proposer,
    approver,
    deadline,
    impact,
    isBlocking = true,
    linkedTaskId,
    linkedProjectId,
    projectName,
  } = body;

  if (!title) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }

  let projectId = linkedProjectId as string | undefined;
  if (!projectId && projectName) {
    const p = await prisma.project.findFirst({ where: { name: projectName } });
    projectId = p?.id;
  }

  if (!projectId && linkedTaskId) {
    const t = await prisma.task.findUnique({ where: { id: linkedTaskId } });
    projectId = t?.projectId || undefined;
  }

  const code = await nextDecisionCode();

  const saved = await prisma.$transaction(async (tx) => {
    const d = await tx.decision.create({
      data: {
        code,
        title,
        description: description || null,
        amountLabel: amountLabel || null,
        proposer: proposer || gate.user.displayName || gate.user.username,
        approver: approver || null,
        deadline: deadline || null,
        impact: impact || null,
        isBlocking: !!isBlocking,
        linkedTaskId: linkedTaskId || null,
        linkedProjectId: projectId || null,
        status: "PENDING",
      },
      include: {
        linkedTask: true,
        linkedProject: true,
      },
    });

    if (linkedTaskId && isBlocking) {
      await tx.task.update({
        where: { id: linkedTaskId },
        data: {
          status: "BLOCKED",
          blocker: `Cần quyết định ${code}`,
        },
      });
      await tx.taskEvent.create({
        data: {
          taskId: linkedTaskId,
          label: "Yêu cầu quyết định",
          detail: `${code} · ${title}`,
        },
      });
    }

    if (projectId && isBlocking) {
      await tx.project.update({
        where: { id: projectId },
        data: { status: "BLOCKED" },
      });
      await tx.projectEvent.create({
        data: {
          projectId,
          action: "DECISION",
          detail: `Yêu cầu quyết định ${code}`,
          actorUserId: gate.user.id,
          newValue: "BLOCKED",
        },
      });
    }

    return d;
  });

  return NextResponse.json(saved, { status: 201 });
}
