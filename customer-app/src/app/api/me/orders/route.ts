import { NextRequest, NextResponse } from "next/server";
import { getSessionCustomer } from "@/lib/session";
import { CancelOrderError, cancelCustomerOrder } from "@/lib/cancel-order";

export const dynamic = "force-dynamic";

/** Customer cancels a pending Mía Ơi / Olympic order from today (not after staff confirm). */
export async function DELETE(req: NextRequest) {
  try {
    const customer = await getSessionCustomer();
    if (!customer) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const body = await req.json().catch(() => ({}));
    const orderId = String(
      body.orderId || req.nextUrl.searchParams.get("orderId") || ""
    ).trim();
    if (!orderId) {
      return NextResponse.json({ error: "Thiếu đơn." }, { status: 400 });
    }
    const result = await cancelCustomerOrder(customer.id, orderId);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    if (e instanceof CancelOrderError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("[me/orders DELETE]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Không huỷ được đơn" },
      { status: 500 }
    );
  }
}
