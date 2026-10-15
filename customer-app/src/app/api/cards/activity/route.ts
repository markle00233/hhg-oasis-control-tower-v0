import { NextResponse } from "next/server";
import { getSessionCustomer } from "@/lib/session";
import { buildActivityCards } from "@/lib/service-cards";

export const dynamic = "force-dynamic";
export const preferredRegion = "sin1";

export async function GET() {
  try {
    const customer = await getSessionCustomer();
    if (!customer) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const buckets = await buildActivityCards(customer.id);
    return NextResponse.json({ ok: true, ...buckets });
  } catch (e) {
    console.error("[cards/activity]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}
