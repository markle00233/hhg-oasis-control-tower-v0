import { NextResponse } from "next/server";
import { getSessionCustomer } from "@/lib/session";
import { ensureIdentityToken, identityQrPayload } from "@/lib/identity-qr";
import { isVipActive, vipExpiryLabel } from "@/lib/vip";

export const dynamic = "force-dynamic";
export const preferredRegion = "sin1";

/** My Oasis QR — opaque identity token for staff scan. */
export async function GET() {
  try {
    const customer = await getSessionCustomer();
    if (!customer) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const token = await ensureIdentityToken(customer.id);
    const vip = isVipActive({
      segment: customer.segment,
      vipExpiresAt: customer.vipExpiresAt,
    });
    return NextResponse.json({
      ok: true,
      token,
      payload: identityQrPayload(token),
      vip,
      customer: {
        fullName: customer.fullName,
        customerCode: customer.customerCode,
        shortId: customer.shortId,
        segment: customer.segment,
        vipPlanLabel: customer.vipPlanLabel || null,
        vipExpiresLabel: vipExpiryLabel(customer.vipExpiresAt),
      },
    });
  } catch (e) {
    console.error("[me/qr]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}
