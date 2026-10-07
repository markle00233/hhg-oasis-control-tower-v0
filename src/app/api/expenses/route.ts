import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import {
  accessibleProjectIds,
  canCreateExpenseOnProject,
  canManageFinance,
  forbidden,
} from "@/lib/rbac";
import {
  codeForCategoryLabel,
  labelForCategory,
} from "@/lib/ai";

export async function GET() {
  const gate = await requireAuth();
  if ("error" in gate) return gate.error;

  const expenses = await prisma.expense.findMany({
    include: { unit: true, linkedTask: true, linkedProject: true },
    orderBy: { createdAt: "desc" },
  });

  if (canManageFinance(gate.user)) {
    return NextResponse.json(expenses);
  }

  const scope = await accessibleProjectIds(gate.user);
  const visible = expenses.filter((e) => {
    if (e.linkedProjectId && scope !== "ALL" && scope.has(e.linkedProjectId)) {
      return true;
    }
    if (e.linkedTask?.projectId && scope !== "ALL" && scope.has(e.linkedTask.projectId)) {
      return true;
    }
    return false;
  });
  return NextResponse.json(visible);
}

export async function POST(req: NextRequest) {
  const gate = await requireAuth();
  if ("error" in gate) return gate.error;

  const body = await req.json();
  const {
    unitName,
    category,
    categoryLabel,
    amount,
    content,
    source,
    taskRef,
    linkedTaskId,
    linkedProjectId,
    status = "PROVISIONAL",
    aiSuggestion,
    aiConfidence,
    humanConfirmed = true,
  } = body;

  if (amount == null || Number(amount) <= 0) {
    return NextResponse.json({ error: "Số tiền phải > 0" }, { status: 400 });
  }

  const projectId = linkedProjectId || null;
  if (!(await canCreateExpenseOnProject(gate.user, projectId))) {
    return forbidden(
      projectId
        ? "Không có quyền ghi chi phí trên Task này"
        : "Người dùng thường chỉ được ghi chi phí gắn với Task mình tham gia"
    );
  }

  // Non-finance cannot set reconciled/locked on create
  let safeStatus = String(status || "PROVISIONAL");
  if (!canManageFinance(gate.user)) {
    safeStatus = "PROVISIONAL";
  }

  let unitId: string | undefined;
  if (unitName) {
    const unit = await prisma.unit.findUnique({ where: { name: unitName } });
    unitId = unit?.id;
  }

  const catCode =
    category ||
    (categoryLabel ? codeForCategoryLabel(categoryLabel) : "UNCLASSIFIED");
  const catLabel = categoryLabel || labelForCategory(catCode);

  const count = await prisma.expense.count();
  const code = `CP-${String(count + 100).padStart(4, "0")}`;

  const saved = await prisma.expense.create({
    data: {
      code,
      unitId,
      category: catCode,
      categoryLabel: catLabel,
      amount: Number(amount),
      content: content || null,
      source: source || null,
      taskRef: taskRef || null,
      linkedTaskId: linkedTaskId || null,
      linkedProjectId: projectId,
      status: safeStatus,
      aiSuggestion: aiSuggestion || null,
      aiConfidence: aiConfidence != null ? Number(aiConfidence) : null,
      humanConfirmed: !!humanConfirmed,
    },
    include: { unit: true, linkedTask: true, linkedProject: true },
  });

  return NextResponse.json(saved, { status: 201 });
}
