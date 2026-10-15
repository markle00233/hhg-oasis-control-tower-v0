import { NextResponse } from "next/server";
import { getSessionCustomer } from "@/lib/session";
import { buildHomeCardSummary } from "@/lib/service-cards";

export const dynamic = "force-dynamic";
export const preferredRegion = "sin1";

/** Home: active + upcoming cards only (no full history). */
export async function GET() {
  try {
    const customer = await getSessionCustomer();
    if (!customer) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const summary = await buildHomeCardSummary(customer.id);
    return NextResponse.json({
      ok: true,
      customer: {
        fullName: customer.fullName,
        shortId: customer.shortId,
        customerCode: customer.customerCode,
      },
      ...summary,
    });
  } catch (e) {
    console.error("[cards/summary]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}
