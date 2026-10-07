import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { canResolveDecision, canViewDecision, forbidden } from "@/lib/rbac";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const gate = await requireAuth();
  if ("error" in gate) return gate.error;

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

  if (!(await canViewDecision(gate.user, existing))) {
    return forbidden("Không có quyền xem quyết định này");
  }
  if (!canResolveDecision(gate.user, existing)) {
    return forbidden("Chỉ người duyệt được chỉ định hoặc Admin mới phê duyệt");
  }

  // When decision is resolved (approved/rejected), clear blocking label semantics
  const clearBlocking =
    status === "APPROVED" || status === "REJECTED";

  const saved = await prisma.$transaction(async (tx) => {
    const d = await tx.decision.update({
      where: { id },
      data: {
        status,
        resolutionNote: resolutionNote || null,
        resolvedBy: resolvedBy || gate.user.displayName || gate.user.username,
        resolvedAt: new Date(),
        ...(clearBlocking ? { isBlocking: false } : {}),
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

    const projectId = existing.linkedProjectId;
    if (projectId && existing.isBlocking) {
      if (status === "APPROVED") {
        const otherBlocking = await tx.decision.count({
          where: {
            linkedProjectId: projectId,
            id: { not: id },
            isBlocking: true,
            status: { in: ["PENDING", "NEEDS_INFO"] },
          },
        });
        if (otherBlocking === 0) {
          await tx.project.update({
            where: { id: projectId },
            data: { status: "DOING" },
          });
        }
        await tx.projectEvent.create({
          data: {
            projectId,
            action: "DECISION",
            detail: `Duyệt ${existing.code || id}`,
            actorUserId: gate.user.id,
            newValue: otherBlocking === 0 ? "DOING" : "BLOCKED",
          },
        });
      } else if (status === "NEEDS_INFO" || status === "REJECTED") {
        await tx.project.update({
          where: { id: projectId },
          data: { status: "BLOCKED" },
        });
        await tx.projectEvent.create({
          data: {
            projectId,
            action: "DECISION",
            detail:
              status === "NEEDS_INFO"
                ? `Cần bổ sung ${existing.code || id}`
                : `Từ chối ${existing.code || id}`,
            actorUserId: gate.user.id,
            newValue: "BLOCKED",
          },
        });
      }
    }

    // Cost proposal → Expense when Admin approves (amountLabel = VND number).
    if (status === "APPROVED") {
      const amount = parseVndAmount(existing.amountLabel);
      const isCostProposal =
        amount > 0 &&
        (String(existing.description || "").includes("COST_PROPOSAL") ||
          String(existing.title || "").startsWith("Chi phí đề xuất"));
      if (isCostProposal) {
        let unitId: string | null = null;
        const unitName = (existing.impact || "").trim();
        if (unitName) {
          const unit = await tx.unit.findUnique({ where: { name: unitName } });
          unitId = unit?.id ?? null;
        }
        if (!unitId && projectId) {
          const proj = await tx.project.findUnique({
            where: { id: projectId },
            select: { unitId: true },
          });
          unitId = proj?.unitId ?? null;
        }

        const expCount = await tx.expense.count();
        const code = `CP-${String(expCount + 1).padStart(4, "0")}`;
        const proposer =
          existing.proposer || gate.user.displayName || gate.user.username;
        await tx.expense.create({
          data: {
            code,
            category: "PROPOSED",
            categoryLabel: "Chi phí đề xuất",
            amount,
            content: `${proposer} đề xuất · ${existing.title.replace(/^Chi phí đề xuất:\s*/i, "")}`,
            source: `Đề xuất:${proposer}`,
            taskRef: existing.code || id,
            status: "PROVISIONAL",
            humanConfirmed: true,
            unitId,
            linkedProjectId: projectId || null,
            linkedTaskId: existing.linkedTaskId || null,
          },
        });
        if (projectId) {
          await tx.projectEvent.create({
            data: {
              projectId,
              action: "EXPENSE",
              detail: `Chi phí duyệt ${code} · ${amount.toLocaleString("vi-VN")}đ`,
              actorUserId: gate.user.id,
              newValue: String(amount),
            },
          });
        }
      }
    }

    return d;
  });

  return NextResponse.json(saved);
}

function parseVndAmount(raw: string | null | undefined): number {
  if (!raw) return 0;
  const digits = String(raw).replace(/[^\d]/g, "");
  if (!digits) return 0;
  const n = Number(digits);
  return Number.isFinite(n) && n > 0 ? n : 0;
}
