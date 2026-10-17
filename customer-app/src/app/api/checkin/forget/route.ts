import { NextResponse } from "next/server";
import { revokeCurrentDevice, clearPendingCookie } from "@/lib/device";
import { clearCustomerSession } from "@/lib/session";

export const preferredRegion = "sin1";
export const dynamic = "force-dynamic";

/**
 * "Không phải tôi" — revoke device + clear login session.
 * Does not delete Customer record.
 */
export async function POST() {
  try {
    await revokeCurrentDevice();
    await clearPendingCookie();
    await clearCustomerSession();
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[checkin/forget]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Forget failed" },
      { status: 500 }
    );
  }
}
