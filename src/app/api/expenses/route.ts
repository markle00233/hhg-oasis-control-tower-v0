import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const expenses = await prisma.expense.findMany({
    include: { unit: true },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(expenses);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const {
    unitName,
    category = "OPEX",
    amount,
    content,
    source,
    taskRef,
    status = "PROVISIONAL",
  } = body;

  if (amount == null) {
    return NextResponse.json({ error: "amount is required" }, { status: 400 });
  }

  let unitId: string | undefined;
  if (unitName) {
    const unit = await prisma.unit.findUnique({ where: { name: unitName } });
    if (!unit) {
      return NextResponse.json({ error: `Unit not found: ${unitName}` }, { status: 404 });
    }
    unitId = unit.id;
  }

  const saved = await prisma.expense.create({
    data: {
      unitId,
      category,
      amount: Number(amount),
      content: content || null,
      source: source || null,
      taskRef: taskRef || null,
      status,
    },
    include: { unit: true },
  });

  return NextResponse.json(saved, { status: 201 });
}
