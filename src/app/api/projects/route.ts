import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const projects = await prisma.project.findMany({
    include: { unit: true, tasks: true },
    orderBy: { updatedAt: "desc" },
  });
  return NextResponse.json(projects);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const {
    name,
    category,
    owner,
    budget,
    deadline,
    readiness = 0,
    status = "ON_TRACK",
    unitName,
  } = body;

  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  let unitId: string | undefined;
  if (unitName) {
    const unit = await prisma.unit.findUnique({ where: { name: unitName } });
    unitId = unit?.id;
  }

  const saved = await prisma.project.create({
    data: {
      name,
      category: category || null,
      owner: owner || null,
      budget: budget != null ? Number(budget) : null,
      deadline: deadline || null,
      readiness: Number(readiness) || 0,
      status,
      unitId,
    },
    include: { unit: true, tasks: true },
  });

  return NextResponse.json(saved, { status: 201 });
}
