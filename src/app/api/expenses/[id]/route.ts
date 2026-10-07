import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import {
  canReconcileExpense,
  canViewExpense,
  forbidden,
  nextExpenseStatusAllowed,
} from "@/lib/rbac";
import { logProjectEvent } from "@/lib/project-access";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const gate = await requireAuth();
  if ("error" in gate) return gate.error;

  const { id } = await ctx.params;
  const body = await req.json();
  const { status, humanConfirmed, category, categoryLabel, note } = body;

  const existing = await prisma.expense.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Expense not found" }, { status: 404 });
  }

  if (!(await canViewExpense(gate.user, existing))) {
    return forbidden("Không có quyền xem khoản chi này");
  }

  const data: Record<string, unknown> = {};

  if (status) {
    if (!canReconcileExpense(gate.user)) {
      return forbidden("Chỉ Admin/Finance được đối chiếu hoặc chốt chi phí");
    }
    if (!nextExpenseStatusAllowed(existing.status, String(status), gate.user)) {
      return NextResponse.json(
        {
          error: `Không thể chuyển trạng thái từ ${existing.status} sang ${status}`,
        },
        { status: 400 }
      );
    }
    data.status = String(status);
  }

  if (humanConfirmed != null) data.humanConfirmed = !!humanConfirmed;
  if (category) data.category = category;
  if (categoryLabel) data.categoryLabel = categoryLabel;

  if (!Object.keys(data).length) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  try {
    const saved = await prisma.expense.update({
      where: { id },
      data,
      include: { unit: true, linkedTask: true, linkedProject: true },
    });

    if (data.status && existing.linkedProjectId) {
      await logProjectEvent({
        projectId: existing.linkedProjectId,
        actorUserId: gate.user.id,
        action: "EXPENSE_STATUS",
        detail: note
          ? `${existing.code || id}: ${existing.status} → ${data.status} · ${note}`
          : `${existing.code || id}: ${existing.status} → ${data.status}`,
        oldValue: existing.status,
        newValue: String(data.status),
      });
    }

    return NextResponse.json(saved);
  } catch {
    return NextResponse.json({ error: "Expense not found" }, { status: 404 });
  }
}
