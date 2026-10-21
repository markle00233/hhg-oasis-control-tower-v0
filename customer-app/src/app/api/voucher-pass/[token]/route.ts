import { NextRequest, NextResponse } from "next/server";
import { findVoucherPass } from "@/lib/voucher-pass";

export const dynamic = "force-dynamic";

/** Public status of a voucher QR (customer display + after staff scan). */
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await ctx.params;
    const pass = await findVoucherPass(token);
    if (!pass) {
      return NextResponse.json({ error: "QR voucher không hợp lệ." }, { status: 404 });
    }
    return NextResponse.json({ ok: true, pass });
  } catch (e) {
    console.error("[voucher-pass]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}
