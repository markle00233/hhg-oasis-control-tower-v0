import { NextRequest, NextResponse } from "next/server";
import { suggestExpense, suggestRevenue } from "@/lib/ai";
import { requireAuth } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const gate = await requireAuth();
  if ("error" in gate) return gate.error;

  const body = await req.json();
  const { kind = "expense", text = "", unitName } = body;

  if (kind === "revenue") {
    return NextResponse.json(suggestRevenue(text, unitName));
  }

  return NextResponse.json(suggestExpense(text, unitName));
}
