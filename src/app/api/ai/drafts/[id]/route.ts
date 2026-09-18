import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const body = await req.json();
  const {
    suggestedTitle,
    suggestedUnit,
    suggestedOwner,
    suggestedType,
    suggestedPriority,
    suggestedDeadline,
    reason,
  } = body;

  const saved = await prisma.aiTaskDraft.update({
    where: { id },
    data: {
      suggestedTitle,
      suggestedUnit,
      suggestedOwner,
      suggestedType,
      suggestedPriority,
      suggestedDeadline,
      reason,
      reviewStatus: "EDITED",
    },
  });
  return NextResponse.json(saved);
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const body = await req.json();
  const { action = "confirm" } = body; // confirm | skip | merge

  const draft = await prisma.aiTaskDraft.findUnique({
    where: { id },
    include: { message: true },
  });
  if (!draft) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (action === "skip") {
    const saved = await prisma.aiTaskDraft.update({
      where: { id },
      data: { reviewStatus: "SKIPPED" },
    });
    return NextResponse.json(saved);
  }

  if (action === "merge") {
    if (!draft.duplicateTaskId) {
      return NextResponse.json(
        { error: "No duplicate task to merge" },
        { status: 400 }
      );
    }
    await prisma.taskEvent.create({
      data: {
        taskId: draft.duplicateTaskId,
        label: "Gộp từ Hộp thư AI",
        detail: draft.suggestedTitle + " · " + (draft.reason || ""),
      },
    });
    const saved = await prisma.aiTaskDraft.update({
      where: { id },
      data: {
        reviewStatus: "MERGED",
        createdTaskId: draft.duplicateTaskId,
      },
    });
    return NextResponse.json(saved);
  }

  // confirm → create task
  let unitId: string | undefined;
  if (draft.suggestedUnit) {
    const unit = await prisma.unit.findUnique({
      where: { name: draft.suggestedUnit },
    });
    unitId = unit?.id;
  }

  const count = await prisma.task.count();
  const code = `CV-${String(2200 + count)}`;

  const task = await prisma.task.create({
    data: {
      code,
      title: draft.suggestedTitle,
      owner: draft.suggestedOwner,
      priority: draft.suggestedPriority || "P2",
      deadline: draft.suggestedDeadline,
      unitId,
      status: "TODO",
      progress: 0,
      note: draft.reason,
      sourceMessageId: draft.messageId,
      sourceDraftId: draft.id,
      events: {
        create: {
          label: "Tạo từ Hộp thư AI",
          detail: `Tin nhắn ${draft.messageId.slice(0, 8)} · độ tin cậy ${draft.confidence}%`,
        },
      },
    },
  });

  const saved = await prisma.aiTaskDraft.update({
    where: { id },
    data: {
      reviewStatus: "CONFIRMED",
      createdTaskId: task.id,
    },
  });

  return NextResponse.json({ draft: saved, task });
}
