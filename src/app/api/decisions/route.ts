import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const decisions = await prisma.decision.findMany({
    orderBy: { updatedAt: "desc" },
  });
  return NextResponse.json(decisions);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const {
    title,
    amountLabel,
    proposer,
    approver,
    deadline,
    impact,
    status = "PENDING",
  } = body;

  if (!title) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }

  const saved = await prisma.decision.create({
    data: {
      title,
      amountLabel: amountLabel || null,
      proposer: proposer || null,
      approver: approver || null,
      deadline: deadline || null,
      impact: impact || null,
      status,
    },
  });

  return NextResponse.json(saved, { status: 201 });
}
