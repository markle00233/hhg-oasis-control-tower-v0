import { NextRequest, NextResponse } from "next/server";
import { findServiceCartByToken } from "@/lib/service-cart";

export const dynamic = "force-dynamic";
export const preferredRegion = "sin1";

/** Public resolve of service-cart QR (staff / deep link). */
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await ctx.params;
    const cart = await findServiceCartByToken(token);
    if (!cart) {
      return NextResponse.json({ error: "QR không hợp lệ." }, { status: 404 });
    }
    return NextResponse.json({
      ok: true,
      cart: {
        token: cart.token,
        zoneCode: cart.zoneCode,
        zoneName: cart.zoneName,
        items: cart.items,
        totalVnd: cart.totalVnd,
        status: cart.status,
        expiresAt: cart.expiresAt,
        customer: cart.customer,
      },
    });
  } catch (e) {
    console.error("[cart/token]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}
