import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { findServiceCartByToken } from "@/lib/service-cart";
import { bookingIdsInItems, relabelItemNames } from "@/lib/vn-time";

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
    const ids = bookingIdsInItems(cart.items);
    const clocks = new Map<string, { startAt: Date; endAt: Date }>();
    if (ids.length) {
      const found = await prisma.appBooking.findMany({
        where: { id: { in: ids } },
        select: { id: true, startAt: true, endAt: true },
      });
      for (const b of found) clocks.set(b.id, b);
    }
    return NextResponse.json({
      ok: true,
      cart: {
        token: cart.token,
        zoneCode: cart.zoneCode,
        zoneName: cart.zoneName,
        items: relabelItemNames(cart.items, clocks),
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
