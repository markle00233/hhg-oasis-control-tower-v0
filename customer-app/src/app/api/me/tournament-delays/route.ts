import { NextResponse } from "next/server";
import { getSessionCustomer } from "@/lib/session";
import { listAthleteDelays } from "@/lib/tournament-roster";

export const dynamic = "force-dynamic";
export const preferredRegion = "sin1";

export async function GET() {
  try {
    const customer = await getSessionCustomer();
    if (!customer) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const delays = await listAthleteDelays(customer.id);
    return NextResponse.json({ ok: true, delays });
  } catch (err) {
    console.error("[me/tournament-delays]", err);
    return NextResponse.json({ error: "Không tải được thông báo dời giờ." }, { status: 500 });
  }
}
