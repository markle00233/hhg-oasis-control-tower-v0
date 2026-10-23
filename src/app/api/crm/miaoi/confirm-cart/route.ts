import { NextRequest, NextResponse } from "next/server";
import { requireDeskZone } from "@/lib/auth";
import { confirmMiaOiCartPayment } from "@/lib/miaoi-confirm-cart";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const zone = String(body.zone || "MIA_OI").trim().toUpperCase();
    const token = String(body.token || body.cartToken || "").trim();

    if (zone !== "MIA_OI") {
      return NextResponse.json(
        { error: "Chỉ dùng cho quầy Mía Ơi." },
        { status: 400 }
      );
    }
    if (!token) {
      return NextResponse.json({ error: "Thiếu token QR." }, { status: 400 });
    }

    const gate = await requireDeskZone(zone);
    if ("error" in gate) return gate.error;

    const extraItems = Array.isArray(body.extraItems) ? body.extraItems : [];
    const pointsRedeem =
      body.pointsRedeem && typeof body.pointsRedeem === "object"
        ? (body.pointsRedeem as {
            tier?: number;
            itemId?: string;
            useAltPrice?: boolean;
          })
        : null;
    const pointsRedeemUnits = Math.max(
      0,
      Math.round(Number(body.pointsRedeemUnits) || 0)
    );
    const voucherOfferId = String(body.voucherOfferId || "").trim();
    const deskBundleId = String(body.deskBundleId || "").trim().slice(0, 40);
    const result = await confirmMiaOiCartPayment({
      token,
      staffUserId: gate.user.id,
      staffName: gate.user.displayName || gate.user.username,
      extraItems,
      pointsRedeem,
      pointsRedeemUnits,
      voucherOfferId,
      deskBundleId: deskBundleId || undefined,
    });
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status || 400 }
      );
    }
    return NextResponse.json(result);
  } catch (e) {
    console.error("[miaoi/confirm-cart]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}
