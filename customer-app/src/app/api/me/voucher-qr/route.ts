import { NextRequest, NextResponse } from "next/server";
import { getSessionCustomer } from "@/lib/session";
import { issueVoucherPasses } from "@/lib/voucher-pass";

export const dynamic = "force-dynamic";

/** Mint (or reuse) a staff-scan QR for each Spa / Lòng Nướng voucher. */
export async function POST(req: NextRequest) {
  try {
    const customer = await getSessionCustomer();
    if (!customer) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const body = await req.json().catch(() => ({}));
    const offerIds = Array.isArray(body.offerIds)
      ? body.offerIds.map((id: unknown) => String(id || ""))
      : [String(body.offerId || "")];
    const passes = await issueVoucherPasses(customer.id, offerIds);
    return NextResponse.json({ ok: true, passes });
  } catch (e) {
    const status =
      e && typeof e === "object" && "status" in e
        ? Number((e as { status: number }).status) || 500
        : 500;
    if (status >= 500) console.error("[me/voucher-qr]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Không tạo được QR voucher" },
      { status }
    );
  }
}
