import { NextRequest, NextResponse } from "next/server";
import { suggestExpense, suggestRevenue } from "@/lib/ai";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { kind = "expense", text = "", unitName } = body;

  if (kind === "revenue") {
    return NextResponse.json(suggestRevenue(text, unitName));
  }

  return NextResponse.json(suggestExpense(text, unitName));
}
