import { NextResponse } from "next/server";
import { getSessionCustomer } from "@/lib/session";
import { buildTodayAndHistory } from "@/lib/journey";

export const dynamic = "force-dynamic";
export const preferredRegion = "sin1";

/** Customer account journey: TODAY + UPCOMING + HISTORY (aggregated read model). */
export async function GET() {
  try {
    const customer = await getSessionCustomer();
    if (!customer) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const journey = await buildTodayAndHistory(customer.id);

    return NextResponse.json({
      ok: true,
      customer: {
        id: customer.id,
        customerCode: customer.customerCode,
        fullName: customer.fullName,
        phone: customer.phone,
        phoneLast4: customer.phoneLast4 || customer.shortId,
      },
      ...journey,
    });
  } catch (e) {
    console.error("[journey]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Journey failed" },
      { status: 500 }
    );
  }
}
