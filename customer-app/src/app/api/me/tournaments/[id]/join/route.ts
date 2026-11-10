import { NextRequest, NextResponse } from "next/server";
import { getSessionCustomer } from "@/lib/session";
import { joinTournament } from "@/lib/tournament-roster";

export const dynamic = "force-dynamic";
export const preferredRegion = "sin1";

export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const customer = await getSessionCustomer();
    if (!customer) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id } = await ctx.params;
    const result = await joinTournament(customer.id, id);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json(result);
  } catch (err) {
    console.error("[me/tournaments/join]", err);
    return NextResponse.json({ error: "Không đăng ký được." }, { status: 500 });
  }
}
