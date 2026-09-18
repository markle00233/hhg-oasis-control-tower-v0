import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

async function nextDecisionCode() {
  const count = await prisma.decision.count();
  return `QD-${String(count + 1).padStart(4, "0")}`;
}

export async function GET() {
  const decisions = await prisma.decision.findMany({
    include: {
      linkedTask: { include: { unit: true, project: true } },
      linkedProject: true,
    },
    orderBy: { updatedAt: "desc" },
  });
  return NextResponse.json(decisions);
}

export async function POST(req: NextRequest) {
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
        proposer: proposer || null,
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

    return d;
  });

  return NextResponse.json(saved, { status: 201 });
}
