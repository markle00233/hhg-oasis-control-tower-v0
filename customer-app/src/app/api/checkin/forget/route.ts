import { NextResponse } from "next/server";
import { revokeCurrentDevice } from "@/lib/device";

export const preferredRegion = "sin1";
export const dynamic = "force-dynamic";

/** "Không phải bạn?" — revoke device cookie, do not delete Customer. */
export async function POST() {
  try {
    await revokeCurrentDevice();
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[checkin/forget]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Forget failed" },
      { status: 500 }
    );
  }
}
