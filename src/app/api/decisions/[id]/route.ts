import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const body = await req.json();
  const { status, resolutionNote, resolvedBy } = body;

  if (!status) {
    return NextResponse.json({ error: "status is required" }, { status: 400 });
  }

  const existing = await prisma.decision.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const saved = await prisma.$transaction(async (tx) => {
    const d = await tx.decision.update({
      where: { id },
      data: {
        status,
        resolutionNote: resolutionNote || null,
        resolvedBy: resolvedBy || null,
        resolvedAt: new Date(),
      },
      include: { linkedTask: true, linkedProject: true },
    });

    const taskId = existing.linkedTaskId;
    if (taskId) {
      if (status === "APPROVED") {
        const otherBlocking = await tx.decision.count({
          where: {
            linkedTaskId: taskId,
            id: { not: id },
            isBlocking: true,
            status: { in: ["PENDING", "NEEDS_INFO"] },
          },
        });
        if (otherBlocking === 0) {
          await tx.task.update({
            where: { id: taskId },
            data: {
              blocker: null,
              status: "DOING",
            },
          });
        }
        await tx.taskEvent.create({
          data: {
            taskId,
            label: "Quyết định đã duyệt",
            detail: `${existing.code || id} · công việc được tiếp tục (không tự hoàn thành).`,
          },
        });
      } else if (status === "NEEDS_INFO") {
        await tx.task.update({
          where: { id: taskId },
          data: {
            status: "BLOCKED",
            blocker: "Chờ bổ sung cho quyết định",
          },
        });
        await tx.taskEvent.create({
          data: {
            taskId,
            label: "Quyết định cần bổ sung",
            detail: existing.code || id,
          },
        });
      } else if (status === "REJECTED") {
        await tx.task.update({
          where: { id: taskId },
          data: {
            status: "BLOCKED",
            blocker: "Cần điều chỉnh phương án sau khi bị từ chối",
          },
        });
        await tx.taskEvent.create({
          data: {
            taskId,
            label: "Quyết định bị từ chối",
            detail: existing.code || id,
          },
        });
      }
    }

    return d;
  });

  return NextResponse.json(saved);
}
