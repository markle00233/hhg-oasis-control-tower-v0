import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const task = await prisma.task.findUnique({
    where: { id },
    include: {
      unit: true,
      project: true,
      events: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(task);
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const body = await req.json();
  const {
    status,
    progress,
    blocker,
    note,
    eventLabel,
    eventDetail,
  } = body;

  const data: Record<string, unknown> = {};
  if (status != null) data.status = status;
  if (progress != null) data.progress = Number(progress);
  if (blocker !== undefined) data.blocker = blocker;
  if (note !== undefined) data.note = note;

  const saved = await prisma.$transaction(async (tx) => {
    const task = await tx.task.update({
      where: { id },
      data,
      include: {
        unit: true,
        project: true,
        events: { orderBy: { createdAt: "desc" } },
      },
    });

    if (eventLabel) {
      await tx.taskEvent.create({
        data: {
          taskId: id,
          label: eventLabel,
          detail: eventDetail || null,
        },
      });
      return tx.task.findUnique({
        where: { id },
        include: {
          unit: true,
          project: true,
          events: { orderBy: { createdAt: "desc" } },
        },
      });
    }

    return task;
  });

  return NextResponse.json(saved);
}
