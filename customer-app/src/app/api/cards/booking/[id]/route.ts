import { NextRequest, NextResponse } from "next/server";
import { getSessionCustomer } from "@/lib/session";
import { getBookingCardDetail } from "@/lib/service-cards";

export const dynamic = "force-dynamic";
export const preferredRegion = "sin1";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const customer = await getSessionCustomer();
    if (!customer) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id } = await ctx.params;
    const detail = await getBookingCardDetail(customer.id, id);
    if (!detail) {
      return NextResponse.json({ error: "Không tìm thấy booking" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, booking: detail });
  } catch (e) {
    console.error("[cards/booking]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}
