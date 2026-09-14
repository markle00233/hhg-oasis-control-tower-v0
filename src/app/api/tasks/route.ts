import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const tasks = await prisma.task.findMany({
    include: { unit: true, project: true },
    orderBy: { updatedAt: "desc" },
  });
  return NextResponse.json(tasks);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const {
    title,
    priority = "P2",
    owner,
    deadline,
    status = "TODO",
    cost,
    blocker,
    unitName,
    note,
  } = body;

  if (!title) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }

  let unitId: string | undefined;
  if (unitName) {
    const unit = await prisma.unit.findUnique({ where: { name: unitName } });
    unitId = unit?.id;
  }

  const saved = await prisma.task.create({
    data: {
      title,
      priority,
      owner: owner || null,
      deadline: deadline || null,
      status,
      cost: cost != null ? Number(cost) : null,
      blocker: blocker || null,
      note: note || null,
      unitId,
    },
    include: { unit: true, project: true },
  });

  return NextResponse.json(saved, { status: 201 });
}
