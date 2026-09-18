import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  codeForCategoryLabel,
  labelForCategory,
  suggestExpense,
} from "@/lib/ai";

export async function GET() {
  const expenses = await prisma.expense.findMany({
    include: { unit: true, linkedTask: true },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(expenses);
}

export async function POST(req: NextRequest) {
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
    status = "PROVISIONAL",
    aiSuggestion,
    aiConfidence,
    humanConfirmed = true,
  } = body;

  if (amount == null) {
    return NextResponse.json({ error: "amount is required" }, { status: 400 });
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
      status,
      aiSuggestion: aiSuggestion || null,
      aiConfidence: aiConfidence != null ? Number(aiConfidence) : null,
      humanConfirmed: !!humanConfirmed,
    },
    include: { unit: true, linkedTask: true },
  });

  return NextResponse.json(saved, { status: 201 });
}
