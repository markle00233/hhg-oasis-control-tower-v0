import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";

export async function GET() {
  const gate = await requireAuth();
  if ("error" in gate) return gate.error;

  const issues = await prisma.issue.findMany({
    include: { unit: true },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(issues);
}

export async function POST(req: NextRequest) {
  const gate = await requireAuth();
  if ("error" in gate) return gate.error;

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
