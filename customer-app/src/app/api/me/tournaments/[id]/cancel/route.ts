import { NextRequest, NextResponse } from "next/server";
import { getSessionCustomer } from "@/lib/session";
import { cancelTournamentEntry } from "@/lib/tournament-roster";

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
    const result = await cancelTournamentEntry(customer.id, id);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json(result);
  } catch (err) {
    console.error("[me/tournaments/cancel]", err);
    return NextResponse.json({ error: "Không hủy được." }, { status: 500 });
  }
}
