import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const issues = await prisma.issue.findMany({
    include: { unit: true },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(issues);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const {
    category,
    note,
    areaLabel,
    unitName,
    status = "OPEN",
  } = body;

  if (!category) {
    return NextResponse.json({ error: "category is required" }, { status: 400 });
  }

  let unitId: string | undefined;
  if (unitName) {
    const unit = await prisma.unit.findUnique({ where: { name: unitName } });
    unitId = unit?.id;
  }

  const saved = await prisma.issue.create({
    data: {
      category,
      note: note || null,
      areaLabel: areaLabel || null,
      unitId,
      status,
    },
    include: { unit: true },
  });

  return NextResponse.json(saved, { status: 201 });
}
