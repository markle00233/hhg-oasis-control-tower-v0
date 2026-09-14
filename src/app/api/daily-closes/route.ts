import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get("date") ?? undefined;
  const closes = await prisma.dailyClose.findMany({
    where: date ? { date } : undefined,
    include: { unit: true },
    orderBy: [{ date: "desc" }, { updatedAt: "desc" }],
  });
  return NextResponse.json(closes);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const {
    unitName,
    date = new Date().toISOString().slice(0, 10),
    revenue,
    cashCollected,
    guestCount,
    source = "MANUAL",
    note,
    status = "PROVISIONAL",
  } = body;

  if (!unitName || revenue == null) {
    return NextResponse.json(
      { error: "unitName and revenue are required" },
      { status: 400 }
    );
  }

  const unit = await prisma.unit.findUnique({ where: { name: unitName } });
  if (!unit) {
    return NextResponse.json({ error: `Unit not found: ${unitName}` }, { status: 404 });
  }

  const saved = await prisma.dailyClose.upsert({
    where: { unitId_date: { unitId: unit.id, date } },
    create: {
      unitId: unit.id,
      date,
      revenue: Number(revenue),
      cashCollected: Number(cashCollected ?? revenue),
      guestCount: guestCount != null ? Number(guestCount) : null,
      source,
      note: note || null,
      status,
    },
    update: {
      revenue: Number(revenue),
      cashCollected: Number(cashCollected ?? revenue),
      guestCount: guestCount != null ? Number(guestCount) : null,
      source,
      note: note || null,
      status,
    },
    include: { unit: true },
  });

  return NextResponse.json(saved, { status: 201 });
}
