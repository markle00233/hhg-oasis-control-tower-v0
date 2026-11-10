import { NextResponse } from "next/server";
import { getSessionCustomer } from "@/lib/session";
import { listTournaments } from "@/lib/tournament-roster";

export const dynamic = "force-dynamic";
export const preferredRegion = "sin1";

export async function GET() {
  try {
    const customer = await getSessionCustomer();
    if (!customer) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const tournaments = await listTournaments(customer.id);
    return NextResponse.json({ ok: true, tournaments });
  } catch (err) {
    console.error("[me/tournaments]", err);
    return NextResponse.json({ error: "Không tải được giải." }, { status: 500 });
  }
}
